import type { PieceType } from '../types';
import type { AbilityBalance } from './types';

/**
 * 능력 밸런싱 수치. 모든 능력은 시작 자원 0 (시작하자마자 쓰지 않음). 수치 조정은 이 파일에서만 한다.
 * 버전별 수치·측정 결과는 .docs/balance.md 에 기록한다
 * (측정: npm run balance -w @hyperchess/ai).
 */
export const BALANCE = {
  telekinesis: {
    maxResource: 3, startResource: 0, cooldownTurns: 0,
    recovery: [{ trigger: 'ownTurns', every: 3, amount: 1 }],
  },
  haste: {
    maxResource: 3, startResource: 0, cooldownTurns: 3,
    recovery: [{ trigger: 'ownTurns', every: 8, amount: 1 }],
  },
  teleport: {
    maxResource: 2, startResource: 0, cooldownTurns: 2,
    recovery: [{ trigger: 'ownTurns', every: 10, amount: 1 }],
  },
  revive: {
    maxResource: 7, startResource: 0, cooldownTurns: 5,
    // 폰을 잃으면 0.5, 그 외 기물을 잃으면 1 회복
    recovery: [{ trigger: 'ownPieceCaptured', amount: 1, pawnAmount: 0.5 }],
  },
  rewind: {
    maxResource: 3, startResource: 0, cooldownTurns: 2,
    recovery: [{ trigger: 'ownTurns', every: 4, amount: 1 }],
  },
  heavyInfantry: {
    maxResource: 1, startResource: 0, cooldownTurns: 0,
    recovery: [{ trigger: 'ownTurns', every: 14, amount: 1 }],
  },
  lancer: {
    maxResource: 2, startResource: 0, cooldownTurns: 0,
    recovery: [{ trigger: 'ownTurns', every: 5, amount: 1 }],
  },
  chariot: {
    maxResource: 2, startResource: 0, cooldownTurns: 0,
    recovery: [{ trigger: 'ownTurns', every: 3, amount: 1 }],
  },
  paladin: {
    maxResource: 2, startResource: 0, cooldownTurns: 0,
    recovery: [{ trigger: 'ownTurns', every: 2, amount: 1 }],
  },
  empress: {
    // v20: v14 상향(최대 1→2, 회복 6→4)을 되돌린다. 그 상향은 AI 가 여제를 못 쓰던 시절의
    // 신호를 보고 한 것이고, AI 를 고치자 리그전 86% 가 나왔다
    maxResource: 1, startResource: 0, cooldownTurns: 0,
    recovery: [{ trigger: 'ownTurns', every: 14, amount: 1 }],
  },
  heir: {
    maxResource: 8, startResource: 0, cooldownTurns: 0,
    recovery: [{ trigger: 'ownTurns', every: 3, amount: 1 }],
  },
  alchemy: {
    maxResource: 3, startResource: 0, cooldownTurns: 0,
    recovery: [{ trigger: 'ownTurns', every: 3, amount: 1 }],
  },
  brainwash: {
    maxResource: 7, startResource: 0, cooldownTurns: 0,
    recovery: [{ trigger: 'ownTurns', every: 3, amount: 1 }],
  },
  wall: {
    maxResource: 3, startResource: 0, cooldownTurns: 2,
    recovery: [{ trigger: 'ownTurns', every: 4, amount: 1 }],
  },
  march: {
    maxResource: 1, startResource: 0, cooldownTurns: 0,
    recovery: [{ trigger: 'ownTurns', every: 7, amount: 1 }],
  },
  snipe: {
    maxResource: 2, startResource: 0, cooldownTurns: 0,
    recovery: [{ trigger: 'ownTurns', every: 12, amount: 1 }],
  },
} as const satisfies Record<string, AbilityBalance>;

export const COSTS = {
  telekinesis: 1,
  haste: 3,
  teleport: 1,
  revive: { p: 4, n: 5, b: 5, r: 6, q: 7, k: 99 } satisfies Record<PieceType, number>,
  rewindPerStep: 1,
  heavyInfantry: 1,
  lancer: 2,
  chariot: 1,
  paladin: 1,
  empress: 1,
  heir: 1,
  alchemy: 1,
  brainwash: { p: 3, n: 4, b: 4, r: 5, q: 7, k: 99 } satisfies Record<PieceType, number>,
  wall: 1,
  march: 1,
  snipe: 1,
} as const;

export const REWIND_MAX_STEPS = 3;

/** 연금술: 이 가치 이하의 말로만 바꿀 수 있다 */
// 연금술은 가치가 같거나 낮은 말로만 바꾼다. 룩을 3으로 두어 나이트·비숍에서 룩으로 가는
// 상향 경로를 연다 (실질 +2). v19 이전에는 5 라 상향이 프로모션 조합 하나뿐이었다
export const ALCHEMY_VALUE = { p: 1, n: 3, b: 3, r: 3, q: 9 } as const;

/** 세뇌: 상대 말의 8방향 인접 칸 중 자신의 말이 이만큼 있어야 한다 */
export const BRAINWASH_NEIGHBORS = 2;

/** 성벽: 설치자의 턴이 이만큼 시작되면 사라진다 */
export const WALL_DURATION = 6;
/** 성벽: 한 플레이어가 동시에 세울 수 있는 최대 개수 */
export const WALL_LIMIT = 3;
