import { applyAction, createGame, legalMoves, type Color, type GameState } from '@hyperchess/engine';
import { evaluate } from '../src/evaluate';
import { Searcher, type SearchOptions } from '../src/search';

export interface MatchSpec {
  readonly white: string | null;
  readonly black: string | null;
  readonly seed: number;
  readonly randomOpeningPlies: number;
  readonly maxPlies: number;
  readonly search: Omit<SearchOptions, 'random'>;
}

export interface MatchResult {
  readonly spec: MatchSpec;
  readonly winner: Color | null;
  readonly reason: string;
  readonly plies: number;
  readonly abilityUses: Record<Color, number>;
  readonly ms: number;
}

/** 재현 가능한 선형 합동 난수 */
export function seededRandom(seed: number): () => number {
  let value = seed >>> 0 || 1;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

const ADJUDICATE_MARGIN = 250;

export function playMatch(spec: MatchSpec): MatchResult {
  const started = performance.now();
  const random = seededRandom(spec.seed);
  const searcher = new Searcher({ ...spec.search, random });
  let state: GameState = createGame({ abilities: { w: spec.white, b: spec.black } });
  const abilityUses: Record<Color, number> = { w: 0, b: 0 };
  let plies = 0;

  while (state.result.kind === 'ongoing' && plies < spec.maxPlies) {
    const mover = state.turn;
    if (plies < spec.randomOpeningPlies) {
      const moves = legalMoves(state);
      state = applyAction(state, { type: 'move', move: moves[Math.floor(random() * moves.length)] });
    } else {
      const { action } = searcher.search(state);
      if (action.type === 'ability') abilityUses[mover]++;
      state = applyAction(state, action);
    }
    plies++;
  }

  const ms = performance.now() - started;
  if (state.result.kind === 'win') return { spec, winner: state.result.winner, reason: state.result.reason, plies, abilityUses, ms };
  if (state.result.kind === 'draw') return { spec, winner: null, reason: state.result.reason, plies, abilityUses, ms };

  const score = evaluate(state, 'w');
  const winner: Color | null = score > ADJUDICATE_MARGIN ? 'w' : score < -ADJUDICATE_MARGIN ? 'b' : null;
  return { spec, winner, reason: winner ? 'adjudicated' : 'adjudicatedDraw', plies, abilityUses, ms };
}
