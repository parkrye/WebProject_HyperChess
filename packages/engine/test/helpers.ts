import { applyAction, createGame, fromAlgebraic, type AbilityParams, type Color, type GameSetup, type GameState, type PieceType } from '../src';

export const sq = fromAlgebraic;

export function game(fen: string, abilities: GameSetup['abilities'] = {}): GameState {
  return createGame({ fen, abilities });
}

export function move(state: GameState, from: string, to: string, promotion?: PieceType): GameState {
  return applyAction(state, { type: 'move', move: { from: sq(from), to: sq(to), ...(promotion ? { promotion } : {}) } });
}

export function useAbility(state: GameState, params: AbilityParams = {}): GameState {
  return applyAction(state, { type: 'ability', params });
}

export function setResource(state: GameState, color: Color, resource: number): GameState {
  const player = state.players[color];
  return { ...state, players: { ...state.players, [color]: { ...player, meter: { ...player.meter, resource } } } };
}
