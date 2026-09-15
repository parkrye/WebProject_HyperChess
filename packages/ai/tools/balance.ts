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
 *   --focus <id,id>          league 방식에서 이 능력이 낀 대진만 새로 대국
 *   --base <file.json>       이전 리그전 결과에 합산: focus 능력이 낀 대진만 새 결과로 교체 (--base latest = 가장 최근 리그전)
 *   --games <n>              조합(대진)당 대국 수, 짝수 권장. 생략하면 계속 반복 (Ctrl+C·창 닫기로 종료, 그때까지 결과 저장)
 *   --depth <n>              AI 탐색 깊이 (기본 2)
 *   --opening <n>            무작위로 두는 첫 수 (기본 4)
 *   --max-plies <n>          최대 수, 넘으면 평가값 판정 (기본 160)
 *   --cpu <1-100>            CPU 사용량 % (기본 50). 논리 코어 수에 비례해 워커 수를 정한다
 *   --workers <n>            병렬 워커 수를 직접 지정 (--cpu 보다 우선)
 *   --seed-round <n>         시드 시작 라운드 (기본 0). 같은 설정으로 여러 번 돌려도 다른 대국이 되게 한다 (학습 루프용)
 *   --yes                    시작 확인 생략
 */
import { getAbility, listAbilities, opposite, type Color } from '@hyperchess/engine';
import { BALANCE_VERSION } from '@hyperchess/protocol';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { constants, cpus, setPriority } from 'node:os';
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
  /** league: 새로 대국할 능력 (비어 있으면 전체 대진) */
  readonly focus: readonly string[];
  /** league: 합산할 이전 리그전 결과 json 경로 */
  readonly basePath: string | null;
  /** 조합(대진)당 대국 수. null이면 외부에서 멈출 때까지 라운드를 계속 반복 */
  readonly games: number | null;
  readonly depth: number;
  readonly opening: number;
  readonly maxPlies: number;
  readonly workers: number;
  /** 시드 시작 라운드 */
  readonly seedRound: number;
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

const DEFAULT_CPU_PERCENT = 50;

/** CPU 사용량(%)에 맞춘 워커 수. 워커 하나가 논리 코어 하나를 거의 다 쓴다 */
const workersForCpu = (percent: number) => Math.max(1, Math.floor((cpus().length * Math.min(100, percent)) / 100));
/** 계속 반복 모드에서 한 라운드에 조합(대진)마다 두는 판 수 (백/흑 한 번씩) */
const CONTINUOUS_ROUND_GAMES = 2;
/** 계속 반복 모드에서 보고서를 저장하는 최소 간격 */
const SAVE_INTERVAL_MS = 60_000;

/** 측정 중에도 다른 프로그램이 먼저 CPU를 쓰도록 우선순위를 낮춘다 (워커 스레드도 같은 프로세스) */
function lowerProcessPriority() {
  try {
    setPriority(constants.priority.PRIORITY_LOW);
  } catch {
    // 권한 문제 등으로 실패해도 측정은 계속한다
  }
}

function latestLeagueReport(): string | null {
  if (!existsSync(REPORT_DIR)) return null;
  const files = readdirSync(REPORT_DIR)
    .filter((name) => name.startsWith('balance-league-') && name.endsWith('.json'))
    .sort();
  return files.length ? join(REPORT_DIR, files[files.length - 1]) : null;
}

function resolveBasePath(raw: string | undefined): string | null {
  if (!raw) return null;
  const path = raw === 'latest' ? latestLeagueReport() : raw;
  if (!path || !existsSync(path)) throw new Error(`이전 결과 파일을 찾을 수 없습니다: ${raw}`);
  return path;
}

function settingsFromArgs(ids: readonly string[]): Settings {
  const mode: Mode = argValue('mode') === 'league' ? 'league' : 'opponent';
  return {
    mode,
    subjects: parseAbilityList(argValue('abilities') ?? 'all', ids),
    opponent: parseOpponent(argValue('opponent') ?? NONE, ids),
    includeNone: process.argv.includes('--include-none'),
    focus: argValue('focus') ? parseAbilityList(argValue('focus')!, ids) : [],
    basePath: resolveBasePath(argValue('base')),
    games: argValue('games') === undefined ? null : positiveInt(argValue('games'), CONTINUOUS_ROUND_GAMES, '대국 수'),
    depth: positiveInt(argValue('depth'), 2, '탐색 깊이'),
    opening: Number(argValue('opening') ?? 4),
    maxPlies: positiveInt(argValue('max-plies'), 160, '최대 수'),
    workers: positiveInt(argValue('workers'), workersForCpu(positiveInt(argValue('cpu'), DEFAULT_CPU_PERCENT, 'CPU 사용량')), '워커 수'),
    seedRound: Number(argValue('seed-round') ?? 0),
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
    let focus: string[] = [];
    let basePath: string | null = null;
    if (mode === 'opponent') {
      opponent = parseOpponent(await rl.question('상대 능력 번호 (엔터 = 능력 없음): '), ids);
    } else {
      includeNone = /^y/i.test((await rl.question('"능력 없음"도 리그에 참가시킬까요? (y/N): ')).trim());
      const focusRaw = await rl.question('새로 대국할 능력만 지정 (번호 쉼표 구분, 엔터 = 전체 대진): ');
      focus = focusRaw.trim() ? parseAbilityList(focusRaw, ids) : [];
      const latest = latestLeagueReport();
      if (focus.length > 0 && latest) {
        const answer = (await rl.question(`나머지 대진은 이전 결과(${relative(REPO_ROOT, latest)})를 쓸까요? (Y/n 또는 json 경로): `)).trim();
        if (/^n(o)?$/i.test(answer)) basePath = null;
        else if (answer === '' || /^y(es)?$/i.test(answer)) basePath = latest;
        else basePath = resolveBasePath(answer);
      }
    }

    const gamesLabel = mode === 'league' ? '대진당' : '조합당';
    const gamesRaw = await rl.question(`${gamesLabel} 대국 수 (엔터 = 끝없이 반복, Ctrl+C 또는 창을 닫으면 그때까지 결과 저장): `);
    const games = gamesRaw.trim() === '' ? null : positiveInt(gamesRaw, CONTINUOUS_ROUND_GAMES, '대국 수');
    const depth = positiveInt(await rl.question('AI 탐색 깊이 (엔터 = 2, 3 이상은 매우 느림): '), 2, '탐색 깊이');
    const cpuPercent = positiveInt(
      await rl.question(`CPU 사용량 % (엔터 = ${DEFAULT_CPU_PERCENT}, 높을수록 빠르지만 PC가 무거워짐): `),
      DEFAULT_CPU_PERCENT,
      'CPU 사용량',
    );
    return { mode, subjects, opponent, includeNone, focus, basePath, games, depth, opening: 4, maxPlies: 160, workers: workersForCpu(cpuPercent), seedRound: 0 };
  } finally {
    rl.close();
  }
}

async function confirm(settings: Settings, jobCount: number): Promise<boolean> {
  // 실측: 깊이 2 기준 한 판 CPU 약 30초(Ryzen 7 3700X), 깊이가 1 늘 때마다 약 4배
  const secondsPerGame = 30 * Math.pow(4, settings.depth - 2);
  const minutes = (jobCount * secondsPerGame) / settings.workers / 60;
  const gamesText = settings.games === null ? `계속 반복(라운드마다 ${CONTINUOUS_ROUND_GAMES}판)` : `${settings.games}판`;
  const participants = leagueParticipants(settings);

  console.log('');
  if (settings.mode === 'league') {
    console.log(`리그전 참가: ${participants.map(participantName).join(', ')}`);
    const pairCount = leaguePairs(settings).length;
    console.log(`새로 대국할 대진 ${pairCount}개 × ${gamesText} / 깊이 ${settings.depth}`);
    if (settings.focus.length) console.log(`재측정 대상: ${settings.focus.map(participantName).join(', ')}`);
    if (settings.basePath) console.log(`나머지 대진은 이전 결과 사용: ${relative(REPO_ROOT, settings.basePath)}`);
  } else {
    console.log(`측정 대상: ${settings.subjects.map(participantName).join(', ')}`);
    console.log(`상대: ${participantName(settings.opponent)} / 조합당 ${gamesText} / 깊이 ${settings.depth}`);
  }
  const cpuShare = Math.round((settings.workers / cpus().length) * 100);
  if (settings.games === null) {
    console.log(`라운드당 ${jobCount}판(약 ${Math.max(1, Math.round(minutes))}분), 워커 ${settings.workers}개(CPU 약 ${cpuShare}%, 낮은 우선순위)`);
    console.log('끝없이 반복합니다. 보고서는 1분·라운드마다 저장되고, Ctrl+C나 창을 닫으면 그때까지의 결과를 저장하고 끝냅니다.');
  } else {
    console.log(`총 ${jobCount}판, 워커 ${settings.workers}개(CPU 약 ${cpuShare}%, 낮은 우선순위), 예상 약 ${Math.max(1, Math.round(minutes))}분`);
  }
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

/** 새로 대국할 리그전 대진. focus가 있으면 그 능력이 낀 대진만 */
function leaguePairs(settings: Settings): [Participant, Participant][] {
  const participants = leagueParticipants(settings);
  const pairs: [Participant, Participant][] = [];
  const focused = (p: Participant) => p !== null && settings.focus.includes(p);
  for (let i = 0; i < participants.length; i++) {
    for (let j = i + 1; j < participants.length; j++) {
      if (settings.focus.length === 0 || focused(participants[i]) || focused(participants[j])) {
        pairs.push([participants[i], participants[j]]);
      }
    }
  }
  return pairs;
}

/**
 * 한 라운드의 대국 목록. 계속 반복 모드는 라운드마다 시드가 달라 같은 대국이 되풀이되지 않는다.
 * idStart: 라운드가 이어져도 대국 id가 겹치지 않게 하는 시작 번호
 */
function buildJobs(settings: Settings, round = 0, idStart = 0): Job[] {
  const search = { maxDepth: settings.depth, timeLimitMs: 600_000, quiescence: true, abilityBranchLimit: 4, noise: 8 };
  const jobs: Job[] = [];
  const gamesPerMatchup = settings.games ?? CONTINUOUS_ROUND_GAMES;

  const addMatchup = (a: Participant, b: Participant, control: boolean) => {
    for (let game = 0; game < gamesPerMatchup; game++) {
      const aColor: Color = game % 2 === 0 ? 'w' : 'b';
      const spec: MatchSpec = {
        white: aColor === 'w' ? a : b,
        black: aColor === 'w' ? b : a,
        seed: 1000 + ((settings.seedRound + round) * gamesPerMatchup + game) * 7919,
        randomOpeningPlies: settings.opening,
        maxPlies: settings.maxPlies,
        search,
      };
      jobs.push({ id: idStart + jobs.length, spec, a, b, aColor, control });
    }
  };

  if (settings.mode === 'league') {
    if (leagueParticipants(settings).length < 2) throw new Error('리그전은 참가자가 2명 이상이어야 합니다');
    for (const [a, b] of leaguePairs(settings)) addMatchup(a, b, false);
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

const PROGRESS_FILE = join(REPORT_DIR, 'progress.txt');

/** 중간 순위 (지금까지 끝난 판 기준). 진행 파일에만 쓴다 */
function interimStandings(jobs: Job[], results: Map<number, MatchResult>): string[] {
  const rows = new Map<string, { points: number; games: number }>();
  for (const job of jobs) {
    const result = results.get(job.id);
    if (!result || job.control) continue;
    const sides: [Participant, Color][] = [[job.a, job.aColor], [job.b, opposite(job.aColor)]];
    for (const [participant, color] of sides) {
      const label = participantName(participant);
      const row = rows.get(label) ?? { points: 0, games: 0 };
      row.points += pointsFor(result, color);
      row.games++;
      rows.set(label, row);
    }
  }
  return [...rows.entries()]
    .sort(([, x], [, y]) => y.points / y.games - x.points / x.games)
    .map(([label, row], index) => `${String(index + 1).padStart(2)}. ${label.padEnd(8)} ${percent(row.points / row.games).padStart(4)}  (${row.games}판)`);
}

interface RunOptions {
  /** 다음 대국 (null이면 더 없음) */
  readonly nextJob: () => Job | null;
  /** 전체 대국 수 (계속 반복이면 null) */
  readonly total: number | null;
  /** 진행 중간 순위에 쓸 지금까지 만든 대국 목록 */
  readonly jobs: () => readonly Job[];
  readonly workers: number;
  readonly results: Map<number, MatchResult>;
  readonly onResult?: () => void;
}

async function runJobs({ nextJob, total, jobs, workers, results, onResult }: RunOptions): Promise<void> {
  const started = Date.now();
  const interactive = process.stdout.isTTY;
  // 콘솔이 아닐 때(백그라운드 실행 등)는 약 5%마다(계속 반복이면 50판마다) 한 줄씩 출력
  const lineEvery = total ? Math.max(1, Math.floor(total / 20)) : 50;
  mkdirSync(REPORT_DIR, { recursive: true });

  const report = () => {
    const elapsed = Date.now() - started;
    const done = results.size;
    let line: string;
    if (total === null) {
      line = `[계속 반복] ${done}판 완료  경과 ${formatDuration(elapsed)}  (Ctrl+C 또는 창 닫기로 종료)`;
    } else {
      const eta = done > 0 ? (elapsed / done) * (total - done) : 0;
      const width = 30;
      const filled = Math.round((done / total) * width);
      const bar = '#'.repeat(filled) + '-'.repeat(width - filled);
      const remaining = done ? formatDuration(eta) : '계산 중';
      line = `[${bar}] ${done}/${total} (${percent(done / total)})  경과 ${formatDuration(elapsed)}  남은 시간 ${remaining}`;
    }

    if (interactive) process.stdout.write(`\r${line}   `);
    else if (done % lineEvery === 0 || done === total) console.log(line);

    try {
      writeFileSync(
        PROGRESS_FILE,
        [`밸런스 측정 진행 상황 (${new Date().toLocaleTimeString('ko-KR')} 갱신)`, '', line, '', '중간 순위 (끝난 판 기준, 오차 큼)', ...interimStandings([...jobs()], results), ''].join('\n'),
      );
    } catch {
      // 진행 파일을 못 써도 측정은 계속한다
    }
  };
  report();

  const workerCount = total === null ? workers : Math.min(workers, total);
  await Promise.all(
    Array.from({ length: workerCount }, () => {
      const worker = new Worker(new URL('./worker-bootstrap.mjs', import.meta.url), { workerData: { entry: import.meta.url } });
      return new Promise<void>((resolve, reject) => {
        const next = () => {
          const job = nextJob();
          if (job) worker.postMessage(job);
          else void worker.terminate().then(() => resolve());
        };
        worker.on('message', ({ id, result }: WorkerMessage) => {
          results.set(id, result);
          report();
          onResult?.();
          next();
        });
        worker.on('error', reject);
        next();
      });
    }),
  );
  process.stdout.write('\n');
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

interface LeagueGame {
  readonly a: Participant;
  readonly b: Participant;
  readonly aColor: Color;
  readonly result: MatchResult;
}

function summarizeLeague(entries: readonly LeagueGame[]): LeagueSummary {
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

  for (const job of entries) {
    const { result } = job;
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

/**
 * 새 대국 결과에 이전 리그전 결과를 합친다.
 * 이전 결과 중 focus 능력이 낀 대진과, 현재 참가자가 아닌 대진은 버린다.
 */
function mergeLeagueGames(settings: Settings, jobs: Job[], results: Map<number, MatchResult>): { games: LeagueGame[]; baseUsed: number } {
  const games: LeagueGame[] = [];
  for (const job of jobs) {
    const result = results.get(job.id);
    if (result) games.push({ a: job.a, b: job.b, aColor: job.aColor, result });
  }
  if (!settings.basePath) return { games, baseUsed: 0 };

  const base = JSON.parse(readFileSync(settings.basePath, 'utf8')) as { settings?: Partial<Settings>; results: MatchResult[] };
  if (base.settings && settings.games !== null && (base.settings.games !== settings.games || base.settings.depth !== settings.depth)) {
    console.warn(`주의: 이전 결과의 대국 수/깊이(${base.settings.games}판/깊이 ${base.settings.depth})가 현재 설정과 다릅니다.`);
  }
  const participants = new Set(leagueParticipants(settings));
  const replaced = (p: Participant) => p !== null && settings.focus.includes(p);
  let baseUsed = 0;
  for (const result of base.results) {
    const { white, black } = result.spec;
    if (!participants.has(white) || !participants.has(black)) continue;
    if (replaced(white) || replaced(black)) continue;
    games.push({ a: white, b: black, aColor: 'w', result });
    baseUsed++;
  }
  return { games, baseUsed };
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

/** games: 실제로 끝난 판 수 (계속 반복 모드 표기와 오차 계산용) */
function writeReport(settings: Settings, body: string[], data: unknown, elapsedMs: number, base: string, games: number): string {
  mkdirSync(REPORT_DIR, { recursive: true });
  const matchups = settings.mode === 'league' ? Math.max(1, leaguePairs(settings).length) : settings.subjects.length + 1;
  const perMatchup = settings.games ?? Math.max(1, Math.round(games / matchups));
  const perRowGames = settings.mode === 'league' ? perMatchup * Math.max(1, leagueParticipants(settings).length - 1) : perMatchup;
  const margin = Math.round(100 / Math.sqrt(perRowGames));

  const header = [
    `# 밸런스 측정 (${settings.mode === 'league' ? '리그전' : `상대: ${participantName(settings.opponent)}`}) ${new Date().toLocaleString('ko-KR')}`,
    '',
    `- ${settings.mode === 'league' ? '대진' : '조합'}당 ${settings.games === null ? `약 ${perMatchup}판 (계속 반복, 지금까지 ${games}판)` : `${settings.games}판`} (백/흑 번갈아), AI 탐색 깊이 ${settings.depth}, 첫 ${settings.opening}수 무작위, ${settings.maxPlies}수 초과 시 평가값 판정`,
    `- 소요 시간: ${formatDuration(elapsedMs)}`,
    `- 종합 점수율 오차: 95% 신뢰구간 대략 ±${margin}%p (판 수가 적을수록 큼). AI의 능력 활용 실력이 결과에 섞여 있음`,
    '',
  ];
  writeFileSync(`${base}.md`, [...header, ...body, ''].join('\n'));
  // 통계 가져오기(import-reports)가 버전을 알 수 있도록 함께 저장한다
  writeFileSync(`${base}.json`, JSON.stringify({ balanceVersion: BALANCE_VERSION, ...(data as object) }, null, 2));
  return `${base}.md`;
}

/** 지금까지 끝난 결과로 보고서 본문과 원본 결과 목록을 만든다 */
function buildReport(settings: Settings, jobs: readonly Job[], results: Map<number, MatchResult>): { body: string[]; rawResults: MatchResult[] } {
  if (settings.mode !== 'league') {
    return { body: tableLines(summarizeOpponent(settings, [...jobs], results)), rawResults: [...results.values()] };
  }
  const { games, baseUsed } = mergeLeagueGames(settings, [...jobs], results);
  const summary = summarizeLeague(games);
  const mergeNote = settings.basePath
    ? [
        `> 새로 대국: ${results.size}판 (${settings.focus.map(participantName).join(', ')}이(가) 낀 대진) · 이전 결과에서 가져옴: ${baseUsed}판 (${relative(REPO_ROOT, settings.basePath)})`,
        '',
      ]
    : [];
  const body = [
    ...mergeNote,
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
  return { body, rawResults: games.map((game) => game.result) };
}

async function main() {
  lowerProcessPriority();
  const ids = listAbilities().map((ability) => ability.id);
  const settings = hasArgs() || !process.stdin.isTTY ? settingsFromArgs(ids) : await settingsFromPrompt(ids);
  const firstRound = buildJobs(settings);
  if (!(await confirm(settings, firstRound.length))) {
    console.log('취소했습니다.');
    return;
  }

  const started = Date.now();
  const reportBase = join(REPORT_DIR, `balance-${settings.mode}-${reportStamp()}`);
  const jobs: Job[] = [...firstRound];
  const results = new Map<number, MatchResult>();

  const save = () => {
    const { body, rawResults } = buildReport(settings, jobs, results);
    const path = writeReport(settings, body, { settings, results: rawResults }, Date.now() - started, reportBase, results.size);
    return { body, path };
  };

  if (settings.games !== null) {
    const queue = [...firstRound];
    await runJobs({ nextJob: () => queue.shift() ?? null, total: firstRound.length, jobs: () => jobs, workers: settings.workers, results });
    const { body, path } = save();
    console.log('');
    for (const line of body) console.log(line);
    console.log(`\n보고서 저장: ${relative(REPO_ROOT, path)} (원본 데이터는 같은 이름의 .json)`);
    return;
  }

  // 계속 반복: 라운드가 끝나면 다음 라운드를 만들고, 주기적으로 보고서를 덮어쓴다
  let round = 0;
  let pending = [...firstRound];
  let lastSave = Date.now();
  const saveQuietly = () => {
    if (results.size === 0) return;
    try {
      save();
      lastSave = Date.now();
    } catch (error) {
      console.error('\n보고서 저장 실패:', error instanceof Error ? error.message : error);
    }
  };
  const stop = (signal: string) => {
    saveQuietly();
    console.log(`\n${signal === 'SIGINT' ? '중단 요청' : '창 닫힘'}: 지금까지 ${results.size}판을 저장했습니다 → ${relative(REPO_ROOT, reportBase)}.md`);
    process.exit(0);
  };
  process.once('SIGINT', () => stop('SIGINT'));
  process.once('SIGHUP', () => stop('SIGHUP'));
  process.once('SIGBREAK', () => stop('SIGINT'));

  await runJobs({
    nextJob: () => {
      if (pending.length === 0) {
        round++;
        pending = buildJobs(settings, round, jobs.length);
        jobs.push(...pending);
      }
      return pending.shift()!;
    },
    total: null,
    jobs: () => jobs,
    workers: settings.workers,
    results,
    onResult: () => {
      const roundDone = results.size % firstRound.length === 0;
      if (roundDone || Date.now() - lastSave >= SAVE_INTERVAL_MS) saveQuietly();
    },
  });
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
