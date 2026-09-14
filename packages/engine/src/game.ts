import { getAbility } from './abilities/registry';
import type { AbilityDefinition, RecoveryTrigger } from './abilities/types';
import { parseFen, START_FEN } from './fen';
import { anyRoyalAttacked, diffBoards, executeMove, findLegalMove, hasLegalMove, isInCheck, royalSquares, usesCheckRule } from './rules';
import {
  opposite,
  type AbilityMeter,
  type AbilityParams,
  type Action,
  type Color,
  type GameEvent,
  type GameResult,
  type GameState,
  type Move,
  type PlayerState,
} from './types';

const HISTORY_LIMIT = 8;
const COLORS: readonly Color[] = ['w', 'b'];

export interface GameSetup {
  readonly abilities?: Partial<Record<Color, string | null>>;
  readonly fen?: string;
  /** 시작 자원 덮어쓰기 (테스트·실험용, 기본은 밸런스의 startResource) */
  readonly resources?: Partial<Record<Color, number>>;
}

export class IllegalActionError extends Error {}

export function createGame(setup: GameSetup = {}): GameState {
  const parsed = parseFen(setup.fen ?? START_FEN);
  const createPlayer = (color: Color): PlayerState => {
    const abilityId = setup.abilities?.[color] ?? null;
    const balance = abilityId ? getAbility(abilityId).balance : null;
    return {
      abilityId,
      meter: { resource: setup.resources?.[color] ?? balance?.startResource ?? 0, cooldown: 0, turnsTaken: 0 },
      rules: { queensRoyal: false, noQueenPromotion: false },
    };
  };

  const initial: GameState = {
    ...parsed,
    players: { w: createPlayer('w'), b: createPlayer('b') },
    captured: { w: [], b: [] },
    turnState: { movesMade: 0, movesAllowed: 1, abilityUsed: false },
    positionKeys: [],
    history: [],
    log: [],
    result: { kind: 'ongoing' },
  };
  return beginTurn(initial);
}

export function applyAction(state: GameState, action: Action): GameState {
  if (state.result.kind !== 'ongoing') throw new IllegalActionError('Game is over');
  return action.type === 'move' ? applyMove(state, action.move) : applyAbility(state, action.params);
}

export function resign(state: GameState, color: Color): GameState {
  if (state.result.kind !== 'ongoing') throw new IllegalActionError('Game is over');
  return { ...state, result: { kind: 'win', winner: opposite(color), reason: 'resign' } };
}

/* ---------- 이동 ---------- */

function applyMove(state: GameState, move: Move): GameState {
  const generated = findLegalMove(state, move);
  if (!generated) throw new IllegalActionError('Illegal move');

  const color = state.turn;
  const enemy = opposite(color);
  const outcome = executeMove(state.board, generated);
  const event: GameEvent = { kind: 'move', color, move, changes: diffBoards(state.board, outcome.board) };

  let players = state.players;
  let captured = state.captured;
  if (outcome.captured) {
    captured = { ...captured, [enemy]: [...captured[enemy], outcome.captured] };
    players = withRecovery(players, enemy, 'ownPieceCaptured');
    players = withRecovery(players, color, 'enemyPieceCaptured');
  }

  const next: GameState = {
    ...state,
    board: outcome.board,
    enPassant: outcome.enPassant,
    halfmoveClock: outcome.irreversible ? 0 : state.halfmoveClock + 1,
    positionKeys: outcome.irreversible ? [] : state.positionKeys,
    players,
    captured,
    turnState: { ...state.turnState, movesMade: state.turnState.movesMade + 1 },
    log: [...state.log, event],
  };

  const royalResult = royalExtinctionResult(next);
  if (royalResult) return { ...next, result: royalResult };

  const hasExtraMove =
    next.turnState.movesMade < next.turnState.movesAllowed &&
    !anyRoyalAttacked(next, enemy) &&
    hasLegalMove(next, color);
  return hasExtraMove ? next : endTurn(next);
}

/* ---------- 능력 ---------- */

export function legalAbilityOptions(state: GameState, color: Color = state.turn): AbilityParams[] {
  const player = state.players[color];
  if (!player.abilityId || state.turn !== color || state.result.kind !== 'ongoing') return [];
  if (state.turnState.abilityUsed || state.turnState.movesMade > 0 || player.meter.cooldown > 0) return [];

  const definition = getAbility(player.abilityId);
  return definition.candidates(state, color).filter((params) => isUsable(state, color, definition, params));
}

function isUsable(state: GameState, color: Color, definition: AbilityDefinition, params: AbilityParams): boolean {
  if (definition.cost(state, color, params) > state.players[color].meter.resource) return false;
  if (definition.timing === 'beforeMove') return true;
  return !isInCheck(definition.apply(state, color, params), color);
}

const paramsKey = (params: AbilityParams) =>
  JSON.stringify(Object.keys(params).sort().map((key) => [key, String(params[key])]));

function applyAbility(state: GameState, params: AbilityParams): GameState {
  const color = state.turn;
  const player = state.players[color];
  if (!player.abilityId) throw new IllegalActionError('Player has no ability');

  const key = paramsKey(params);
  if (!legalAbilityOptions(state).some((option) => paramsKey(option) === key)) {
    throw new IllegalActionError('Ability cannot be used');
  }

  const definition = getAbility(player.abilityId);
  const cost = definition.cost(state, color, params);
  const applied = definition.apply(state, color, params);
  const undone = applied.log.length < state.log.length ? state.log.slice(applied.log.length).reverse() : undefined;

  const event: GameEvent = {
    kind: 'ability',
    color,
    abilityId: definition.id,
    params,
    changes: diffBoards(state.board, applied.board),
    ...(undone ? { undone } : {}),
  };

  // 능력 자원은 능력 효과(시간 역행 포함)와 무관하게 현재 값을 기준으로 차감한다
  const spentMeter: AbilityMeter = {
    ...player.meter,
    resource: player.meter.resource - cost,
    cooldown: definition.balance.cooldownTurns,
  };
  const players = {
    w: { ...applied.players.w, meter: state.players.w.meter },
    b: { ...applied.players.b, meter: state.players.b.meter },
    [color]: { ...applied.players[color], meter: spentMeter },
  };

  const next: GameState = {
    ...applied,
    players,
    turnState: { ...applied.turnState, abilityUsed: true },
    log: [...applied.log, event],
  };

  const royalResult = royalExtinctionResult(next);
  if (royalResult) return { ...next, result: royalResult };

  if (definition.timing === 'insteadOfMove') {
    return endTurn({ ...next, enPassant: null, halfmoveClock: 0, positionKeys: [] });
  }
  if (!hasLegalMove(next, color)) return { ...next, result: noActionResult(next, color) };
  return next;
}

/* ---------- 턴 진행 ---------- */

function endTurn(state: GameState): GameState {
  const mover = state.turn;
  const moverState = state.players[mover];
  const cooldown = state.turnState.abilityUsed ? moverState.meter.cooldown : Math.max(0, moverState.meter.cooldown - 1);

  return beginTurn({
    ...state,
    turn: opposite(mover),
    fullmove: mover === 'b' ? state.fullmove + 1 : state.fullmove,
    players: { ...state.players, [mover]: { ...moverState, meter: { ...moverState.meter, cooldown } } },
    turnState: { movesMade: 0, movesAllowed: 1, abilityUsed: false },
  });
}

function beginTurn(state: GameState): GameState {
  const color = state.turn;
  const player = state.players[color];
  const counted: GameState = {
    ...state,
    players: { ...state.players, [color]: { ...player, meter: { ...player.meter, turnsTaken: player.meter.turnsTaken + 1 } } },
  };
  const recovered: GameState = { ...counted, players: withRecovery(counted.players, color, 'ownTurns') };

  const withKey: GameState = { ...recovered, positionKeys: [...recovered.positionKeys, positionKey(recovered)] };
  const snapshot: GameState = { ...withKey, history: [], result: { kind: 'ongoing' } };
  const withHistory: GameState = { ...withKey, history: [...withKey.history, snapshot].slice(-HISTORY_LIMIT) };

  return { ...withHistory, result: evaluateResult(withHistory) };
}

function withRecovery(players: GameState['players'], color: Color, trigger: RecoveryTrigger): GameState['players'] {
  const player = players[color];
  if (!player.abilityId) return players;

  const { balance } = getAbility(player.abilityId);
  let resource = player.meter.resource;
  for (const rule of balance.recovery) {
    if (rule.trigger !== trigger) continue;
    if (trigger === 'ownTurns' && (!rule.every || player.meter.turnsTaken % rule.every !== 0)) continue;
    resource += rule.amount;
  }
  resource = Math.min(balance.maxResource, resource);
  if (resource === player.meter.resource) return players;
  return { ...players, [color]: { ...player, meter: { ...player.meter, resource } } };
}

/* ---------- 결과 판정 ---------- */

function royalExtinctionResult(state: GameState): GameResult | null {
  for (const color of COLORS) {
    if (royalSquares(state, color).length === 0) {
      return { kind: 'win', winner: opposite(color), reason: 'royalsCaptured' };
    }
  }
  return null;
}

function noActionResult(state: GameState, color: Color): GameResult {
  if (isInCheck(state, color)) return { kind: 'win', winner: opposite(color), reason: 'checkmate' };
  return { kind: 'draw', reason: usesCheckRule(state, color) ? 'stalemate' : 'noActions' };
}

function evaluateResult(state: GameState): GameResult {
  const royalResult = royalExtinctionResult(state);
  if (royalResult) return royalResult;

  const color = state.turn;
  const hasActions = hasLegalMove(state, color) || legalAbilityOptions(state, color).length > 0;
  if (!hasActions) return noActionResult(state, color);

  if (state.halfmoveClock >= 100) return { kind: 'draw', reason: 'fiftyMove' };

  const currentKey = state.positionKeys[state.positionKeys.length - 1];
  if (state.positionKeys.filter((key) => key === currentKey).length >= 3) return { kind: 'draw', reason: 'threefold' };

  if (isBareKings(state)) return { kind: 'draw', reason: 'insufficientMaterial' };
  return { kind: 'ongoing' };
}

function isBareKings(state: GameState): boolean {
  const onlyKings = state.board.every((piece) => !piece || (piece.type === 'k' && !piece.enhanced));
  if (!onlyKings) return false;
  return COLORS.every((color) => {
    const abilityId = state.players[color].abilityId;
    return !abilityId || !getAbility(abilityId).canRestoreMaterial || state.captured[color].length === 0;
  });
}

function positionKey(state: GameState): string {
  const squares = state.board.map((piece) => {
    if (!piece) return '.';
    const letter = piece.color === 'w' ? piece.type.toUpperCase() : piece.type;
    const castleFlag = (piece.type === 'k' || piece.type === 'r') && !piece.moved ? '*' : '';
    const flags = `${piece.enhanced ? '+' : ''}${piece.royal ? '!' : ''}${piece.title ?? ''}`;
    return letter + castleFlag + flags;
  });
  const rules = COLORS.map((color) => (state.players[color].rules.queensRoyal ? 'E' : '-')).join('');
  return [squares.join(','), state.turn, state.enPassant?.target ?? '-', rules].join('|');
}
