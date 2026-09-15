import { royalSquares, trappingSquares } from '@hyperchess/engine';
import { abilityUi } from '../abilityUi/specs';
import { revertChanges } from '../game/replay';
import type { AbilityEffect } from './types';

const MOVE_MS = 320;

const pieceIdAt = (ctx: Parameters<AbilityEffect>[0], square: number) => ctx.before.board[square]?.id ?? null;

const telekinesis: AbilityEffect = async (ctx) => {
  const { stage, event, after } = ctx;
  const { color } = abilityUi(event.abilityId);
  const from = Number(event.params.from);
  const to = Number(event.params.to);
  const id = pieceIdAt(ctx, from);

  stage.overlay({ kind: 'ring', square: from, color, duration: 900 });
  if (id) stage.pieceFx(id, 'levitate');
  await stage.wait(450);
  stage.showBoard(after.board);
  await stage.wait(MOVE_MS + 120);
  if (id) stage.pieceFx(id, 'land');
  stage.overlay({ kind: 'ring', square: to, color, duration: 700 });
  await stage.wait(320);
};

const haste: AbilityEffect = async ({ stage, event }) => {
  const { color } = abilityUi(event.abilityId);
  stage.overlay({ kind: 'speedlines', side: event.color, color, duration: 1000 });
  stage.overlay({ kind: 'flash', color, duration: 600 });
  await stage.wait(900);
};

const teleport: AbilityEffect = async (ctx) => {
  const { stage, event, after } = ctx;
  const { color } = abilityUi(event.abilityId);
  const squares = [Number(event.params.a), Number(event.params.b)];
  const ids = squares.map((sq) => pieceIdAt(ctx, sq)).filter((id): id is string => !!id);

  squares.forEach((square) => stage.overlay({ kind: 'pillar', square, color, duration: 1100 }));
  ids.forEach((id) => stage.pieceFx(id, 'vanish'));
  await stage.wait(420);
  stage.showBoard(after.board);
  await stage.wait(MOVE_MS);
  ids.forEach((id) => stage.pieceFx(id, 'appear'));
  await stage.wait(480);
};

const revive: AbilityEffect = async ({ stage, event, after }) => {
  const { color } = abilityUi(event.abilityId);
  const square = Number(event.params.to);
  const id = String(event.params.pieceId);

  stage.overlay({ kind: 'pillar', square, color, duration: 1300 });
  stage.overlay({ kind: 'burst', square, color, duration: 1100 });
  await stage.wait(420);
  stage.pieceFx(id, 'rise');
  stage.showBoard(after.board);
  await stage.wait(800);
};

/** 색 반전 + 취소된 수를 최신순으로 거꾸로 재생 */
const rewind: AbilityEffect = async ({ stage, event, before, after }) => {
  const { color } = abilityUi(event.abilityId);
  stage.screen('rewind');
  stage.overlay({ kind: 'scanlines', color, duration: 99999 });
  stage.overlay({ kind: 'clock', color, duration: 99999, icon: 'rewind' });
  await stage.wait(450);

  let board = before.board;
  for (const undone of event.undone ?? []) {
    board = revertChanges(board, undone.changes);
    stage.showBoard(board);
    await stage.wait(MOVE_MS + 160);
  }
  stage.showBoard(after.board);
  await stage.wait(350);
  stage.screen(null);
  await stage.wait(350);
};

const enhance: AbilityEffect = async (ctx) => {
  const { stage, event, after } = ctx;
  const { color, icon } = abilityUi(event.abilityId);
  const square = Number(event.params.square);
  const id = pieceIdAt(ctx, square);

  stage.overlay({ kind: 'burst', square, color, duration: 900 });
  stage.overlay({ kind: 'stamp', square, color, icon, duration: 1000 });
  if (id) stage.pieceFx(id, 'empower');
  await stage.wait(500);
  stage.showBoard(after.board);
  await stage.wait(550);
};

const empress: AbilityEffect = async ({ stage, event, after }) => {
  const { color, icon } = abilityUi(event.abilityId);
  stage.overlay({ kind: 'flash', color, duration: 900 });
  for (const square of royalSquares(after, event.color)) {
    stage.overlay({ kind: 'stamp', square, color, icon, duration: 1300 });
    stage.overlay({ kind: 'ring', square, color, duration: 1100 });
  }
  stage.showBoard(after.board);
  await stage.wait(1200);
};

const heir: AbilityEffect = async (ctx) => {
  const { stage, event, before, after } = ctx;
  const { color, icon } = abilityUi(event.abilityId);
  const kingSquare = royalSquares(before, event.color)[0];
  const pawnSquare = Number(event.params.square);
  const kingId = kingSquare === undefined ? null : pieceIdAt(ctx, kingSquare);

  if (kingSquare !== undefined) stage.overlay({ kind: 'beam', square: kingSquare, to: pawnSquare, color, duration: 1100 });
  await stage.wait(450);
  stage.overlay({ kind: 'stamp', square: pawnSquare, color, icon, duration: 1000 });
  stage.overlay({ kind: 'burst', square: pawnSquare, color, duration: 900 });
  if (kingId) stage.pieceFx(kingId, 'dim');
  stage.showBoard(after.board);
  await stage.wait(800);
};

/** 금빛 변성 문양이 돌고, 말이 납작해졌다가 다른 말로 펼쳐진다 */
const alchemy: AbilityEffect = async (ctx) => {
  const { stage, event, after } = ctx;
  const { color } = abilityUi(event.abilityId);
  const square = Number(event.params.square);
  const id = pieceIdAt(ctx, square);

  stage.overlay({ kind: 'sigil', square, color, duration: 1300 });
  if (id) stage.pieceFx(id, 'transmute');
  await stage.wait(330);
  stage.showBoard(after.board);
  await stage.wait(420);
  stage.overlay({ kind: 'burst', square, color, duration: 800 });
  await stage.wait(450);
};

/** 가둔 두 말에서 최면 광선이 뻗고, 대상이 흔들리다 색이 바뀐다 */
const brainwash: AbilityEffect = async (ctx) => {
  const { stage, event, before, after } = ctx;
  const { color } = abilityUi(event.abilityId);
  const square = Number(event.params.square);
  const id = pieceIdAt(ctx, square);

  for (const from of trappingSquares(before.board, square, event.color)) stage.overlay({ kind: 'beam', square: from, to: square, color, duration: 1200 });
  if (id) stage.pieceFx(id, 'hypnotize');
  stage.overlay({ kind: 'ring', square, color, duration: 1400 });
  await stage.wait(1100);
  stage.showBoard(after.board);
  if (id) stage.pieceFx(id, 'empower');
  stage.overlay({ kind: 'burst', square, color, duration: 800 });
  await stage.wait(550);
};

/** 흙먼지와 함께 땅에서 성벽이 솟아오르고 보드가 울린다 */
const wall: AbilityEffect = async ({ stage, event, after }) => {
  const { color } = abilityUi(event.abilityId);
  const square = Number(event.params.square);

  stage.overlay({ kind: 'dust', square, color, duration: 900 });
  await stage.wait(160);
  stage.showWalls(after.walls);
  stage.overlay({ kind: 'shockwave', color, duration: 500 });
  await stage.wait(700);
};

/** 북소리처럼 폰들이 한꺼번에 발을 구르며 전진한다 */
const march: AbilityEffect = async ({ stage, event, after }) => {
  const { color } = abilityUi(event.abilityId);
  const marched = event.changes.flatMap((change) => (change.type === 'move' ? [change] : []));
  const promoted = event.changes.flatMap((change) => (change.type === 'transform' ? [change.square] : []));

  stage.overlay({ kind: 'speedlines', side: event.color, color, duration: 900 });
  marched.forEach(({ pieceId }) => stage.pieceFx(pieceId, 'stomp'));
  await stage.wait(260);
  stage.showBoard(after.board);
  stage.overlay({ kind: 'shockwave', color, duration: 450 });
  marched.forEach(({ to }) => stage.overlay({ kind: 'dust', square: to, color, duration: 600 }));
  await stage.wait(420);
  for (const square of promoted) stage.overlay({ kind: 'burst', square, color, duration: 800 });
  await stage.wait(promoted.length > 0 ? 500 : 150);
};

/** 조준선이 대상에 고정된 뒤 섬광 한 줄기로 꿰뚫는다. 쏜 말은 반동만 받고 자리에 남는다 */
const snipe: AbilityEffect = async (ctx) => {
  const { stage, event, before, after } = ctx;
  const { color } = abilityUi(event.abilityId);
  const from = Number(event.params.from);
  const to = Number(event.params.to);
  const shooterId = pieceIdAt(ctx, from);
  const target = before.board[to];

  stage.overlay({ kind: 'crosshair', square: to, color, duration: 900 });
  await stage.wait(620);
  if (shooterId) stage.pieceFx(shooterId, 'recoil');
  stage.overlay({ kind: 'beam', square: from, to, color, duration: 380 });
  await stage.wait(120);
  stage.showBoard(after.board);
  if (target) stage.overlay({ kind: 'shatter', square: to, piece: target, color, duration: 700 });
  stage.overlay({ kind: 'burst', square: to, color, duration: 650 });
  await stage.wait(560);
};

export const ABILITY_EFFECTS: Readonly<Record<string, AbilityEffect>> = {
  telekinesis,
  haste,
  teleport,
  revive,
  rewind,
  heavyInfantry: enhance,
  lancer: enhance,
  chariot: enhance,
  paladin: enhance,
  empress,
  heir,
  alchemy,
  brainwash,
  wall,
  march,
  snipe,
};
