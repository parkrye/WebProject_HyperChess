/**
 * Texel 튜닝: 수순이 저장된 대국 기록을 재생해 국면을 뽑고,
 * 평가 점수가 실제 결과를 잘 예측하도록 평가 가중치(src/weights.ts)를 조정한다.
 *
 *   npm run tune                          # 기록 전체로 튜닝 → reports/tune-*.md, 적용 여부를 묻는다
 *   npm run tune -- --per-game 16 --epochs 600 --yes      # 묻지 않고 보고서만
 *   npm run tune -- --apply                # 끝나면 바로 weights.ts에 적용
 *
 * 옵션
 *   --data a.jsonl,b.jsonl   기록 파일 (기본: packages/server/data/simulation.jsonl, results.jsonl)
 *   --per-game N             한 판에서 뽑을 국면 수 (기본 16)
 *   --skip-opening N         앞부분 N수는 제외 (기본 8, 무작위 오프닝 영향 제거)
 *   --epochs N               최대 학습 반복 (기본 800)
 *   --lr X                   학습률 (기본 1)
 *   --l2 X                   기존 가중치에서 멀어지는 것에 대한 벌점 (기본 1e-7)
 *   --valid X                검증용으로 떼어 둘 판 비율 (기본 0.1)
 *   --min-games N            이보다 기록이 적으면 중단 (기본 200)
 */
import { applyAction, createGame, isInCheck, type Action, type Color, type GameState } from '@hyperchess/engine';
import type { GameRecord } from '@hyperchess/protocol';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { constants, setPriority } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { extractFeatures, FIXED_KEYS, weightObject, weightVector, WEIGHT_KEYS } from '../src/features';
import { WEIGHTS } from '../src/weights';
import { fitK, meanSquaredError, train, type Dataset } from './texel';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const REPORT_DIR = join(REPO_ROOT, 'reports');
const WEIGHTS_FILE = join(REPO_ROOT, 'packages', 'ai', 'src', 'weights.ts');
const DEFAULT_DATA = ['simulation.jsonl', 'results.jsonl'].map((name) => join(REPO_ROOT, 'packages', 'server', 'data', name));

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
const hasFlag = (name: string) => process.argv.includes(`--${name}`);
const numberArg = (name: string, fallback: number) => {
  const value = Number(argValue(name));
  return Number.isFinite(value) && argValue(name) !== undefined ? value : fallback;
};

interface Settings {
  readonly dataFiles: readonly string[];
  readonly perGame: number;
  readonly skipOpening: number;
  readonly epochs: number;
  readonly learningRate: number;
  readonly l2: number;
  readonly validRatio: number;
  readonly minGames: number;
}

const settings: Settings = {
  dataFiles: argValue('data')?.split(',').map((file) => file.trim()) ?? DEFAULT_DATA,
  perGame: numberArg('per-game', 16),
  skipOpening: numberArg('skip-opening', 8),
  epochs: numberArg('epochs', 800),
  learningRate: numberArg('lr', 1),
  l2: numberArg('l2', 1e-7),
  validRatio: numberArg('valid', 0.1),
  minGames: numberArg('min-games', 200),
};

function seededRandom(seed: number): () => number {
  let value = seed >>> 0 || 1;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

const formatDuration = (ms: number) => {
  const total = Math.round(ms / 1000);
  return total >= 60 ? `${Math.floor(total / 60)}분 ${total % 60}초` : `${total}초`;
};

/* ---------- 데이터 ---------- */

type PlayableRecord = GameRecord & { readonly actions: readonly Action[] };

function loadRecords(files: readonly string[]): PlayableRecord[] {
  const records: PlayableRecord[] = [];
  for (const file of files) {
    if (!existsSync(file)) {
      console.log(`  (없음) ${relative(REPO_ROOT, file)}`);
      continue;
    }
    let count = 0;
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const record = JSON.parse(line) as GameRecord;
        if (!record.actions?.length) continue;
        records.push(record as PlayableRecord);
        count++;
      } catch {
        // 깨진 줄은 건너뛴다
      }
    }
    console.log(`  ${String(count).padStart(6)}판  ${relative(REPO_ROOT, file)}`);
  }
  return records;
}

/** 늘어나는 Float32Array 버퍼 */
class Growable {
  private buffer = new Float32Array(1 << 16);
  length = 0;
  push(values: ArrayLike<number>) {
    if (this.length + values.length > this.buffer.length) {
      const next = new Float32Array(Math.max(this.buffer.length * 2, this.length + values.length));
      next.set(this.buffer.subarray(0, this.length));
      this.buffer = next;
    }
    this.buffer.set(values, this.length);
    this.length += values.length;
  }
  toArray() {
    return this.buffer.slice(0, this.length);
  }
}

const whiteScore = (winner: Color | null) => (winner === 'w' ? 1 : winner === 'b' ? 0 : 0.5);

/** 조용한 국면만 쓴다: 진행 중이고, 체크가 아니고, 방금 잡기가 일어나지 않은 국면 */
function isQuiet(state: GameState): boolean {
  if (state.result.kind !== 'ongoing' || isInCheck(state, state.turn)) return false;
  const last = state.log[state.log.length - 1];
  return !last || !last.changes?.some((change) => change.type === 'remove');
}

interface BuildResult {
  readonly train: Dataset;
  readonly valid: Dataset;
  readonly games: { readonly used: number; readonly skipped: number };
}

function buildDatasets(records: readonly PlayableRecord[]): BuildResult {
  const dims = WEIGHT_KEYS.length;
  const random = seededRandom(20260915);
  const sets = { train: { features: new Growable(), labels: new Growable() }, valid: { features: new Growable(), labels: new Growable() } };
  const features = new Float64Array(dims);
  const startedAt = performance.now();
  let used = 0;
  let skipped = 0;

  records.forEach((record, index) => {
    const target = random() < settings.validRatio ? sets.valid : sets.train;
    const label = whiteScore(record.winner);
    const quiet: GameState[] = [];
    let state = createGame({ abilities: record.abilities });
    try {
      record.actions.forEach((action, ply) => {
        state = applyAction(state, action, 0);
        if (ply + 1 >= settings.skipOpening && isQuiet(state)) quiet.push(state);
      });
    } catch {
      // 현재 규칙으로 재생되지 않는 옛 기록
      skipped++;
      return;
    }
    used++;

    // 한 판에서 고르게 perGame개를 무작위로 뽑는다
    for (let i = quiet.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [quiet[i], quiet[j]] = [quiet[j], quiet[i]];
    }
    for (const position of quiet.slice(0, settings.perGame)) {
      target.features.push(extractFeatures(position, features));
      target.labels.push([label]);
    }

    if ((index + 1) % 1000 === 0) {
      console.log(`  재생 ${index + 1}/${records.length}판 · ${formatDuration(performance.now() - startedAt)}`);
    }
  });

  const toDataset = (set: typeof sets.train): Dataset => ({
    features: set.features.toArray(),
    labels: set.labels.toArray(),
    count: set.labels.length,
    dims,
  });
  return { train: toDataset(sets.train), valid: toDataset(sets.valid), games: { used, skipped } };
}

/* ---------- 보고서 · 적용 ---------- */

const stamp = () => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
};

const round = (value: number) => Math.round(value);

interface Outcome {
  readonly k: number;
  readonly before: { readonly train: number; readonly valid: number };
  readonly after: { readonly train: number; readonly valid: number };
  readonly bestEpoch: number;
  readonly tuned: Record<string, number>;
}

function writeReport(result: BuildResult, outcome: Outcome, elapsedMs: number): string {
  mkdirSync(REPORT_DIR, { recursive: true });
  const base = join(REPORT_DIR, `tune-${stamp()}`);
  const rows = WEIGHT_KEYS.map((key) => {
    const before = WEIGHTS[key] ?? 0;
    const after = round(outcome.tuned[key]);
    const diff = after - before;
    return `| ${key} | ${before} | ${after} | ${diff > 0 ? '+' : ''}${diff} |`;
  });
  const md = [
    `# 평가 가중치 튜닝 ${new Date().toLocaleString('ko-KR')}`,
    '',
    `- 기록: ${result.games.used}판 사용 (재생 실패 ${result.games.skipped}판) · 국면 학습 ${result.train.count.toLocaleString()} / 검증 ${result.valid.count.toLocaleString()}`,
    `- 판당 국면 ${settings.perGame}개 · 앞 ${settings.skipOpening}수 제외 · 학습률 ${settings.learningRate} · L2 ${settings.l2}`,
    `- 시그모이드 K ${outcome.k.toFixed(3)} · 최적 반복 ${outcome.bestEpoch} · 소요 ${formatDuration(elapsedMs)}`,
    `- 예측 오차(MSE) 학습 ${outcome.before.train.toFixed(5)} → ${outcome.after.train.toFixed(5)} · 검증 ${outcome.before.valid.toFixed(5)} → ${outcome.after.valid.toFixed(5)}`,
    '',
    '| 항목 | 기존 | 튜닝 | 차이 |',
    '|---|---|---|---|',
    ...rows,
    '',
  ].join('\n');
  writeFileSync(`${base}.md`, md);
  writeFileSync(`${base}.json`, JSON.stringify({ settings, games: result.games, ...outcome }, null, 2));
  return `${base}.md`;
}

function applyWeights(tuned: Record<string, number>, reportPath: string) {
  const lines = WEIGHT_KEYS.map((key) => `  ${/^[a-zA-Z]+$/.test(key) ? key : `'${key}'`}: ${round(tuned[key])},`);
  const source = [
    '/**',
    ' * 평가 가중치 (센티폰 단위, 폰 = 100 고정).',
    ' * 부호가 있는 값이다: 음수는 감점 항목.',
    ' * tools/tune.ts(Texel 튜닝)의 --apply가 이 파일을 다시 쓴다.',
    ` * 마지막 튜닝: ${relative(REPO_ROOT, reportPath).split('\\').join('/')}`,
    ' */',
    'export const WEIGHTS: Readonly<Record<string, number>> = {',
    ...lines,
    '};',
    '',
  ].join('\n');
  writeFileSync(WEIGHTS_FILE, source);
  console.log(`\n적용 완료: ${relative(REPO_ROOT, WEIGHTS_FILE)} (AI 강도·밸런스가 달라지므로 밸런스를 다시 측정하세요)`);
}

async function confirmApply(): Promise<boolean> {
  if (hasFlag('apply')) return true;
  if (hasFlag('yes') || !process.stdin.isTTY) return false;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = (await rl.question('\n이 가중치를 weights.ts에 적용할까요? (y/N): ')).trim().toLowerCase();
  rl.close();
  return answer === 'y' || answer === 'yes';
}

/* ---------- 실행 ---------- */

async function main() {
  try {
    setPriority(constants.priority.PRIORITY_LOW);
  } catch {
    // 우선순위를 못 바꿔도 계속한다
  }
  const startedAt = performance.now();

  console.log('기록 읽는 중…');
  const records = loadRecords(settings.dataFiles);
  if (records.length < settings.minGames) {
    console.log(`\n수순이 저장된 기록이 ${records.length}판뿐입니다 (최소 ${settings.minGames}판). 밸런스 측정·AI 내전으로 기록을 더 모은 뒤 실행하세요.`);
    return;
  }

  console.log(`\n국면 추출 중… (${records.length}판)`);
  const result = buildDatasets(records);
  console.log(`  학습 국면 ${result.train.count.toLocaleString()} · 검증 국면 ${result.valid.count.toLocaleString()}`);

  const initial = weightVector(WEIGHTS);
  const k = fitK(result.train, initial);
  const before = { train: meanSquaredError(result.train, initial, k), valid: meanSquaredError(result.valid, initial, k) };
  console.log(`\n시그모이드 K = ${k.toFixed(3)} · 기존 가중치 오차: 학습 ${before.train.toFixed(5)} / 검증 ${before.valid.toFixed(5)}`);

  console.log('\n학습 중…');
  const trained = train(result.train, result.valid, initial, k, {
    epochs: settings.epochs,
    learningRate: settings.learningRate,
    l2: settings.l2,
    fixed: WEIGHT_KEYS.map((key) => FIXED_KEYS.has(key)),
    patience: 60,
    onEpoch: (epoch, trainError, validError) => {
      if (epoch % 50 === 0) console.log(`  반복 ${epoch} · 학습 ${trainError.toFixed(5)} · 검증 ${validError.toFixed(5)}`);
    },
  });

  const outcome: Outcome = {
    k,
    before,
    after: { train: trained.trainError, valid: trained.validError },
    bestEpoch: trained.bestEpoch,
    tuned: weightObject(trained.weights),
  };
  const reportPath = writeReport(result, outcome, performance.now() - startedAt);
  console.log(`\n검증 오차 ${before.valid.toFixed(5)} → ${trained.validError.toFixed(5)} · 보고서: ${relative(REPO_ROOT, reportPath)}`);

  if (trained.validError >= before.valid) {
    console.log('검증 오차가 줄지 않아 적용하지 않습니다.');
    return;
  }
  if (await confirmApply()) applyWeights(outcome.tuned, reportPath);
}

await main();
