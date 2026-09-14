import type { AbilityParams, Color, GameState } from '../types';

/**
 * beforeMove: 수를 놓기 전에 사용하고, 이후 수를 놓는다 (가속, 시간 역행)
 * insteadOfMove: 수를 놓는 대신 사용하고, 턴이 끝난다
 */
export type AbilityTiming = 'beforeMove' | 'insteadOfMove';

export type RecoveryTrigger = 'ownTurns' | 'ownPieceCaptured' | 'enemyPieceCaptured';

export interface RecoveryRule {
  readonly trigger: RecoveryTrigger;
  readonly amount: number;
  /** ownTurns 전용: N번째 자신의 턴마다 회복 */
  readonly every?: number;
}

export interface AbilityBalance {
  readonly maxResource: number;
  readonly startResource: number;
  /** 사용 후 사용할 수 없는 자신의 턴 수 */
  readonly cooldownTurns: number;
  readonly recovery: readonly RecoveryRule[];
}

export interface AbilityDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly timing: AbilityTiming;
  readonly balance: AbilityBalance;
  /** 잡힌 말을 되살릴 수 있어 기물 부족 무승부 판정에서 제외해야 하는지 */
  readonly canRestoreMaterial?: boolean;
  cost(state: GameState, color: Color, params: AbilityParams): number;
  /** 자원/쿨다운/자기 체크를 고려하지 않은 사용 후보 */
  candidates(state: GameState, color: Color): AbilityParams[];
  /** 효과를 적용한 새 상태. 자원 차감과 턴 진행은 엔진이 처리한다 */
  apply(state: GameState, color: Color, params: AbilityParams): GameState;
}
