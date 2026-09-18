import { getAbility } from './abilities/registry';
import type { AbilityDefinition, RecoveryTrigger } from './abilities/types';
import { parseFen, START_FEN } from './fen';
import { anyRoyalAttacked, diffBoards, executeMove, findLegalMove, hasLegalMove, isInCheck, isRoyal, royalSquares, usesCheckRule } from './rules';
import {
  opposite,
  type TimeControl,
  type AbilityMeter,
  type AbilityParams,
  type Action,
  type Color,
  type DrawState,
  type DrawVote,
  type GameEvent,
  type GameResult,
  type GameState,
  type Move,
  type Piece,
  type PieceType,
  type PlayerState,
} from './types';

const HISTORY_LIMIT = 8;
const COLORS: readonly Color[] = ['w', 'b'];

/** 기본 시간 제한: 차례당 2분, 게임 전체 60분 */
export const STANDARD_TIME_CONTROL: TimeControl = { turnLimitMs: 2 * 60 * 1000, totalLimitMs: 60 * 60 * 1000 };

export interface GameSetup {
  readonly abilities?: Partial<Record<Color, string | null>>;
  readonly fen?: string;
  /** 시간 제한 (없으면 무제한) */
  readonly timeControl?: TimeControl | null;
  /** 게임 시작 시각 (기본 Date.now()) */
  readonly now?: number;
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
    walls: [],
    players: { w: createPlayer('w'), b: createPlayer('b') },
    captured: { w: [], b: [] },
    turnState: { movesMade: 0, movesAllowed: 1, abilityUsed: false },
    positionKeys: [],
    history: [],
    log: [],
    draw: INITIAL_DRAW,
    result: { kind: 'ongoing' },
    clock: setup.timeControl
      ? {
          control: setup.timeControl,
          remainingMs: { w: setup.timeControl.totalLimitMs, b: setup.timeControl.totalLimitMs },
          turnStartedAt: setup.now ?? Date.now(),
        }
      : null,
  };
  return beginTurn(initial);
}

/* ---------- 시계 ---------- */

export interface ClockView {
  readonly turn: Color;
  /** 현재 차례의 남은 시간 */
  readonly turnRemainingMs: number;
  /** 색별 전체 남은 시간 (현재 차례의 경과 시간 반영) */
  readonly totalRemainingMs: Readonly<Record<Color, number>>;
}

export function clockView(state: GameState, now: number): ClockView | null {
  const { clock } = state;
  if (!clock) return null;
  const running = state.result.kind === 'ongoing';
  // 무승부 제안에 답하는 동안에는 시계가 멈춘 것으로 보여 준다
  const elapsed = !running ? 0 : state.draw.offer ? state.draw.offer.elapsedMs : Math.max(0, now - clock.turnStartedAt);
  const total = { ...clock.remainingMs, [state.turn]: Math.max(0, clock.remainingMs[state.turn] - elapsed) };
  const turnRemainingMs = Math.max(0, Math.min(clock.control.turnLimitMs - elapsed, total[state.turn]));
  return { turn: state.turn, turnRemainingMs, totalRemainingMs: total };
}

/** 현재 차례가 시간 제한(차례 2분 또는 전체 시간)을 넘겼으면 그 플레이어의 패배로 끝낸다 */
export function checkTimeout(state: GameState, now: number): GameState {
  const { clock } = state;
  if (!clock || state.result.kind !== 'ongoing' || state.draw.offer) return state;
  const elapsed = now - clock.turnStartedAt;
  const remaining = clock.remainingMs[state.turn];
  if (elapsed < clock.control.turnLimitMs && elapsed < remaining) return state;
  return {
    ...state,
    result: { kind: 'win', winner: opposite(state.turn), reason: 'timeout' },
    clock: { ...clock, remainingMs: { ...clock.remainingMs, [state.turn]: Math.max(0, remaining - elapsed) }, turnStartedAt: now },
  };
}

/** 행동 전후 상태로 시계를 갱신한다. 차례가 넘어가면 사용 시간을 차감하고 새 차례를 시작한다 */
function settleClock(before: GameState, after: GameState, now: number): GameState {
  const { clock } = before;
  if (!clock) return after.clock === null ? after : { ...after, clock: null };
  const turnEnded = after.turn !== before.turn || after.result.kind !== 'ongoing';
  if (!turnEnded) return { ...after, clock }; // 가속·시간 역행 등 같은 차례가 이어지면 시계도 이어진다
  const mover = before.turn;
  const used = Math.max(0, now - clock.turnStartedAt);
  return {
    ...after,
    clock: { ...clock, remainingMs: { ...clock.remainingMs, [mover]: Math.max(0, clock.remainingMs[mover] - used) }, turnStartedAt: now },
  };
}

/** now: 행동 시각 (시간 제한이 있는 게임에서만 의미가 있다) */
export function applyAction(state: GameState, action: Action, now: number = Date.now()): GameState {
  if (state.result.kind !== 'ongoing') throw new IllegalActionError('Game is over');
  if (state.draw.offer) throw new IllegalActionError('Draw offer is pending');
  const timed = checkTimeout(state, now);
  if (timed !== state) return timed;
  const after = action.type === 'move' ? applyMove(state, action.move) : applyAbility(state, action.params);
  return settleClock(state, after, now);
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

  const captures = outcome.captured ? [{ color: enemy, piece: outcome.captured }] : [];
  const { board, players } = settleCaptures(outcome.board, state.players, captures);
  const captured = outcome.captured ? { ...state.captured, [enemy]: [...state.captured[enemy], outcome.captured] } : state.captured;

  const next: GameState = {
    ...state,
    board,
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
  const meters = {
    w: { ...applied.players.w, meter: state.players.w.meter },
    b: { ...applied.players.b, meter: state.players.b.meter },
    [color]: { ...applied.players[color], meter: spentMeter },
  };
  // 시간 역행으로 되돌아간 경우가 아니면 능력으로 잡힌 말(저격 등)을 수로 잡은 것과 같이 처리한다
  const { board, players } = undone
    ? { board: applied.board, players: meters }
    : settleCaptures(applied.board, meters, newlyCaptured(state, applied));

  const next: GameState = {
    ...applied,
    board,
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

function newlyCaptured(before: GameState, after: GameState): { color: Color; piece: Piece }[] {
  return COLORS.flatMap((color) => {
    const known = new Set(before.captured[color].map((piece) => piece.id));
    return after.captured[color].filter((piece) => !known.has(piece.id)).map((piece) => ({ color, piece }));
  });
}

/** 잡힌 말에 따른 자원 회복 */
function settleCaptures(board: GameState['board'], players: GameState['players'], captures: readonly { color: Color; piece: Piece }[]) {
  let result = { board, players };
  for (const { color, piece } of captures) {
    let nextPlayers = withRecovery(result.players, color, 'ownPieceCaptured', piece.type);
    nextPlayers = withRecovery(nextPlayers, opposite(color), 'enemyPieceCaptured', piece.type);
    result = { board: result.board, players: nextPlayers };
  }
  return result;
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
  const recovered: GameState = { ...counted, walls: expireWalls(counted.walls, color), players: withRecovery(counted.players, color, 'ownTurns') };

  const quiet = trackQuiet(recovered);

  const withKey: GameState = { ...quiet, positionKeys: [...quiet.positionKeys, positionKey(quiet)] };
  const snapshot: GameState = { ...withKey, history: [], result: { kind: 'ongoing' } };
  const withHistory: GameState = { ...withKey, history: [...withKey.history, snapshot].slice(-HISTORY_LIMIT) };

  return { ...withHistory, result: evaluateResult(withHistory) };
}

/** 설치자의 턴이 시작될 때마다 성벽의 남은 턴을 줄이고, 다 된 성벽을 없앤다 */
function expireWalls(walls: GameState['walls'], color: Color): GameState['walls'] {
  if (!walls.some((wall) => wall.owner === color)) return walls;
  return walls
    .map((wall) => (wall.owner === color ? { ...wall, turnsLeft: wall.turnsLeft - 1 } : wall))
    .filter((wall) => wall.turnsLeft > 0);
}

function withRecovery(players: GameState['players'], color: Color, trigger: RecoveryTrigger, capturedType?: PieceType): GameState['players'] {
  const player = players[color];
  if (!player.abilityId) return players;

  const { balance } = getAbility(player.abilityId);
  let resource = player.meter.resource;
  for (const rule of balance.recovery) {
    if (rule.trigger !== trigger) continue;
    if (trigger === 'ownTurns' && (!rule.every || player.meter.turnsTaken % rule.every !== 0)) continue;
    resource += capturedType === 'p' && rule.pawnAmount !== undefined ? rule.pawnAmount : rule.amount;
  }
  resource = Math.min(balance.maxResource, resource);
  if (resource === player.meter.resource) return players;
  return { ...players, [color]: { ...player, meter: { ...player.meter, resource } } };
}

/* ---------- 무승부 제안 ---------- */

/** 양쪽 말 구성이 이만큼(수) 그대로면 무승부 제안을 띄운다 */
export const DRAW_OFFER_QUIET_PLIES = 30;
/** 제안이 부결되면 이만큼(수) 더 지난 뒤에 다시 띄운다 */
export const DRAW_OFFER_RETRY_PLIES = 10;

/** 가치 판정용 기물 가치. 왕족은 세지 않는다 (탐색용 PIECE_VALUE와 별개의 판정 기준) */
export const JUDGE_VALUE: Readonly<Record<PieceType, number>> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
/** 여제 규칙으로 왕족에서 풀린 킹은 전투 기물이므로 값을 매긴다 */
const JUDGE_FREE_KING = 3.5;

const INITIAL_DRAW: DrawState = { quietPlies: 0, materialKey: '', offerAt: DRAW_OFFER_QUIET_PLIES, offer: null };

/** 말 구성 지문: 색·종류·강화·왕족만 본다 (자리를 옮기는 것은 변동이 아니다) */
function materialKey(state: GameState): string {
  const signatures: string[] = [];
  for (const piece of state.board) {
    if (!piece) continue;
    signatures.push(`${piece.color}${piece.type}${piece.enhanced ? '+' : ''}${piece.royal ? '!' : ''}`);
  }
  return signatures.sort().join(',');
}

/** 턴이 시작될 때 말 구성을 견줘 '변동 없이 지난 수'를 센다 */
function trackQuiet(state: GameState): GameState {
  const key = materialKey(state);
  if (key !== state.draw.materialKey) {
    return { ...state, draw: { ...state.draw, quietPlies: 0, materialKey: key, offerAt: DRAW_OFFER_QUIET_PLIES } };
  }
  return { ...state, draw: { ...state.draw, quietPlies: state.draw.quietPlies + 1 } };
}

/** 무승부 제안을 띄울 때가 되었는지 */
export const drawOfferDue = (state: GameState): boolean =>
  state.result.kind === 'ongoing' && !state.draw.offer && state.draw.quietPlies >= state.draw.offerAt;

/** 색별 남은 말 가치 (가치 판정의 근거) */
export function materialScores(state: GameState): Record<Color, number> {
  const scores: Record<Color, number> = { w: 0, b: 0 };
  for (const piece of state.board) {
    if (!piece) continue;
    const { rules } = state.players[piece.color];
    scores[piece.color] += piece.type === 'k' && !isRoyal(piece, rules) ? JUDGE_FREE_KING : JUDGE_VALUE[piece.type];
  }
  return scores;
}

/** 가치 판정: 남은 말 가치가 높은 쪽이 이기고, 같으면 무승부 */
export function materialJudgeResult(state: GameState): GameResult {
  const scores = materialScores(state);
  if (scores.w === scores.b) return { kind: 'draw', reason: 'materialJudge' };
  return { kind: 'win', winner: scores.w > scores.b ? 'w' : 'b', reason: 'materialJudge' };
}

/** 제안을 띄운다. 답을 기다리는 동안에는 수를 둘 수 없고 시계도 멈춘다 */
export function openDrawOffer(state: GameState, now: number = Date.now()): GameState {
  if (!drawOfferDue(state)) throw new IllegalActionError('Draw offer is not due');
  const elapsedMs = state.clock ? Math.max(0, now - state.clock.turnStartedAt) : 0;
  return { ...state, draw: { ...state.draw, offer: { votes: {}, elapsedMs } } };
}

/**
 * 제안에 답한다. 양쪽 답이 같아야(만장일치) 결정된다.
 * 승낙 → 무승부 · 가치 판정 → 남은 말 가치로 승패 · 거절이나 엇갈린 답 → 대국 계속
 */
export function voteDraw(state: GameState, color: Color, vote: DrawVote, now: number = Date.now()): GameState {
  const { offer } = state.draw;
  if (!offer) throw new IllegalActionError('No draw offer');
  if (offer.votes[color]) throw new IllegalActionError('Already voted');

  const votes = { ...offer.votes, [color]: vote };
  if (!votes.w || !votes.b) return { ...state, draw: { ...state.draw, offer: { ...offer, votes } } };
  return closeOffer(state, votes.w === votes.b ? votes.w : 'decline', now);
}

/** 제안을 띄우자마자 양쪽이 승낙한 것으로 끝낸다 (AI 내전) */
export function drawByAgreement(state: GameState, now: number = Date.now()): GameState {
  const opened = openDrawOffer(state, now);
  return voteDraw(voteDraw(opened, 'w', 'accept', now), 'b', 'accept', now);
}

/** 제안을 닫는다. 계속 두게 되면 멈춰 둔 시계를 이어서 돌린다 */
function closeOffer(state: GameState, outcome: DrawVote, now: number): GameState {
  const { offer } = state.draw;
  const clock = state.clock && offer ? { ...state.clock, turnStartedAt: now - offer.elapsedMs } : state.clock;
  const draw: DrawState = { ...state.draw, offer: null, offerAt: state.draw.quietPlies + DRAW_OFFER_RETRY_PLIES };
  const next: GameState = { ...state, clock, draw };

  if (outcome === 'accept') return { ...next, result: { kind: 'draw', reason: 'agreement' } };
  if (outcome === 'judge') return { ...next, result: materialJudgeResult(next) };
  return next;
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
  const walls = state.walls.map((wall) => `${wall.square}${wall.owner}${wall.turnsLeft}`).join(',');
  return [squares.join(','), state.turn, state.enPassant?.target ?? '-', rules, walls].join('|');
}
