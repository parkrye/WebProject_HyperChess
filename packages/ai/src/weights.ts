/**
 * 평가 가중치 (센티폰 단위, 폰 = 100 고정).
 * 부호가 있는 값이다: 음수는 감점 항목.
 * tools/tune.ts(Texel 튜닝)의 --apply가 이 파일을 다시 쓴다.
 */
export const WEIGHTS: Readonly<Record<string, number>> = {
  'piece.p': 100,
  'piece.n': 320,
  'piece.b': 330,
  'piece.r': 500,
  'piece.q': 900,
  promotedKing: 350,
  'enhanced.p': 140,
  'enhanced.n': 480,
  'enhanced.b': 220,
  'enhanced.r': 130,
  pawnAdvance: 8,
  pawnCenter: 10,
  knightCenter: 12,
  bishopCenter: 6,
  queenCenter: 3,
  royalKingCenter: -8,
  rookOpenFile: 15,
  passedPawn: 15,
  passedPawnAdvance: 10,
  doubledPawn: -12,
  bishopPair: 30,
  extraRoyal: 1200,
  empressActive: 150,
  inCheck: -40,
  cooldown: -5,
  'resource.telekinesis': 35,
  'resource.haste': 35,
  'resource.teleport': 35,
  'resource.revive': 35,
  'resource.rewind': 35,
  'resource.heavyInfantry': 35,
  'resource.lancer': 35,
  'resource.chariot': 35,
  'resource.paladin': 35,
  'resource.empress': 35,
  'resource.heir': 35,
};

/**
 * 능력별 보정값 (공통 가중치에 더한다, 0인 항목은 생략).
 * 그 능력을 가진 진영의 평가에만 쓰인다. tools/tune.ts가 대국 기록으로 학습한다.
 */
export const ABILITY_WEIGHTS: Readonly<Record<string, Readonly<Record<string, number>>>> = {};
