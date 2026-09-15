export const ELO_K = 32;

/** a가 b를 상대로 얻을 기대 점수 (0~1) */
export const expectedScore = (a: number, b: number) => 1 / (1 + 10 ** ((b - a) / 400));

/** 실제 점수(승 1 · 무 0.5 · 패 0)를 반영한 새 레이팅 */
export const nextRating = (rating: number, opponent: number, score: number, k = ELO_K) =>
  Math.round(rating + k * (score - expectedScore(rating, opponent)));
