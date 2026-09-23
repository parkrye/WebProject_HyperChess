import {
  COSTS,
  getAbility,
  THRONE_HOLD_TURNS,
  type AbilityDefinition,
  type Color,
  type DrawReason,
  type Deployment,
  type DrawVote,
  type GameMode,
  type GameResult,
  type GameState,
  type RecoveryRule,
  type WinReason,
} from '@hyperchess/engine';
import type { Difficulty } from '@hyperchess/ai';
import { RANDOM_ABILITY } from '@hyperchess/protocol';

export const COLOR_NAME: Record<Color, string> = { w: '백', b: '흑' };

export const DEPLOYMENT_LABEL: Readonly<Record<Deployment, string>> = { standard: '표준', draft: '징병', chaos: '혼돈' };

export const DEPLOYMENT_DESCRIPTION: Readonly<Record<Deployment, string>> = {
  standard: '평소의 체스 배치로 시작한다.',
  draft: '예산으로 말을 사서 직접 배치한다. 첫 줄엔 아무 말이나, 둘째·셋째 줄엔 폰만. 킹은 기본으로 있다.',
  chaos: '킹을 뺀 모든 말이 무작위로 정해진다.',
};

export const FOG_DESCRIPTION = '내 말과 내 말이 갈 수 있는 칸만 보인다. 체크를 건 말은 드러나고, 체크를 못 피하면 진다.';
export const SECRET_DESCRIPTION = '상대 능력은 처음 쓸 때까지 가려진다.';
export const THRONE_DESCRIPTION = `왕족이 중앙 4칸에 머문 채 자기 턴을 ${THRONE_HOLD_TURNS}번 맞으면 이긴다.`;
/** 비밀 능력 모드에서 가려진 능력 표시 */
export const SECRET_ABILITY_NAME = '비밀';

/** 모드 이름. 표준이면 null (따로 표시하지 않는다) */
export function modeLabel(mode: GameMode): string | null {
  const parts = [
    mode.deployment === 'standard' ? null : `${DEPLOYMENT_LABEL[mode.deployment]}전`,
    mode.fog ? '안개전' : null,
    mode.secret ? '비밀 능력' : null,
    mode.throne ? '왕좌 점령' : null,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}

export const DIFFICULTY_LABEL: Readonly<Record<Difficulty, string>> = { easy: '쉬움', normal: '보통', hard: '어려움' };

/** 능력 이름 (무작위 선택 포함) */
export const abilityName = (id: string) => (id === RANDOM_ABILITY ? '무작위' : getAbility(id).name);

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
  alchemy: String(COSTS.alchemy),
  brainwash: `폰 ${COSTS.brainwash.p} · 나이트/비숍 ${COSTS.brainwash.n} · 룩 ${COSTS.brainwash.r} · 퀸 ${COSTS.brainwash.q}`,
  wall: String(COSTS.wall),
  march: String(COSTS.march),
  snipe: String(COSTS.snipe),
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
  materialJudge: '가치 판정',
  throne: '왕좌 점령',
};

const DRAW_REASON: Record<DrawReason, string> = {
  stalemate: '스테일메이트',
  fiftyMove: '50수 규칙',
  threefold: '3회 반복',
  insufficientMaterial: '기물 부족',
  noActions: '둘 수 있는 수 없음',
  agreement: '무승부 합의',
  materialJudge: '가치 판정 · 남은 말 가치가 같음',
};

/** 무승부 제안에 대한 답: 이름과 고르면 어떻게 되는지 */
export const DRAW_VOTE_TEXT: Readonly<Record<DrawVote, { label: string; hint: string }>> = {
  accept: { label: '승낙', hint: '양쪽이 승낙하면 무승부' },
  judge: { label: '가치 판정', hint: '양쪽이 고르면 남은 말 가치로 승패' },
  decline: { label: '거절', hint: '대국을 계속 둔다' },
};

/** 가치 판정 점수 표기 (3.5처럼 반값이 나올 수 있다) */
export const judgeScoreText = (score: number) => (Number.isInteger(score) ? String(score) : score.toFixed(1));

export function resultText(result: GameResult): { title: string; detail: string } {
  if (result.kind === 'win') return { title: `${COLOR_NAME[result.winner]} 승리`, detail: WIN_REASON[result.reason] };
  if (result.kind === 'draw') return { title: '무승부', detail: DRAW_REASON[result.reason] };
  return { title: '', detail: '' };
}
