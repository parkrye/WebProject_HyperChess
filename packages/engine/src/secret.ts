import { opposite, type Color, type GameEvent, type GameState, type PlayerState } from './types';

const usedAbility = (events: readonly GameEvent[], color: Color): boolean =>
  events.some((event) => event.kind === 'ability' && (event.color === color || usedAbility(event.undone ?? [], color)));

/**
 * color의 능력이 드러났는지. 비밀 능력 모드가 아니거나, 한 번이라도 썼거나(시간 역행으로 취소된 것 포함),
 * 대국이 끝났으면 드러난 것이다.
 */
export function abilityRevealed(state: GameState, color: Color): boolean {
  return !state.mode.secret || state.result.kind !== 'ongoing' || usedAbility(state.log, color);
}

/** 능력과 자원 계측값을 지운다 (자원 한도·회복 방식으로 능력을 짐작할 수 없게) */
const concealPlayer = (player: PlayerState): PlayerState => ({
  ...player,
  abilityId: null,
  meter: { resource: 0, cooldown: 0, turnsTaken: player.meter.turnsTaken },
});

/** viewer 시점: 아직 드러나지 않은 상대 능력을 지운다 (서버가 비밀 능력 모드 상대에게 보낼 때) */
export function concealAbilities(state: GameState, viewer: Color): GameState {
  const enemy = opposite(viewer);
  if (abilityRevealed(state, enemy)) return state;
  const conceal = (target: GameState): GameState => ({ ...target, players: { ...target.players, [enemy]: concealPlayer(target.players[enemy]) } });
  return { ...conceal(state), history: state.history.map(conceal) };
}
