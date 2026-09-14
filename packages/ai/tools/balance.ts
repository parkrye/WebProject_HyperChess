/**
 * 능력 밸런스 측정 도구 (AI 자가 대국).
 *
 * 실행
 *   - 루트의 balance.bat 더블클릭 → 대화형으로 설정
 *   - npm run balance -- --mode league --games 8 --yes
 *
 * 측정 방식
 *   opponent  각 능력이 지정한 상대(기본: 능력 없음)와 n판. 상대끼리 둔 대조군 포함
 *   league    선택한 능력들이 서로 모든 조합으로 n판씩 (리그전). 능력별 종합 점수와 상대별 매트릭스
 *
 * 인자 (없으면 대화형으로 묻는다)
 *   --mode <opponent|league> 측정 방식 (기본 opponent)
 *   --abilities <id,id|all>  측정할 능력 (기본 all)
 *   --opponent <id|none>     opponent 방식의 상대 능력 (기본 none = 능력 없음)
 *   --include-none           league 방식에 "능력 없음"도 참가
 *   --games <n>              조합(대진)당 대국 수, 짝수 권장 (기본 opponent 16 / league 8)
 *   --depth <n>              AI 탐색 깊이 (기본 2)
 *   --opening <n>            무작위로 두는 첫 수 (기본 4)
 *   --max-plies <n>          최대 수, 넘으면 평가값 판정 (기본 160)
 *   --workers <n>            병렬 워커 수 (기본 CPU 코어 - 2)
 *   --yes                    시작 확인 생략
 */
import { getAbility, listAbilities, opposite, type Color } from '@hyperchess/engine';
import { mkdirSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { createInterface, type Interface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { isMainThread, parentPort, Worker } from 'node:worker_threads';
import { playMatch, type MatchResult, type MatchSpec } from './match';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const REPORT_DIR = join(REPO_ROOT, 'reports');
const NONE = 'none';

type Mode = 'opponent' | 'league';
/** 능력 id, null = 능력 없음 */
type Participant = string | null;

interface Settings {
  readonly mode: Mode;
  readonly subjects: readonly string[];
  readonly opponent: Participant;
  readonly includeNone: boolean;
  readonly games: number;
  readonly depth: number;
  readonly opening: number;
  readonly maxPlies: number;
  readonly workers: number;
}

interface Job {
  readonly id: number;
  readonly spec: MatchSpec;
  readonly a: Participant;
  readonly b: Participant;
  readonly aColor: Color;
  /** opponent 방식의 대조군 (상대끼리 대국) */
  readonly control: boolean;
}

type WorkerMessage = { readonly id: number; readonly result: MatchResult };

/* ---------- 설정 ---------- */

const participantName = (id: Participant) => (id ? getAbility(id).name : '능력 없음');

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const hasArgs = () => process.argv.slice(2).some((arg) => arg.startsWith('--') && arg !== '--yes');

function parseAbilityList(raw: string, ids: readonly string[]): string[] {
  const text = raw.trim();
  if (!text || text === 'all') return [...ids];
  return text
    .split(/[,\s]+/)
    .filter(Boolean)
    .map((token) => {
      const byIndex = Number(token);
      const id = Number.isInteger(byIndex) ? ids[byIndex - 1] : token;
      if (!id || !ids.includes(id)) throw new Error(`알 수 없는 능력: ${token}`);
      return id;
    });
}

function parseOpponent(raw: string, ids: readonly string[]): Participant {
  const text = raw.trim();
  if (!text || text === NONE || text === '0') return null;
  return parseAbilityList(text, ids)[0] ?? null;
}

function positiveInt(raw: string | undefined, fallback: number, label: string): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${label}은(는) 1 이상의 정수여야 합니다: ${raw}`);
  return value;
}

const defaultWorkers = () => Math.max(1, cpus().length - 2);
const defaultGames = (mode: Mode) => (mode === 'league' ? 8 : 16);

function settingsFromArgs(ids: readonly string[]): Settings {
  const mode: Mode = argValue('mode') === 'league' ? 'league' : 'opponent';
  return {
    mode,
    subjects: parseAbilityList(argValue('abilities') ?? 'all', ids),
    opponent: parseOpponent(argValue('opponent') ?? NONE, ids),
    includeNone: process.argv.includes('--include-none'),
    games: positiveInt(argValue('games'), defaultGames(mode), '대국 수'),
    depth: positiveInt(argValue('depth'), 2, '탐색 깊이'),
    opening: Number(argValue('opening') ?? 4),
    maxPlies: positiveInt(argValue('max-plies'), 160, '최대 수'),
    workers: positiveInt(argValue('workers'), defaultWorkers(), '워커 수'),
  };
}

async function settingsFromPrompt(ids: readonly string[]): Promise<Settings> {
  const rl: Interface = createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log('\n=== HyperChess 능력 밸런스 측정 ===\n');
    console.log('측정 방식');
    console.log('  1. 지정 상대와 대결 (각 능력 vs 한 상대, 기본: 능력 없음)');
    console.log('  2. 리그전 (선택한 능력들이 서로 모든 조합으로 대결)\n');
    const mode: Mode = (await rl.question('방식 번호 (엔터 = 1): ')).trim() === '2' ? 'league' : 'opponent';

    console.log('');
    ids.forEach((id, index) => console.log(`  ${String(index + 1).padStart(2)}. ${participantName(id)} (${id})`));
    console.log('');
    const subjects = parseAbilityList(await rl.question('측정할 능력 번호 (쉼표 구분, 엔터 = 전체): '), ids);

    let opponent: Participant = null;
    let includeNone = false;
    if (mode === 'opponent') {
      opponent = parseOpponent(await rl.question('상대 능력 번호 (엔터 = 능력 없음): '), ids);
    } else {
      includeNone = /^y/i.test((await rl.question('"능력 없음"도 리그에 참가시킬까요? (y/N): ')).trim());
    }

    const gamesLabel = mode === 'league' ? '대진당' : '조합당';
    const games = positiveInt(
      await rl.question(`${gamesLabel} 대국 수 (엔터 = ${defaultGames(mode)}, 많을수록 정확): `),
      defaultGames(mode),
      '대국 수',
    );
    const depth = positiveInt(await rl.question('AI 탐색 깊이 (엔터 = 2, 3 이상은 매우 느림): '), 2, '탐색 깊이');
    return { mode, subjects, opponent, includeNone, games, depth, opening: 4, maxPlies: 160, workers: defaultWorkers() };
  } finally {
    rl.close();
  }
}

async function confirm(settings: Settings, jobCount: number): Promise<boolean> {
  // 깊이 2 기준 한 판 약 15초, 깊이가 1 늘 때마다 약 4배
  const secondsPerGame = 15 * Math.pow(4, settings.depth - 2);
  const minutes = (jobCount * secondsPerGame) / settings.workers / 60;
  const participants = leagueParticipants(settings);

  console.log('');
  if (settings.mode === 'league') {
    console.log(`리그전 참가: ${participants.map(participantName).join(', ')}`);
    console.log(`대진 ${(participants.length * (participants.length - 1)) / 2}개 × ${settings.games}판 / 깊이 ${settings.depth}`);
  } else {
    console.log(`측정 대상: ${settings.subjects.map(participantName).join(', ')}`);
    console.log(`상대: ${participantName(settings.opponent)} / 조합당 ${settings.games}판 / 깊이 ${settings.depth}`);
  }
  console.log(`총 ${jobCount}판, 워커 ${settings.workers}개, 예상 약 ${Math.max(1, Math.round(minutes))}분`);
  if (process.argv.includes('--yes') || !process.stdin.isTTY) return true;

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question('시작할까요? (Y/n): ');
  rl.close();
  return !/^n/i.test(answer.trim());
}

/* ---------- 대진 ---------- */

function leagueParticipants(settings: Settings): Participant[] {
  return settings.includeNone ? [...settings.subjects, null] : [...settings.subjects];
}

function buildJobs(settings: Settings): Job[] {
  const search = { maxDepth: settings.depth, timeLimitMs: 600_000, quiescence: true, abilityBranchLimit: 4, noise: 8 };
  const jobs: Job[] = [];

  const addMatchup = (a: Participant, b: Participant, control: boolean) => {
    for (let game = 0; game < settings.games; game++) {
      const aColor: Color = game % 2 === 0 ? 'w' : 'b';
      const spec: MatchSpec = {
        white: aColor === 'w' ? a : b,
        black: aColor === 'w' ? b : a,
        seed: 1000 + game * 7919,
        randomOpeningPlies: settings.opening,
        maxPlies: settings.maxPlies,
        search,
      };
      jobs.push({ id: jobs.length, spec, a, b, aColor, control });
    }
  };

  if (settings.mode === 'league') {
    const participants = leagueParticipants(settings);
    if (participants.length < 2) throw new Error('리그전은 참가자가 2명 이상이어야 합니다');
    for (let i = 0; i < participants.length; i++) {
      for (let j = i + 1; j < participants.length; j++) addMatchup(participants[i], participants[j], false);
    }
    return jobs;
  }

  // 대조군: 상대 능력끼리 대국해 선공 이점을 확인
  addMatchup(settings.opponent, settings.opponent, true);
  for (const subject of settings.subjects) addMatchup(subject, settings.opponent, false);
  return jobs;
}

/* ---------- 실행 ---------- */

function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  const minutes = Math.floor(total / 60);
  return minutes > 0 ? `${minutes}분 ${total % 60}초` : `${total}초`;
}

async function runJobs(jobs: Job[], workers: number): Promise<Map<number, MatchResult>> {
  const results = new Map<number, MatchResult>();
  const queue = [...jobs];
  const started = Date.now();

  const report = () => {
    const elapsed = Date.now() - started;
    const done = results.size;
    const eta = done > 0 ? (elapsed / done) * (jobs.length - done) : 0;
    const width = 30;
    const filled = Math.round((done / jobs.length) * width);
    const bar = '#'.repeat(filled) + '-'.repeat(width - filled);
    const remaining = done ? formatDuration(eta) : '계산 중';
    process.stdout.write(`\r[${bar}] ${done}/${jobs.length}  경과 ${formatDuration(elapsed)}  남은 시간 ${remaining}   `);
  };
  report();

  await Promise.all(
    Array.from({ length: Math.min(workers, jobs.length) }, () => {
      const worker = new Worker(new URL('./worker-bootstrap.mjs', import.meta.url), { workerData: { entry: import.meta.url } });
      return new Promise<void>((resolve, reject) => {
        const next = () => {
          const job = queue.shift();
          if (job) worker.postMessage(job);
          else void worker.terminate().then(() => resolve());
        };
        worker.on('message', ({ id, result }: WorkerMessage) => {
          results.set(id, result);
          report();
          next();
        });
        worker.on('error', reject);
        next();
      });
    }),
  );
  process.stdout.write('\n');
  return results;
}

/* ---------- 집계 ---------- */

interface Row {
  readonly label: string;
  games: number;
  points: number;
  wins: number;
  draws: number;
  losses: number;
  asWhite: number;
  asBlack: number;
  uses: number;
  plies: number;
}

const newRow = (label: string): Row => ({ label, games: 0, points: 0, wins: 0, draws: 0, losses: 0, asWhite: 0, asBlack: 0, uses: 0, plies: 0 });
const scoreRate = (row: Row) => (row.games ? row.points / row.games : 0);
const pointsFor = (result: MatchResult, color: Color) => (result.winner === null ? 0.5 : result.winner === color ? 1 : 0);

function accumulate(row: Row, result: MatchResult, color: Color) {
  const points = pointsFor(result, color);
  row.games++;
  row.points += points;
  if (points === 1) row.wins++;
  else if (points === 0.5) row.draws++;
  else row.losses++;
  if (color === 'w') row.asWhite += points;
  else row.asBlack += points;
  row.uses += result.abilityUses[color];
  row.plies += result.plies;
}

function rowsFor<K>(keys: Map<K, Row>): Row[] {
  return [...keys.values()].sort((x, y) => scoreRate(y) - scoreRate(x));
}

function summarizeOpponent(settings: Settings, jobs: Job[], results: Map<number, MatchResult>): Row[] {
  const rows = new Map<string, Row>();
  for (const job of jobs) {
    const result = results.get(job.id);
    if (!result) continue;
    const label = job.control ? `(대조군) ${participantName(settings.opponent)}끼리, 백 기준` : participantName(job.a);
    const row = rows.get(label) ?? newRow(label);
    // 대조군은 항상 백 기준으로 집계해 선공 이점을 본다
    accumulate(row, result, job.control ? 'w' : job.aColor);
    rows.set(label, row);
  }
  return rowsFor(rows);
}

interface LeagueSummary {
  readonly rows: Row[];
  /** matrix[행 참가자][열 참가자] = 행이 열을 상대로 얻은 점수 / 판 */
  readonly matrix: Map<Participant, Map<Participant, { points: number; games: number }>>;
  readonly whiteRate: number;
}

function summarizeLeague(jobs: Job[], results: Map<number, MatchResult>): LeagueSummary {
  const rows = new Map<Participant, Row>();
  const matrix = new Map<Participant, Map<Participant, { points: number; games: number }>>();
  let whitePoints = 0;
  let games = 0;

  const cell = (row: Participant, column: Participant) => {
    const line = matrix.get(row) ?? new Map();
    matrix.set(row, line);
    const entry = line.get(column) ?? { points: 0, games: 0 };
    line.set(column, entry);
    return entry;
  };

  for (const job of jobs) {
    const result = results.get(job.id);
    if (!result) continue;
    const bColor = opposite(job.aColor);
    for (const [self, other, color] of [
      [job.a, job.b, job.aColor],
      [job.b, job.a, bColor],
    ] as const) {
      const row = rows.get(self) ?? newRow(participantName(self));
      accumulate(row, result, color);
      rows.set(self, row);
      const entry = cell(self, other);
      entry.points += pointsFor(result, color);
      entry.games++;
    }
    whitePoints += pointsFor(result, 'w');
    games++;
  }
  return { rows: rowsFor(rows), matrix, whiteRate: games ? whitePoints / games : 0 };
}

/* ---------- 출력 ---------- */

const percent = (value: number) => `${(value * 100).toFixed(0)}%`;

function tableLines(rows: Row[]): string[] {
  const lines = ['| 능력 | 판 | 승-무-패 | 점수율 | 백/흑 점수 | 판당 사용 | 평균 수 |', '|---|---|---|---|---|---|---|'];
  for (const row of rows) {
    const cells = [
      row.label,
      row.games,
      `${row.wins}-${row.draws}-${row.losses}`,
      percent(scoreRate(row)),
      `${row.asWhite}/${row.asBlack}`,
      (row.uses / row.games).toFixed(1),
      (row.plies / row.games).toFixed(0),
    ];
    lines.push(`| ${cells.join(' | ')} |`);
  }
  return lines;
}

function matrixLines(summary: LeagueSummary): string[] {
  // 종합 점수 순서로 행/열 정렬
  const order = summary.rows
    .map((row) => [...summary.matrix.keys()].find((key) => participantName(key) === row.label))
    .filter((key): key is Participant => key !== undefined);
  const header = ['행 → 열 상대 점수율', ...order.map(participantName)];
  const lines = [`| ${header.join(' | ')} |`, `|${header.map(() => '---').join('|')}|`];
  for (const row of order) {
    const cells = order.map((column) => {
      if (row === column) return '—';
      const entry = summary.matrix.get(row)?.get(column);
      return entry && entry.games ? percent(entry.points / entry.games) : '·';
    });
    lines.push(`| **${participantName(row)}** | ${cells.join(' | ')} |`);
  }
  return lines;
}

function reportStamp(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function writeReport(settings: Settings, body: string[], data: unknown, elapsedMs: number): string {
  mkdirSync(REPORT_DIR, { recursive: true });
  const base = join(REPORT_DIR, `balance-${settings.mode}-${reportStamp()}`);
  const perRowGames = settings.mode === 'league' ? settings.games * Math.max(1, leagueParticipants(settings).length - 1) : settings.games;
  const margin = Math.round(100 / Math.sqrt(perRowGames));

  const header = [
    `# 밸런스 측정 (${settings.mode === 'league' ? '리그전' : `상대: ${participantName(settings.opponent)}`}) ${new Date().toLocaleString('ko-KR')}`,
    '',
    `- ${settings.mode === 'league' ? '대진' : '조합'}당 ${settings.games}판 (백/흑 번갈아), AI 탐색 깊이 ${settings.depth}, 첫 ${settings.opening}수 무작위, ${settings.maxPlies}수 초과 시 평가값 판정`,
    `- 소요 시간: ${formatDuration(elapsedMs)}`,
    `- 종합 점수율 오차: 95% 신뢰구간 대략 ±${margin}%p (판 수가 적을수록 큼). AI의 능력 활용 실력이 결과에 섞여 있음`,
    '',
  ];
  writeFileSync(`${base}.md`, [...header, ...body, ''].join('\n'));
  writeFileSync(`${base}.json`, JSON.stringify(data, null, 2));
  return `${base}.md`;
}

async function main() {
  const ids = listAbilities().map((ability) => ability.id);
  const settings = hasArgs() || !process.stdin.isTTY ? settingsFromArgs(ids) : await settingsFromPrompt(ids);
  const jobs = buildJobs(settings);
  if (!(await confirm(settings, jobs.length))) {
    console.log('취소했습니다.');
    return;
  }

  const started = Date.now();
  const results = await runJobs(jobs, settings.workers);
  const rawResults = [...results.values()];

  let body: string[];
  if (settings.mode === 'league') {
    const summary = summarizeLeague(jobs, results);
    body = [
      '## 종합',
      '',
      ...tableLines(summary.rows),
      '',
      `선공(백) 점수율: ${percent(summary.whiteRate)}`,
      '',
      '## 상대별 점수율',
      '',
      ...matrixLines(summary),
    ];
  } else {
    body = tableLines(summarizeOpponent(settings, jobs, results));
  }

  console.log('');
  for (const line of body) console.log(line);
  const reportPath = writeReport(settings, body, { settings, results: rawResults }, Date.now() - started);
  console.log(`\n보고서 저장: ${relative(REPO_ROOT, reportPath)} (원본 데이터는 같은 이름의 .json)`);
}

/* ---------- 진입점 (모든 선언 이후에 실행) ---------- */

if (!isMainThread) {
  parentPort!.on('message', (job: Job) => {
    parentPort!.postMessage({ id: job.id, result: playMatch(job.spec) } satisfies WorkerMessage);
  });
} else {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
