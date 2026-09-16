/**
 * 가중치 후보 판정: 후보를 적용해 동족전을 두고, 기준에 못 미치면 되돌린다.
 *
 * 검증 오차(MSE)가 줄었다는 것은 기력이 올랐다는 뜻이 아니다. 목적함수가 "기록된 대국의 승패를
 * 맞히는 것"이라 잘 두는 것과 갈라진다. 그래서 적용 여부를 대국으로 판정한다.
 *
 * 두 단계로 본다.
 *   1. 전체 동족전 점수율이 --min 이상인가
 *   2. 그중 가장 나쁜 능력을 따로 더 두어, 점수율이 --floor 이상인가
 * 2단계가 필요한 이유: 전체 평균은 능력 하나가 무너진 것을 덮는다. 실제로 87사이클 학습분은
 * 전체 60%로 통과할 수치였지만 march가 22%로 망가져 있었다. 능력당 판 수가 적어 1단계의
 * 능력별 수치는 노이즈가 크므로, 의심되는 하나만 골라 충분한 판 수로 다시 확인한다.
 *
 * 사용: npx tsx tools/gate.ts reports/tune-....json [--games 200] [--ms 200] [--min 0.5] [--floor 0.35] [--confirm 100]
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderWeights, type WeightModel } from './weightsFile';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const AI_ROOT = join(REPO_ROOT, 'packages', 'ai');
const WEIGHTS_FILE = join(AI_ROOT, 'src', 'weights.ts');
const BASELINE_DIR = join(AI_ROOT, 'tools', 'baseline');
const VERSUS = join(AI_ROOT, 'tools', 'versus.ts');
/** 기준본이 스스로 돌아가는 데 필요한 파일들 (src와 같은 상대 경로로 서로를 import 한다) */
const BASELINE_FILES = ['search.ts', 'evaluate.ts', 'features.ts', 'abilityFeatures.ts'] as const;

const numberArg = (name: string, fallback: number) => {
  const index = process.argv.indexOf(`--${name}`);
  const value = Number(process.argv[index + 1]);
  return index >= 0 && Number.isFinite(value) ? value : fallback;
};

const reportPath = process.argv[2];
if (!reportPath || !existsSync(reportPath)) {
  console.error('튜닝 보고서 JSON 경로가 필요합니다: npx tsx tools/gate.ts reports/tune-....json');
  process.exit(1);
}

const settings = {
  games: numberArg('games', 200),
  ms: numberArg('ms', 200),
  min: numberArg('min', 0.5),
  floor: numberArg('floor', 0.35),
  confirm: numberArg('confirm', 100),
};

interface Summary {
  readonly scoreRate: number;
  readonly perAbility: Record<string, { readonly score: number; readonly games: number }>;
}

/** 동족전을 두고 요약을 돌려준다. 실행에 실패하면 null */
function runVersus(games: number, abilities?: string): Summary | null {
  const out = join(REPO_ROOT, 'reports', `gate-${Date.now()}.json`);
  const args = [VERSUS, '--games', String(games), '--ms', String(settings.ms), '--mirror', '--json', out];
  if (abilities) args.push('--abilities', abilities);
  const result = spawnSync(process.execPath, ['--import', 'tsx', ...args], { cwd: AI_ROOT, stdio: 'inherit' });
  if (result.status !== 0 || !existsSync(out)) return null;
  const summary = JSON.parse(readFileSync(out, 'utf8')) as Summary;
  rmSync(out);
  return summary;
}

const percent = (rate: number) => `${(rate * 100).toFixed(1)}%`;

const report = JSON.parse(readFileSync(reportPath, 'utf8')) as { tuned: WeightModel };
const candidate = renderWeights(report.tuned, relative(REPO_ROOT, reportPath).split(sep).join('/').replace(/\.json$/, '.md'));
const current = readFileSync(WEIGHTS_FILE, 'utf8');

if (candidate.split('\r\n').join('\n') === current.split('\r\n').join('\n')) {
  console.log('후보가 현재 가중치와 같습니다. 판정할 것이 없습니다.');
  process.exit(0);
}

if (settings.games <= 0) {
  writeFileSync(WEIGHTS_FILE, candidate);
  console.log('--games 0 이라 판정 없이 적용했습니다.');
  process.exit(0);
}

// 기준본 = 지금 가중치. 코드를 현재 것으로 맞춰 두어야 가중치 말고는 차이가 없다
mkdirSync(BASELINE_DIR, { recursive: true });
for (const name of BASELINE_FILES) copyFileSync(join(AI_ROOT, 'src', name), join(BASELINE_DIR, name));
writeFileSync(join(BASELINE_DIR, 'weights.ts'), current);
writeFileSync(WEIGHTS_FILE, candidate);

function rollback(reason: string): never {
  writeFileSync(WEIGHTS_FILE, current);
  console.log(`\n${reason} · 가중치를 되돌렸습니다.`);
  process.exit(2);
}

console.log(`[1/2] 전체 동족전 ${settings.games}판 (수당 ${settings.ms}ms) · 기준 ${percent(settings.min)}\n`);
const overall = runVersus(settings.games);
if (!overall) rollback('대국 실행 실패');
if (overall.scoreRate < settings.min) rollback(`전체 ${percent(overall.scoreRate)} < 기준 ${percent(settings.min)}`);

const entries = Object.entries(overall.perAbility);
if (settings.confirm <= 0 || entries.length === 0) {
  console.log(`\n전체 ${percent(overall.scoreRate)} ≥ 기준 ${percent(settings.min)} · 후보를 적용했습니다.`);
  process.exit(0);
}

// 평균이 덮을 수 있는 능력별 붕괴를 잡는다. 1단계 수치는 판 수가 적어 노이즈가 크므로
// 가장 나쁜 하나만 골라 충분한 판 수로 다시 확인한다
const [worst] = entries.sort((a, b) => a[1].score / a[1].games - b[1].score / b[1].games);
console.log(`\n[2/2] 가장 나쁜 능력 재확인: ${worst[0]} (1단계 ${percent(worst[1].score / worst[1].games)}, ${worst[1].games}판) · ${settings.confirm}판 · 하한 ${percent(settings.floor)}\n`);

const check = runVersus(settings.confirm, worst[0]);
if (!check) rollback('재확인 대국 실행 실패');
if (check.scoreRate < settings.floor) {
  rollback(`전체는 ${percent(overall.scoreRate)}로 통과했지만 ${worst[0]}이(가) ${percent(check.scoreRate)} < 하한 ${percent(settings.floor)}`);
}

console.log(`\n전체 ${percent(overall.scoreRate)} · ${worst[0]} ${percent(check.scoreRate)} · 후보를 적용했습니다.`);
process.exit(0);
