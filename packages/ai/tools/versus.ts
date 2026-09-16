/**
 * AI 버전 비교: 현재 src 탐색기 vs tools/baseline(이전 버전) 을 같은 시간 제한으로 대국시킨다.
 *
 * 사용: npx tsx tools/versus.ts [--games 40] [--ms 500] [--abilities telekinesis,revive] [--mirror] [--json out.json]
 *
 * --seal-baseline 은 기준본이 능력을 아예 쓰지 않게 한다. 같은 평가·같은 가중치인데 한쪽만 능력을
 * 쓰므로, 점수율이 곧 "AI가 그 능력에서 실제로 뽑아내는 이득"이다. 50%에 가까우면 능력을 쥐고도
 * 활용하지 못한다는 뜻이고, 그 능력의 밸런스 수치는 이 AI로 재도 의미가 없다.
 *
 * --mirror 는 대진마다 능력 하나를 뽑아 양쪽에 같은 능력을 준다. 양쪽 능력이 다르면 능력 상성이
 * 결과를 지배해 AI 실력 차이가 묻히므로, 실력을 재려면 동족전이어야 한다.
 *
 * --abilities 는 대진에 쓸 능력을 좁힌다. 일부 능력만 건드렸을 때 그 능력들로만 재면
 * 신호가 희석되지 않아 같은 판 수로 훨씬 또렷하게 보인다 (기본: 전체 16종).
 * 준비: 비교할 이전 버전의 search.ts, evaluate.ts 를 tools/baseline/ 에 복사 (git 추적 안 함).
 * --seal-baseline 은 양쪽 모두 현재 코드를 쓰므로 baseline/ 준비가 필요 없다.
 */
import { applyAction, createGame, listAbilities, type Color, type GameState } from '@hyperchess/engine';
import { writeFileSync } from 'node:fs';
import { cpus } from 'node:os';
import { isMainThread, parentPort, Worker } from 'node:worker_threads';
import { Searcher as CurrentSearcher } from '../src/search';
import { evaluate } from '../src/evaluate';
import { seededRandom } from './match';

interface Job {
  readonly id: number;
  readonly currentColor: Color;
  readonly abilities: Record<Color, string>;
  readonly seed: number;
  readonly ms: number;
  readonly sealBaseline: boolean;
}

interface Outcome {
  readonly id: number;
  readonly currentScore: number;
  readonly reason: string;
  readonly plies: number;
  readonly depth: Record<'current' | 'baseline', number>;
  /** 이 판이 예외로 끝났으면 그 내용. 집계에서 빼고 끝에 개수만 센다 */
  readonly failed?: string;
}

const MAX_PLIES = 160;

/** 기준본은 git에 없으므로 타입 검사가 경로를 해석하지 않도록 변수로 가져온다 */
async function loadBaseline(): Promise<typeof CurrentSearcher> {
  const baselinePath = './baseline/search.ts';
  const { Searcher } = (await import(baselinePath)) as { Searcher: typeof CurrentSearcher };
  return Searcher;
}

async function playVersus(job: Job): Promise<Outcome> {
  const options = { maxDepth: 12, timeLimitMs: job.ms, quiescence: true, abilityBranchLimit: 4, noise: 0 };
  const random = seededRandom(job.seed);
  const current = new CurrentSearcher({ ...options, random });
  // 봉인 진단의 전제는 "같은 코드·같은 가중치인데 한쪽만 능력을 못 본다"이다. 여기서 기준본 스냅샷을
  // 쓰면 스냅샷이 현재와 어긋난 만큼 결과가 오염되므로, 봉인일 때는 현재 탐색기를 양쪽에 쓴다.
  const baseline = job.sealBaseline
    ? new CurrentSearcher({ ...options, abilityBranchLimit: 0, random })
    : new (await loadBaseline())({ ...options, random });
  const depthSum = { current: 0, baseline: 0 };
  const moves = { current: 0, baseline: 0 };

  let state: GameState = createGame({ abilities: job.abilities });
  let plies = 0;
  while (state.result.kind === 'ongoing' && plies < MAX_PLIES) {
    const side = state.turn === job.currentColor ? 'current' : 'baseline';
    const result = (side === 'current' ? current : baseline).search(state);
    depthSum[side] += result.depth;
    moves[side]++;
    state = applyAction(state, result.action);
    plies++;
  }

  let currentScore = 0.5;
  let reason: string = state.result.kind === 'ongoing' ? 'adjudicated' : state.result.kind === 'win' ? state.result.reason : state.result.reason;
  if (state.result.kind === 'win') currentScore = state.result.winner === job.currentColor ? 1 : 0;
  if (state.result.kind === 'ongoing') {
    const score = evaluate(state, job.currentColor);
    currentScore = score > 250 ? 1 : score < -250 ? 0 : 0.5;
  }
  return {
    id: job.id,
    currentScore,
    reason,
    plies,
    depth: { current: depthSum.current / Math.max(1, moves.current), baseline: depthSum.baseline / Math.max(1, moves.baseline) },
  };
}

if (!isMainThread) {
  parentPort!.on('message', async (job: Job) => {
    try {
      parentPort!.postMessage(await playVersus(job));
    } catch (error) {
      // 한 판이 터졌다고 몇 시간짜리 측정을 통째로 버리지 않는다. 무승부로 넘기면 결과가
      // 조용히 왜곡되므로, 집계에서 빼고 끝에 개수로 드러낸다
      const failed = error instanceof Error ? error.message : String(error);
      parentPort!.postMessage({ id: job.id, currentScore: 0.5, reason: 'error', plies: 0, depth: { current: 0, baseline: 0 }, failed });
    }
  });
} else {
  const arg = (name: string, fallback: number) => {
    const index = process.argv.indexOf(`--${name}`);
    return index >= 0 ? Number(process.argv[index + 1]) : fallback;
  };
  const games = arg('games', 40);
  const ms = arg('ms', 500);
  const all = listAbilities().map((a) => a.id);
  const chosen = process.argv[process.argv.indexOf('--abilities') + 1] ?? '';
  const abilities = process.argv.includes('--abilities') ? chosen.split(',').map((id) => id.trim()).filter(Boolean) : all;
  const unknown = abilities.filter((id) => !all.includes(id));
  if (abilities.length === 0 || unknown.length > 0) throw new Error('쓸 수 없는 --abilities 값: ' + chosen + ' (가능: ' + all.join(', ') + ')');
  const pick = seededRandom(99);

  const mirror = process.argv.includes('--mirror');
  const sealBaseline = process.argv.includes('--seal-baseline');
  const jobs: Job[] = [];
  for (let i = 0; i < games; i += 2) {
    // 동족전은 능력을 돌아가며 배정한다. 무작위로 뽑으면 어떤 능력은 6판, 어떤 능력은 26판이 되어
    // 전체 점수율의 분산이 커지고 능력별 수치도 서로 비교하기 어렵다
    const one = mirror ? abilities[(i / 2) % abilities.length] : abilities[Math.floor(pick() * abilities.length)];
    const pair = mirror ? { w: one, b: one } : { w: one, b: abilities[Math.floor(pick() * abilities.length)] };
    for (const currentColor of ['w', 'b'] as const) {
      jobs.push({ id: jobs.length, currentColor, abilities: pair, seed: 500 + i, ms, sealBaseline });
    }
  }

  const queue = [...jobs];
  const outcomes: Outcome[] = [];
  const workerCount = Math.min(jobs.length, cpus().length - 2);
  console.log(`대국 ${jobs.length}판 (수당 ${ms}ms), 워커 ${workerCount}개, 능력 ${abilities.length}종${mirror ? ' · 동족전' : ''}${sealBaseline ? ' · 기준본 능력 봉인' : ''}`);

  await Promise.all(
    Array.from({ length: workerCount }, () => {
      const worker = new Worker(new URL('./worker-bootstrap.mjs', import.meta.url), { workerData: { entry: import.meta.url } });
      return new Promise<void>((resolve, reject) => {
        const next = () => {
          const job = queue.shift();
          if (job) worker.postMessage(job);
          else void worker.terminate().then(() => resolve());
        };
        worker.on('message', (outcome: Outcome) => {
          outcomes.push(outcome);
          next();
        });
        worker.on('error', reject);
        next();
      });
    }),
  );

  const failures = outcomes.filter((o) => o.failed);
  const played = outcomes.filter((o) => !o.failed);
  if (failures.length > 0) console.log(`예외로 버린 판 ${failures.length}개 — 첫 예외: ${failures[0].failed}`);
  if (played.length === 0) throw new Error('집계할 판이 없다');

  const score = played.reduce((sum, o) => sum + o.currentScore, 0);
  const wins = played.filter((o) => o.currentScore === 1).length;
  const draws = played.filter((o) => o.currentScore === 0.5).length;
  const avg = (key: 'current' | 'baseline') => (played.reduce((s, o) => s + o.depth[key], 0) / played.length).toFixed(2);
  console.log(`현재 vs 기준본: ${wins}승 ${draws}무 ${played.length - wins - draws}패, 점수율 ${((score / played.length) * 100).toFixed(0)}%`);
  console.log(`평균 탐색 깊이: 현재 ${avg('current')} / 기준본 ${avg('baseline')}`);

  // 동족전이면 능력별로 갈라 보여준다. 어느 능력이 나빠졌는지가 바로 드러난다
  const abilityOf = new Map(jobs.map((job) => [job.id, job.abilities.w]));
  const perAbility: Record<string, { score: number; games: number }> = {};
  if (mirror) {
    for (const outcome of played) {
      const id = abilityOf.get(outcome.id)!;
      perAbility[id] ??= { score: 0, games: 0 };
      perAbility[id].score += outcome.currentScore;
      perAbility[id].games++;
    }
    const rows = Object.entries(perAbility).sort((a, b) => a[1].score / a[1].games - b[1].score / b[1].games);
    console.log('능력별 점수율 (낮은 순)');
    for (const [id, stat] of rows) {
      console.log(`  ${id.padEnd(14)} ${((stat.score / stat.games) * 100).toFixed(0).padStart(3)}%  (${stat.games}판)`);
    }
  }

  const jsonIndex = process.argv.indexOf('--json');
  if (jsonIndex >= 0 && process.argv[jsonIndex + 1]) {
    const summary = {
      games: played.length,
      failed: failures.length,
      wins,
      draws,
      losses: played.length - wins - draws,
      scoreRate: score / played.length,
      mirror,
      depth: { current: Number(avg('current')), baseline: Number(avg('baseline')) },
      perAbility,
    };
    writeFileSync(process.argv[jsonIndex + 1], JSON.stringify(summary, null, 2));
  }
}
