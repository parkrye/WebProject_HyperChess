/**
 * 능력 밸런스 측정 도구 (AI 자가 대국).
 *
 * 실행
 *   - 루트의 balance.bat 더블클릭 → 대화형으로 설정
 *   - npm run balance -- --abilities haste,rewind --opponent none --games 16 --depth 2
 *
 * 인자 (없으면 대화형으로 묻는다)
 *   --abilities <id,id|all>  측정할 능력 (기본 all)
 *   --opponent <id|none>     상대 능력 (기본 none = 능력 없음)
 *   --games <n>              조합당 대국 수, 짝수 권장 (기본 16)
 *   --depth <n>              AI 탐색 깊이 (기본 2)
 *   --opening <n>            무작위로 두는 첫 수 (기본 4)
 *   --max-plies <n>          최대 수, 넘으면 평가값 판정 (기본 160)
 *   --workers <n>            병렬 워커 수 (기본 CPU 코어 - 2)
 *   --yes                    시작 확인 생략
 */
import { getAbility, listAbilities, type Color } from '@hyperchess/engine';
import { mkdirSync, writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { isMainThread, parentPort, Worker } from 'node:worker_threads';
import { playMatch, type MatchResult, type MatchSpec } from './match';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const REPORT_DIR = join(REPO_ROOT, 'reports');
const NONE = 'none';

interface Settings {
  readonly subjects: readonly string[];
  readonly opponent: string | null;
  readonly games: number;
  readonly depth: number;
  readonly opening: number;
  readonly maxPlies: number;
  readonly workers: number;
}

interface Job {
  readonly id: number;
  readonly spec: MatchSpec;
  /** 측정 대상 능력. 대조군(상대끼리 대국)은 null */
  readonly subject: string | null;
  readonly subjectColor: Color;
}

type WorkerMessage = { readonly id: number; readonly result: MatchResult };

/* ---------- 설정 ---------- */

const abilityName = (id: string | null) => (id ? getAbility(id).name : '능력 없음');

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

function parseOpponent(raw: string, ids: readonly string[]): string | null {
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

function settingsFromArgs(ids: readonly string[]): Settings {
  return {
    subjects: parseAbilityList(argValue('abilities') ?? 'all', ids),
    opponent: parseOpponent(argValue('opponent') ?? NONE, ids),
    games: positiveInt(argValue('games'), 16, '대국 수'),
    depth: positiveInt(argValue('depth'), 2, '탐색 깊이'),
    opening: Number(argValue('opening') ?? 4),
    maxPlies: positiveInt(argValue('max-plies'), 160, '최대 수'),
    workers: positiveInt(argValue('workers'), defaultWorkers(), '워커 수'),
  };
}

async function settingsFromPrompt(ids: readonly string[]): Promise<Settings> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log('\n=== HyperChess 능력 밸런스 측정 ===\n');
    ids.forEach((id, index) => console.log(`  ${String(index + 1).padStart(2)}. ${abilityName(id)} (${id})`));
    console.log('');

    const subjects = parseAbilityList(await rl.question('측정할 능력 번호 (쉼표 구분, 엔터 = 전체): '), ids);
    const opponent = parseOpponent(await rl.question('상대 능력 번호 (엔터 = 능력 없음): '), ids);
    const games = positiveInt(await rl.question('조합당 대국 수 (엔터 = 16, 많을수록 정확): '), 16, '대국 수');
    const depth = positiveInt(await rl.question('AI 탐색 깊이 (엔터 = 2, 3 이상은 매우 느림): '), 2, '탐색 깊이');
    return { subjects, opponent, games, depth, opening: 4, maxPlies: 160, workers: defaultWorkers() };
  } finally {
    rl.close();
  }
}

async function confirm(settings: Settings, jobCount: number): Promise<boolean> {
  // 깊이 2 기준 한 판 약 15초, 깊이가 1 늘 때마다 약 4배
  const secondsPerGame = 15 * Math.pow(4, settings.depth - 2);
  const minutes = (jobCount * secondsPerGame) / settings.workers / 60;
  console.log(`\n측정 대상: ${settings.subjects.map(abilityName).join(', ')}`);
  console.log(`상대: ${abilityName(settings.opponent)} / 조합당 ${settings.games}판 / 깊이 ${settings.depth}`);
  console.log(`총 ${jobCount}판 (대조군 포함), 워커 ${settings.workers}개, 예상 약 ${Math.max(1, Math.round(minutes))}분`);
  if (process.argv.includes('--yes') || !process.stdin.isTTY) return true;

  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question('시작할까요? (Y/n): ');
  rl.close();
  return !/^n/i.test(answer.trim());
}

/* ---------- 실행 ---------- */

function buildJobs(settings: Settings): Job[] {
  const search = { maxDepth: settings.depth, timeLimitMs: 600_000, quiescence: true, abilityBranchLimit: 4, noise: 8 };
  const jobs: Job[] = [];
  // 대조군(null): 상대 능력끼리 대국해 선공 이점을 확인
  const subjects: (string | null)[] = [null, ...settings.subjects];

  for (const subject of subjects) {
    for (let game = 0; game < settings.games; game++) {
      const subjectColor: Color = game % 2 === 0 ? 'w' : 'b';
      const subjectAbility = subject ?? settings.opponent;
      const spec: MatchSpec = {
        white: subjectColor === 'w' ? subjectAbility : settings.opponent,
        black: subjectColor === 'b' ? subjectAbility : settings.opponent,
        seed: 1000 + game * 7919,
        randomOpeningPlies: settings.opening,
        maxPlies: settings.maxPlies,
        search,
      };
      jobs.push({ id: jobs.length, spec, subject, subjectColor });
    }
  }
  return jobs;
}

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

/* ---------- 집계·보고서 ---------- */

interface Row {
  readonly label: string;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  asWhite: number;
  asBlack: number;
  uses: number;
  plies: number;
}

const scoreRate = (row: Row) => (row.games ? (row.wins + row.draws / 2) / row.games : 0);

function summarize(settings: Settings, jobs: Job[], results: Map<number, MatchResult>): Row[] {
  const rows = new Map<string, Row>();
  for (const job of jobs) {
    const result = results.get(job.id);
    if (!result) continue;
    const label = job.subject ? abilityName(job.subject) : `(대조군) ${abilityName(settings.opponent)}끼리, 백 기준`;
    const row = rows.get(label) ?? { label, games: 0, wins: 0, draws: 0, losses: 0, asWhite: 0, asBlack: 0, uses: 0, plies: 0 };
    // 대조군은 항상 백 기준으로 집계해 선공 이점을 본다
    const side: Color = job.subject ? job.subjectColor : 'w';
    const points = result.winner === null ? 0.5 : result.winner === side ? 1 : 0;
    row.games++;
    if (points === 1) row.wins++;
    else if (points === 0.5) row.draws++;
    else row.losses++;
    if (side === 'w') row.asWhite += points;
    else row.asBlack += points;
    row.uses += result.abilityUses[job.subjectColor];
    row.plies += result.plies;
    rows.set(label, row);
  }
  return [...rows.values()].sort((a, b) => scoreRate(b) - scoreRate(a));
}

function tableLines(rows: Row[]): string[] {
  const lines = ['| 능력 | 판 | 승-무-패 | 점수율 | 백/흑 점수 | 판당 사용 | 평균 수 |', '|---|---|---|---|---|---|---|'];
  for (const row of rows) {
    const cells = [
      row.label,
      row.games,
      `${row.wins}-${row.draws}-${row.losses}`,
      `${(scoreRate(row) * 100).toFixed(0)}%`,
      `${row.asWhite}/${row.asBlack}`,
      (row.uses / row.games).toFixed(1),
      (row.plies / row.games).toFixed(0),
    ];
    lines.push(`| ${cells.join(' | ')} |`);
  }
  return lines;
}

function writeReport(settings: Settings, rows: Row[], results: Map<number, MatchResult>, elapsedMs: number): string {
  mkdirSync(REPORT_DIR, { recursive: true });
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const base = join(REPORT_DIR, `balance-${stamp}`);
  const margin = Math.round(100 / Math.sqrt(settings.games));

  const markdown = [
    `# 밸런스 측정 ${new Date().toLocaleString('ko-KR')}`,
    '',
    `- 상대: ${abilityName(settings.opponent)}`,
    `- 조합당 ${settings.games}판 (백/흑 번갈아), AI 탐색 깊이 ${settings.depth}, 첫 ${settings.opening}수 무작위, ${settings.maxPlies}수 초과 시 평가값 판정`,
    `- 소요 시간: ${formatDuration(elapsedMs)}`,
    `- 오차: 대략 ±${margin}%p (판 수가 적을수록 큼). AI의 능력 활용 실력이 결과에 섞여 있음`,
    '',
    ...tableLines(rows),
    '',
  ].join('\n');

  writeFileSync(`${base}.md`, markdown);
  writeFileSync(`${base}.json`, JSON.stringify({ settings, rows, results: [...results.values()] }, null, 2));
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
  const rows = summarize(settings, jobs, results);

  console.log('');
  for (const line of tableLines(rows)) console.log(line);
  const reportPath = writeReport(settings, rows, results, Date.now() - started);
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
