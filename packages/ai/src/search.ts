import {
  applyAction,
  legalAbilityOptions,
  legalMoves,
  type Action,
  type GameState,
  type GeneratedMove,
} from '@hyperchess/engine';
import { evaluate, PIECE_VALUE } from './evaluate';

export const MATE_SCORE = 100_000;
const QUIESCENCE_MAX_DEPTH = 4;
/** 능력 사용을 탐색하는 최대 ply (이후는 수만 탐색해 분기 폭발을 막음) */
const ABILITY_MAX_PLY = 1;

export interface SearchOptions {
  readonly maxDepth: number;
  readonly timeLimitMs: number;
  readonly quiescence: boolean;
  /** 노드마다 고려할 능력 사용 후보 수 (정적 평가 상위 N개) */
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

interface Scored {
  readonly action: Action;
  readonly child: GameState;
  score: number;
}

const isCapture = (state: GameState, move: GeneratedMove) => move.kind === 'enPassant' || state.board[move.to] !== null;

function moveOrderScore(state: GameState, move: GeneratedMove): number {
  let score = 0;
  const victim = state.board[move.to];
  const attacker = state.board[move.from];
  if (victim) score += 10 * PIECE_VALUE[victim.type] - (attacker ? PIECE_VALUE[attacker.type] : 0) + 10_000;
  if (move.kind === 'enPassant') score += 10_000;
  if (move.promotion) score += PIECE_VALUE[move.promotion] + 5_000;
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

export class Searcher {
  private nodes = 0;
  private deadline = Infinity;
  private readonly random: () => number;
  private readonly now: () => number;

  constructor(private readonly options: SearchOptions) {
    this.random = options.random ?? Math.random;
    this.now = options.now ?? (() => performance.now());
  }

  search(root: GameState): SearchResult {
    if (root.result.kind !== 'ongoing') throw new Error('Game is over');
    this.nodes = 0;
    this.deadline = Infinity;

    const candidates = this.expand(root, 0);
    if (candidates.length === 0) throw new Error('No legal actions');

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
      if (Math.abs(best.score) >= MATE_SCORE - 100) break;
      if (this.now() - startedAt > this.options.timeLimitMs / 2) break;
    }

    return this.options.noise > 0 ? this.pickWithNoise(candidates, best) : best;
  }

  /** 잡음을 쓰면 모든 후보의 정확한 점수가 필요하므로 루트에서 가지치기하지 않는다 */
  private searchRoot(candidates: Scored[], root: GameState, depth: number) {
    const exact = this.options.noise > 0;
    let alpha = -Infinity;
    for (const candidate of candidates) {
      const { child } = candidate;
      const bound = exact ? -Infinity : alpha;
      const childScore =
        child.turn === root.turn
          ? this.negamax(child, depth - 1, bound, Infinity, 1)
          : this.negamax(child, depth - 1, -Infinity, -bound, 1);
      candidate.score = fromChild(root, child, childScore);
      alpha = Math.max(alpha, candidate.score);
    }
  }

  private pickWithNoise(candidates: Scored[], best: SearchResult): SearchResult {
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

    let best = -Infinity;
    for (const { child } of this.expand(state, ply)) {
      const sameSide = child.turn === state.turn;
      const childScore = sameSide
        ? this.negamax(child, depth - 1, alpha, beta, ply + 1)
        : this.negamax(child, depth - 1, -beta, -alpha, ply + 1);
      const score = fromChild(state, child, childScore);
      if (score > best) best = score;
      if (score > alpha) alpha = score;
      if (alpha >= beta) break;
    }
    return best;
  }

  private quiescence(state: GameState, alpha: number, beta: number, ply: number, qDepth: number): number {
    this.tick();
    if (state.result.kind !== 'ongoing') return terminalScore(state, ply);

    const standPat = evaluate(state, state.turn);
    if (standPat >= beta || qDepth >= QUIESCENCE_MAX_DEPTH) return standPat;
    if (standPat > alpha) alpha = standPat;

    const captures = legalMoves(state)
      .filter((move) => isCapture(state, move) || move.promotion === 'q')
      .sort((a, b) => moveOrderScore(state, b) - moveOrderScore(state, a));

    let best = standPat;
    for (const move of captures) {
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

  /** 정렬된 자식 목록: 좋은 잡기 → 능력 상위 N개 → 나머지 수 */
  private expand(state: GameState, ply: number): Scored[] {
    const moves = legalMoves(state)
      .map((move) => ({ move, order: moveOrderScore(state, move) }))
      .sort((a, b) => b.order - a.order);

    const tactical: Scored[] = [];
    const quiet: Scored[] = [];
    for (const { move, order } of moves) {
      const action: Action = { type: 'move', move };
      const entry = { action, child: applyAction(state, action), score: 0 };
      (order > 0 ? tactical : quiet).push(entry);
    }

    const abilities = ply <= ABILITY_MAX_PLY ? this.rankedAbilities(state) : [];
    return [...tactical, ...abilities, ...quiet];
  }

  private rankedAbilities(state: GameState): Scored[] {
    const color = state.turn;
    return legalAbilityOptions(state)
      .map((params) => {
        const action: Action = { type: 'ability', params };
        const child = applyAction(state, action);
        const quick = child.result.kind === 'ongoing' ? evaluate(child, color) : fromChild(state, child, terminalScore(child, 1));
        return { action, child, score: quick };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, this.options.abilityBranchLimit)
      .map((entry) => ({ ...entry, score: 0 }));
  }
}
