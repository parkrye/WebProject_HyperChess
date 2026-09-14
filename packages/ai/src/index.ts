import type { GameState } from '@hyperchess/engine';
import { Searcher, type SearchOptions, type SearchResult } from './search';

export type Difficulty = 'easy' | 'normal' | 'hard';

export const DIFFICULTY_PRESETS: Readonly<Record<Difficulty, SearchOptions>> = {
  easy: { maxDepth: 1, timeLimitMs: 600, quiescence: false, abilityBranchLimit: 3, noise: 140 },
  normal: { maxDepth: 3, timeLimitMs: 1500, quiescence: true, abilityBranchLimit: 4, noise: 12 },
  hard: { maxDepth: 5, timeLimitMs: 4000, quiescence: true, abilityBranchLimit: 6, noise: 0 },
};

export function chooseAction(state: GameState, difficulty: Difficulty, overrides: Partial<SearchOptions> = {}): SearchResult {
  return new Searcher({ ...DIFFICULTY_PRESETS[difficulty], ...overrides }).search(state);
}

export { evaluate } from './evaluate';
export { MATE_SCORE, Searcher, type SearchOptions, type SearchResult } from './search';
