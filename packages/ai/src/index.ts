import type { GameState } from '@hyperchess/engine';
import { Searcher, type SearchOptions, type SearchResult } from './search';

export type Difficulty = 'easy' | 'normal' | 'hard';

export const DIFFICULTY_PRESETS: Readonly<Record<Difficulty, SearchOptions>> = {
  easy: { maxDepth: 1, timeLimitMs: 600, quiescence: false, abilityBranchLimit: 3, noise: 140 },
  normal: { maxDepth: 3, timeLimitMs: 1500, quiescence: true, abilityBranchLimit: 4, noise: 12 },
  // 어려움은 깊이 제한 없이 시간 안에서 최대한 깊게 본다
  hard: { maxDepth: 12, timeLimitMs: 4000, quiescence: true, abilityBranchLimit: 6, noise: 0 },
};

/** 난이도별 탐색기를 재사용해 트랜스포지션 테이블·히스토리를 수 사이에 유지한다 */
const cachedSearchers = new Map<Difficulty, Searcher>();

export function chooseAction(state: GameState, difficulty: Difficulty, overrides: Partial<SearchOptions> = {}): SearchResult {
  if (Object.keys(overrides).length > 0) {
    return new Searcher({ ...DIFFICULTY_PRESETS[difficulty], ...overrides }).search(state);
  }
  let searcher = cachedSearchers.get(difficulty);
  if (!searcher) {
    searcher = new Searcher(DIFFICULTY_PRESETS[difficulty]);
    cachedSearchers.set(difficulty, searcher);
  }
  return searcher.search(state);
}

export { evaluate } from './evaluate';
export { actionKey, MATE_SCORE, Searcher, type SearchOptions, type SearchResult } from './search';
