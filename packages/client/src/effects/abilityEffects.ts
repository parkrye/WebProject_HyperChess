import { royalSquares } from '@hyperchess/engine';
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
};
