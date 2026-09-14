import {
  applyAction,
  isInCheck,
  legalAbilityOptions,
  legalMoves,
  type AbilityParams,
  type Action,
  type GameState,
  type GeneratedMove,
} from '@hyperchess/engine';
import { evaluate, materialValue, PIECE_VALUE } from './evaluate';

export const MATE_SCORE = 100_000;
const MATE_THRESHOLD = MATE_SCORE - 1_000;
const QUIESCENCE_MAX_DEPTH = 4;
const DELTA_MARGIN = 200;
const TT_MAX_ENTRIES = 300_000;
/** 루트·상대 응수 이후 자기 차례에서 고려할 능력 후보 수 (여러 턴에 걸친 능력 계획용) */
const DEEP_ABILITY_LIMIT = 2;
/** Late Move Reduction 적용 조건 */
const LMR_MIN_DEPTH = 3;
const LMR_MIN_INDEX = 4;

export interface SearchOptions {
  readonly maxDepth: number;
  readonly timeLimitMs: number;
  readonly quiescence: boolean;
  /** 루트와 바로 다음 ply에서 고려할 능력 사용 후보 수 (정적 평가 상위 N개) */
  readonly abilityBranchLimit: number;
  /** 루트 점수에 더하는 무작위 잡음 폭 (낮은 난이도용) */
  readonly noise: number;
  readonly random?: () => number;
  readonly now?: () => number;
}

export interface SearchResult {
  readonly action: Action;
  readonly score: number;
  readonly depth: number;
  readonly nodes: number;
}

class SearchTimeout extends Error {}

const enum Bound {
  Exact,
  Lower,
  Upper,
}

interface TTEntry {
  readonly depth: number;
  readonly score: number;
  readonly bound: Bound;
  readonly best: string | null;
}

interface Candidate {
  readonly action: Action;
  readonly key: string;
  readonly order: number;
  readonly quiet: boolean;
  child?: GameState;
  score: number;
}

/* ---------- 키 ---------- */

function paramsKey(params: AbilityParams): string {
  return Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join(',');
}

export function actionKey(action: Action): string {
  if (action.type === 'ability') return `a:${paramsKey(action.params)}`;
  const { from, to, promotion } = action.move;
  return `m:${from}-${to}${promotion ?? ''}`;
}

/** 탐색용 국면 키. 능력 자원·턴 상태까지 포함한다 */
function stateKey(state: GameState): string {
  let key = '';
  for (const piece of state.board) {
    if (!piece) {
      key += '.';
      continue;
    }
    key += piece.color === 'w' ? piece.type.toUpperCase() : piece.type;
    if (piece.enhanced) key += '+';
    if (piece.royal && piece.type !== 'k') key += '!';
    if (piece.title) key += piece.title[0];
    if (!piece.moved && (piece.type === 'k' || piece.type === 'r')) key += '*';
  }
  const { turnState, players, enPassant } = state;
  key += `|${state.turn}${enPassant?.target ?? '-'}${turnState.movesMade}${turnState.movesAllowed}${turnState.abilityUsed ? 'u' : ''}`;
  for (const color of ['w', 'b'] as const) {
    const { meter, rules, abilityId } = players[color];
    key += `|${meter.resource},${meter.cooldown}${rules.queensRoyal ? 'E' : ''}`;
    // 시간 역행은 되돌아갈 과거 턴 수에 따라 선택지가 달라진다
    if (abilityId === 'rewind') key += `h${state.history.length}`;
    // 부활은 잡힌 말 목록에 따라 선택지가 달라진다
    if (abilityId === 'revive') key += `c${state.captured[color].length}`;
  }
  return key;
}

const toTT = (score: number, ply: number) => (score >= MATE_THRESHOLD ? score + ply : score <= -MATE_THRESHOLD ? score - ply : score);
const fromTT = (score: number, ply: number) => (score >= MATE_THRESHOLD ? score - ply : score <= -MATE_THRESHOLD ? score + ply : score);

/* ---------- 점수 도우미 ---------- */

/** 승급 킹은 PIECE_VALUE.k(왕족 기준 0)가 아닌 별도 가치로 본다 */
const promotionValue = (move: GeneratedMove) => (move.promotion === 'k' ? 350 : move.promotion ? PIECE_VALUE[move.promotion] : 0);

const isCapture = (state: GameState, move: GeneratedMove) => move.kind === 'enPassant' || state.board[move.to] !== null;

function captureOrder(state: GameState, move: GeneratedMove): number {
  let score = 0;
  const victim = state.board[move.to];
  const attacker = state.board[move.from];
  if (victim) score += 10 * materialValue(victim) - (attacker ? materialValue(attacker) : 0);
  if (move.kind === 'enPassant') score += 900;
  if (move.promotion) score += promotionValue(move);
  return score;
}

function terminalScore(state: GameState, ply: number): number {
  const { result } = state;
  if (result.kind !== 'win') return 0;
  const mate = MATE_SCORE - ply;
  return result.winner === state.turn ? mate : -mate;
}

/** 자식 점수를 부모(state.turn) 관점으로 변환. 가속·시간 역행처럼 같은 쪽이 계속 두면 부호를 유지한다 */
const fromChild = (parent: GameState, child: GameState, childScore: number) =>
  child.turn === parent.turn ? childScore : -childScore;

/* ---------- 탐색기 ---------- */

export class Searcher {
  private nodes = 0;
  private deadline = Infinity;
  private readonly random: () => number;
  private readonly now: () => number;
  private readonly table = new Map<string, TTEntry>();
  private killers: string[][] = [];
  private readonly history = new Map<string, number>();

  constructor(private readonly options: SearchOptions) {
    this.random = options.random ?? Math.random;
    this.now = options.now ?? (() => performance.now());
  }

  search(input: GameState): SearchResult {
    if (input.result.kind !== 'ongoing') throw new Error('Game is over');
    // 탐색 중 가상의 수 적용이 실제 시계를 소모하지 않도록 시간 제한을 끈다
    const root: GameState = input.clock ? { ...input, clock: null } : input;
    this.nodes = 0;
    this.deadline = Infinity;
    this.killers = [];
    if (this.table.size > TT_MAX_ENTRIES) this.table.clear();

    const candidates = this.generate(root, 0, this.options.maxDepth, null);
    if (candidates.length === 0) throw new Error('No legal actions');
    for (const candidate of candidates) candidate.child ??= applyAction(root, candidate.action);

    let best: SearchResult = { action: candidates[0].action, score: 0, depth: 0, nodes: 0 };
    if (candidates.length === 1) return { ...best, nodes: 1 };

    const startedAt = this.now();
    for (let depth = 1; depth <= this.options.maxDepth; depth++) {
      // 첫 깊이는 반드시 끝까지 탐색해 최소한의 수를 보장
      this.deadline = depth === 1 ? Infinity : startedAt + this.options.timeLimitMs;
      try {
        this.searchRoot(candidates, root, depth);
      } catch (error) {
        if (error instanceof SearchTimeout) break;
        throw error;
      }
      candidates.sort((a, b) => b.score - a.score);
      best = { action: candidates[0].action, score: candidates[0].score, depth, nodes: this.nodes };
      if (Math.abs(best.score) >= MATE_THRESHOLD) break;
      if (this.now() - startedAt > this.options.timeLimitMs / 2) break;
    }

    return this.options.noise > 0 ? this.pickWithNoise(candidates, best) : best;
  }

  /** 잡음을 쓰면 모든 후보의 정확한 점수가 필요하므로 루트에서 가지치기하지 않는다 */
  private searchRoot(candidates: Candidate[], root: GameState, depth: number) {
    const exact = this.options.noise > 0;
    let alpha = -Infinity;
    for (const candidate of candidates) {
      const child = candidate.child!;
      const bound = exact ? -Infinity : alpha;
      const childScore =
        child.turn === root.turn
          ? this.negamax(child, depth - 1, bound, Infinity, 1)
          : this.negamax(child, depth - 1, -Infinity, -bound, 1);
      candidate.score = fromChild(root, child, childScore);
      alpha = Math.max(alpha, candidate.score);
    }
  }

  private pickWithNoise(candidates: Candidate[], best: SearchResult): SearchResult {
    let chosen = candidates[0];
    let chosenScore = -Infinity;
    for (const candidate of candidates) {
      const noisy = candidate.score + (this.random() * 2 - 1) * this.options.noise;
      if (noisy > chosenScore) {
        chosen = candidate;
        chosenScore = noisy;
      }
    }
    return { ...best, action: chosen.action, score: chosen.score };
  }

  private tick() {
    this.nodes++;
    if ((this.nodes & 63) === 0 && this.now() > this.deadline) throw new SearchTimeout();
  }

  private negamax(state: GameState, depth: number, alpha: number, beta: number, ply: number): number {
    this.tick();
    if (state.result.kind !== 'ongoing') return terminalScore(state, ply);
    if (depth <= 0) {
      return this.options.quiescence ? this.quiescence(state, alpha, beta, ply, 0) : evaluate(state, state.turn);
    }

    const key = stateKey(state);
    const entry = this.table.get(key);
    if (entry && entry.depth >= depth) {
      const score = fromTT(entry.score, ply);
      if (entry.bound === Bound.Exact) return score;
      if (entry.bound === Bound.Lower && score >= beta) return score;
      if (entry.bound === Bound.Upper && score <= alpha) return score;
    }

    const alphaOrigin = alpha;
    let best = -Infinity;
    let bestKey: string | null = null;

    const inCheck = isInCheck(state, state.turn);
    const candidates = this.generate(state, ply, depth, entry?.best ?? null);
    for (let index = 0; index < candidates.length; index++) {
      const candidate = candidates[index];
      const child = candidate.child ?? applyAction(state, candidate.action);

      let score: number;
      const reduce = depth >= LMR_MIN_DEPTH && index >= LMR_MIN_INDEX && candidate.quiet && !inCheck && alpha > -Infinity;
      if (reduce) {
        // 늦게 정렬된 조용한 수는 얕은 null-window 탐색으로 먼저 확인하고, alpha를 넘을 때만 다시 깊게 본다
        score = this.childScore(state, child, depth - 2, alpha, alpha + 1, ply);
        if (score > alpha) score = this.childScore(state, child, depth - 1, alpha, beta, ply);
      } else {
        score = this.childScore(state, child, depth - 1, alpha, beta, ply);
      }

      if (score > best) {
        best = score;
        bestKey = candidate.key;
      }
      if (score > alpha) alpha = score;
      if (alpha >= beta) {
        if (candidate.quiet) this.rememberCutoff(candidate.key, ply, depth);
        break;
      }
    }

    const bound = best <= alphaOrigin ? Bound.Upper : best >= beta ? Bound.Lower : Bound.Exact;
    this.table.set(key, { depth, score: toTT(best, ply), bound, best: bestKey });
    return best;
  }

  /** 부모(state) 관점의 창 [alpha, beta]로 자식을 탐색해 부모 관점 점수를 돌려준다 */
  private childScore(state: GameState, child: GameState, depth: number, alpha: number, beta: number, ply: number): number {
    if (child.turn === state.turn) return this.negamax(child, depth, alpha, beta, ply + 1);
    return -this.negamax(child, depth, -beta, -alpha, ply + 1);
  }

  private rememberCutoff(key: string, ply: number, depth: number) {
    const killers = (this.killers[ply] ??= []);
    if (killers[0] !== key) {
      killers.unshift(key);
      killers.length = Math.min(killers.length, 2);
    }
    this.history.set(key, (this.history.get(key) ?? 0) + depth * depth);
  }

  private quiescence(state: GameState, alpha: number, beta: number, ply: number, qDepth: number): number {
    this.tick();
    if (state.result.kind !== 'ongoing') return terminalScore(state, ply);

    const standPat = evaluate(state, state.turn);
    if (standPat >= beta || qDepth >= QUIESCENCE_MAX_DEPTH) return standPat;
    if (standPat > alpha) alpha = standPat;

    const captures = legalMoves(state)
      .filter((move) => isCapture(state, move) || move.promotion === 'q' || move.promotion === 'k')
      .map((move) => ({ move, order: captureOrder(state, move) }))
      .sort((a, b) => b.order - a.order);

    let best = standPat;
    for (const { move } of captures) {
      const victim = state.board[move.to];
      const gain = (victim ? materialValue(victim) : PIECE_VALUE.p) + promotionValue(move);
      // 델타 가지치기: 잡아도 alpha에 못 미치는 잡기는 건너뛴다 (가속으로 연속 두는 경우는 예외)
      if (standPat + gain + DELTA_MARGIN < alpha && state.turnState.movesAllowed === 1) continue;

      const child = applyAction(state, { type: 'move', move });
      const sameSide = child.turn === state.turn;
      const childScore = sameSide
        ? this.quiescence(child, alpha, beta, ply + 1, qDepth + 1)
        : this.quiescence(child, -beta, -alpha, ply + 1, qDepth + 1);
      const score = fromChild(state, child, childScore);
      if (score > best) best = score;
      if (score > alpha) alpha = score;
      if (alpha >= beta) break;
    }
    return best;
  }

  /**
   * 정렬된 후보 목록. 수는 적용하지 않고(지연 적용) 순서만 매긴다.
   * 순서: TT 최선 → 잡기/프로모션 → 능력 → 킬러 → 히스토리 순 조용한 수
   */
  private generate(state: GameState, ply: number, depth: number, ttBest: string | null): Candidate[] {
    const killers = this.killers[ply] ?? [];
    const candidates: Candidate[] = legalMoves(state).map((move) => {
      const action: Action = { type: 'move', move };
      const key = actionKey(action);
      const tactical = isCapture(state, move) || !!move.promotion;
      let order: number;
      if (key === ttBest) order = 10_000_000;
      else if (tactical) order = 1_000_000 + captureOrder(state, move);
      else if (killers.includes(key)) order = 800_000 - killers.indexOf(key);
      else order = this.history.get(key) ?? 0;
      return { action, key, order, quiet: !tactical, score: 0 };
    });

    const limit = this.abilityLimit(state, ply, depth);
    if (limit > 0) {
      this.rankedAbilities(state, limit).forEach((candidate, rank) => {
        candidates.push({ ...candidate, order: candidate.key === ttBest ? 10_000_000 : 900_000 - rank });
      });
    }
    return candidates.sort((a, b) => b.order - a.order);
  }

  private abilityLimit(state: GameState, ply: number, depth: number): number {
    if (ply <= 1) return this.options.abilityBranchLimit;
    // 더 깊은 곳에서는 루트 플레이어 차례(짝수 ply)이고 남은 깊이가 있을 때만 소수 탐색
    const ownTurn = ply % 2 === 0;
    return ownTurn && depth >= 2 && state.players[state.turn].abilityId ? DEEP_ABILITY_LIMIT : 0;
  }

  private rankedAbilities(state: GameState, limit: number): Candidate[] {
    const color = state.turn;
    return legalAbilityOptions(state)
      .map((params) => {
        const action: Action = { type: 'ability', params };
        const child = applyAction(state, action);
        const quick = child.result.kind === 'ongoing' ? evaluate(child, color) : fromChild(state, child, terminalScore(child, 1));
        return { action, key: actionKey(action), order: quick, quiet: false, child, score: 0 };
      })
      .sort((a, b) => b.order - a.order)
      .slice(0, limit);
  }
}
