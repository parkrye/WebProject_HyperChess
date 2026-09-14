/**
 * 능력 밸런스 측정: 각 능력을 "능력 없음" 상대와 백/흑으로 번갈아 AI 자가 대국시켜 점수율을 낸다.
 *
 * 사용: npm run balance -w @hyperchess/ai -- [--games 8] [--depth 2] [--abilities haste,rewind] [--out result.json]
 */
import { listAbilities } from '@hyperchess/engine';
import { writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { isMainThread, parentPort, Worker } from 'node:worker_threads';
import { playMatch, type MatchResult, type MatchSpec } from './match';

interface Job {
  readonly id: number;
  readonly spec: MatchSpec;
  /** 측정 대상 능력 (baseline이면 null) */
  readonly subject: string | null;
  readonly subjectColor: 'w' | 'b';
}

type WorkerMessage = { readonly id: number; readonly result: MatchResult };

if (!isMainThread) {
  parentPort!.on('message', (job: Job) => {
    parentPort!.postMessage({ id: job.id, result: playMatch(job.spec) } satisfies WorkerMessage);
  });
} else {
  await main();
}

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function buildJobs(): Job[] {
  const games = Number(argValue('games') ?? 8);
  const depth = Number(argValue('depth') ?? 2);
  const filter = argValue('abilities')?.split(',');
  const abilities = listAbilities().map((a) => a.id).filter((id) => !filter || filter.includes(id));
  const search = { maxDepth: depth, timeLimitMs: 120_000, quiescence: true, abilityBranchLimit: 4, noise: 8 };

  const jobs: Job[] = [];
  const subjects: (string | null)[] = [null, ...abilities];
  for (const subject of subjects) {
    for (let game = 0; game < games; game++) {
      const subjectColor = game % 2 === 0 ? 'w' : 'b';
      const spec: MatchSpec = {
        white: subjectColor === 'w' ? subject : null,
        black: subjectColor === 'b' ? subject : null,
        seed: 1000 + game * 7919,
        randomOpeningPlies: 4,
        maxPlies: 160,
        search,
      };
      jobs.push({ id: jobs.length, spec, subject, subjectColor });
    }
  }
  return jobs;
}

async function runJobs(jobs: Job[]): Promise<Map<number, MatchResult>> {
  const results = new Map<number, MatchResult>();
  const workerCount = Math.max(1, Math.min(jobs.length, cpus().length - 2));
  const queue = [...jobs].sort((a, b) => (a.subject ?? '').localeCompare(b.subject ?? ''));
  const started = Date.now();

  await Promise.all(
    Array.from({ length: workerCount }, () => {
      const worker = new Worker(new URL('./worker-bootstrap.mjs', import.meta.url), { workerData: { entry: import.meta.url } });
      return new Promise<void>((resolve, reject) => {
        const next = () => {
          const job = queue.shift();
          if (!job) {
            void worker.terminate().then(() => resolve());
            return;
          }
          worker.postMessage(job);
        };
        worker.on('message', ({ id, result }: WorkerMessage) => {
          results.set(id, result);
          const elapsed = ((Date.now() - started) / 1000).toFixed(0);
          process.stdout.write(`\r진행 ${results.size}/${jobs.length} (${elapsed}s)`);
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

interface Row {
  subject: string;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  uses: number;
  plies: number;
  asWhite: number;
  asBlack: number;
}

function summarize(jobs: Job[], results: Map<number, MatchResult>): Row[] {
  const rows = new Map<string, Row>();
  for (const job of jobs) {
    const result = results.get(job.id);
    if (!result) continue;
    const key = job.subject ?? '(없음 vs 없음: 백 기준)';
    const row = rows.get(key) ?? { subject: key, games: 0, wins: 0, draws: 0, losses: 0, uses: 0, plies: 0, asWhite: 0, asBlack: 0 };
    // baseline은 항상 백 기준으로 집계해 선공 이점을 본다
    const side = job.subject ? job.subjectColor : 'w';
    const points = result.winner === null ? 0.5 : result.winner === side ? 1 : 0;
    row.games++;
    if (points === 1) row.wins++;
    else if (points === 0.5) row.draws++;
    else row.losses++;
    if (side === 'w') row.asWhite += points;
    else row.asBlack += points;
    row.uses += result.abilityUses[job.subjectColor];
    row.plies += result.plies;
    rows.set(key, row);
  }
  return [...rows.values()];
}

function printTable(rows: Row[]) {
  const pct = (n: number, d: number) => (d ? `${((n / d) * 100).toFixed(0)}%` : '-');
  console.log('\n능력           | 판 | 승-무-패 | 점수율 | 백/흑 점수 | 판당 사용 | 평균 수');
  console.log('---------------|----|----------|--------|------------|-----------|--------');
  for (const row of rows.sort((a, b) => (b.wins + b.draws / 2) / b.games - (a.wins + a.draws / 2) / a.games)) {
    const score = row.wins + row.draws / 2;
    console.log(
      [
        row.subject.padEnd(14),
        String(row.games).padStart(2),
        `${row.wins}-${row.draws}-${row.losses}`.padEnd(8),
        pct(score, row.games).padStart(6),
        `${row.asWhite}/${row.asBlack}`.padStart(10),
        (row.uses / row.games).toFixed(1).padStart(9),
        (row.plies / row.games).toFixed(0).padStart(6),
      ].join(' | '),
    );
  }
}

async function main() {
  const jobs = buildJobs();
  console.log(`대국 ${jobs.length}판, 워커 ${Math.min(jobs.length, cpus().length - 2)}개`);
  const results = await runJobs(jobs);
  const rows = summarize(jobs, results);
  printTable(rows);

  const out = argValue('out');
  if (out) {
    writeFileSync(out, JSON.stringify({ rows, results: [...results.values()] }, null, 2));
    console.log(`\n결과 저장: ${out}`);
  }
}
