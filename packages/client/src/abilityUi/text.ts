import {
  COSTS,
  getAbility,
  type AbilityDefinition,
  type Color,
  type DrawReason,
  type GameResult,
  type GameState,
  type RecoveryRule,
  type WinReason,
} from '@hyperchess/engine';

export const COLOR_NAME: Record<Color, string> = { w: '백', b: '흑' };

export const TIMING_LABEL: Record<AbilityDefinition['timing'], string> = {
  beforeMove: '수 전에 사용',
  insteadOfMove: '수 대신 사용',
};

const COST_LABEL: Record<string, string> = {
  telekinesis: String(COSTS.telekinesis),
  haste: String(COSTS.haste),
  teleport: String(COSTS.teleport),
  revive: `폰 ${COSTS.revive.p} · 나이트/비숍 ${COSTS.revive.n} · 룩 ${COSTS.revive.r} · 퀸 ${COSTS.revive.q}`,
  rewind: `되돌리는 턴당 ${COSTS.rewindPerStep}`,
  heavyInfantry: String(COSTS.heavyInfantry),
  lancer: String(COSTS.lancer),
  chariot: String(COSTS.chariot),
  paladin: String(COSTS.paladin),
  empress: String(COSTS.empress),
  heir: String(COSTS.heir),
};

export const costLabel = (abilityId: string) => COST_LABEL[abilityId] ?? '-';

function recoveryText(rule: RecoveryRule): string {
  switch (rule.trigger) {
    case 'ownTurns':
      return `${rule.every}턴마다 +${rule.amount}`;
    case 'ownPieceCaptured':
      return rule.pawnAmount !== undefined
        ? `내 말을 잃으면 +${rule.amount} (폰 +${rule.pawnAmount})`
        : `내 말을 잃으면 +${rule.amount}`;
    case 'enemyPieceCaptured':
      return `상대 말을 잡으면 +${rule.amount}`;
  }
}

export function recoveryLabel(definition: AbilityDefinition): string {
  return definition.balance.recovery.map(recoveryText).join(', ') || '회복 없음';
}

/** 능력을 쓸 수 없는 이유. 쓸 수 있으면 null */
export function abilityBlockReason(state: GameState, color: Color, usableCount: number): string | null {
  const { abilityId, meter } = state.players[color];
  if (!abilityId) return '능력 없음';
  if (usableCount > 0) return null;
  if (state.result.kind !== 'ongoing') return '게임 종료';
  if (state.turn !== color) return '상대 턴';
  if (state.turnState.abilityUsed) return '이번 턴에 이미 사용함';
  if (state.turnState.movesMade > 0) return '수를 둔 뒤에는 사용할 수 없음';
  if (meter.cooldown > 0) return `재사용 대기 ${meter.cooldown}턴`;

  const definition = getAbility(abilityId);
  const candidates = definition.candidates(state, color);
  if (candidates.length === 0) return '사용 조건을 만족하지 않음';
  const affordable = candidates.some((params) => definition.cost(state, color, params) <= meter.resource);
  return affordable ? '자신을 체크 상태로 만들 수 없음' : '자원 부족';
}

const WIN_REASON: Record<WinReason, string> = {
  checkmate: '체크메이트',
  royalsCaptured: '왕족 전멸',
  resign: '기권',
  timeout: '시간 초과',
};

const DRAW_REASON: Record<DrawReason, string> = {
  stalemate: '스테일메이트',
  fiftyMove: '50수 규칙',
  threefold: '3회 반복',
  insufficientMaterial: '기물 부족',
  noActions: '둘 수 있는 수 없음',
};

export function resultText(result: GameResult): { title: string; detail: string } {
  if (result.kind === 'win') return { title: `${COLOR_NAME[result.winner]} 승리`, detail: WIN_REASON[result.reason] };
  if (result.kind === 'draw') return { title: '무승부', detail: DRAW_REASON[result.reason] };
  return { title: '', detail: '' };
}
