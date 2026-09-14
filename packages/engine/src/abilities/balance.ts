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
    recovery: [{ trigger: 'ownTurns', every: 4, amount: 1 }],
  },
  haste: {
    maxResource: 3, startResource: 0, cooldownTurns: 3,
    recovery: [{ trigger: 'ownTurns', every: 8, amount: 1 }],
  },
  teleport: {
    maxResource: 2, startResource: 0, cooldownTurns: 2,
    recovery: [{ trigger: 'ownTurns', every: 7, amount: 1 }],
  },
  revive: {
    maxResource: 4, startResource: 0, cooldownTurns: 3,
    recovery: [{ trigger: 'ownPieceCaptured', amount: 1 }],
  },
  rewind: {
    maxResource: 3, startResource: 0, cooldownTurns: 2,
    recovery: [{ trigger: 'ownTurns', every: 4, amount: 1 }],
  },
  heavyInfantry: {
    maxResource: 2, startResource: 0, cooldownTurns: 0,
    recovery: [{ trigger: 'ownTurns', every: 6, amount: 1 }],
  },
  lancer: {
    maxResource: 2, startResource: 0, cooldownTurns: 0,
    recovery: [{ trigger: 'ownTurns', every: 5, amount: 1 }],
  },
  chariot: {
    maxResource: 2, startResource: 0, cooldownTurns: 0,
    recovery: [{ trigger: 'ownTurns', every: 4, amount: 1 }],
  },
  paladin: {
    maxResource: 2, startResource: 0, cooldownTurns: 0,
    recovery: [{ trigger: 'ownTurns', every: 5, amount: 1 }],
  },
  empress: {
    maxResource: 1, startResource: 0, cooldownTurns: 0,
    recovery: [{ trigger: 'ownTurns', every: 6, amount: 1 }],
  },
  heir: {
    maxResource: 1, startResource: 0, cooldownTurns: 0,
    recovery: [{ trigger: 'ownTurns', every: 6, amount: 1 }],
  },
} as const satisfies Record<string, AbilityBalance>;

export const COSTS = {
  telekinesis: 1,
  haste: 3,
  teleport: 1,
  revive: { p: 2, n: 3, b: 3, r: 4, q: 4, k: 99 } satisfies Record<PieceType, number>,
  rewindPerStep: 1,
  heavyInfantry: 1,
  lancer: 2,
  chariot: 1,
  paladin: 2,
  empress: 1,
  heir: 1,
} as const;

export const REWIND_MAX_STEPS = 3;
