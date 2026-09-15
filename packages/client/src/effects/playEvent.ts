import { royalSquares, type GameState } from '@hyperchess/engine';
import { abilityUi } from '../abilityUi/specs';
import { ABILITY_EFFECTS } from './abilityEffects';
import type { AbilityEvent, EffectContext, Stage } from './types';

const MOVE_MS = 320;
const CAPTURE_COLOR = '#ff8a5c';
const DRAW_COLOR = '#c9c3d9';

async function playMove({ stage, event, before, after }: EffectContext): Promise<void> {
  const hasted = before.turnState.movesAllowed > 1;
  if (hasted && event.kind === 'move') {
    const id = before.board[event.move.from]?.id;
    if (id) stage.pieceFx(id, 'afterimage');
  }

  stage.showBoard(after.board);
  for (const change of event.changes) {
    if (change.type !== 'remove') continue;
    // 잡힌 말은 바로 사라지지 않고 두 조각으로 갈라져 흩어진다
    stage.overlay({ kind: 'shatter', square: change.square, piece: change.piece, color: CAPTURE_COLOR, duration: 700 });
    stage.overlay({ kind: 'burst', square: change.square, color: CAPTURE_COLOR, duration: 650 });
  }
  if (hasted) stage.overlay({ kind: 'speedlines', side: event.color, color: abilityUi('haste').color, duration: 500 });
  // 수명이 다한 성벽은 흙먼지를 남기고 무너진다
  for (const wall of before.walls) {
    if (after.walls.some((w) => w.square === wall.square)) continue;
    stage.overlay({ kind: 'dust', square: wall.square, color: abilityUi('wall').color, duration: 700 });
  }
  if (before.walls.length !== after.walls.length) stage.showWalls(after.walls);
  await stage.wait(MOVE_MS + 40);
}

/** 게임이 끝나는 순간의 연출: 승자 색 섬광과 왕관, 패자 royal 붕괴 */
async function playFinale(stage: Stage, after: GameState): Promise<void> {
  const { result } = after;
  if (result.kind === 'ongoing') return;

  if (result.kind === 'draw') {
    stage.overlay({ kind: 'flash', color: DRAW_COLOR, duration: 900 });
    await stage.wait(700);
    return;
  }

  const winnerAbility = after.players[result.winner].abilityId;
  const color = winnerAbility ? abilityUi(winnerAbility).color : '#ffd76b';
  const loser = result.winner === 'w' ? 'b' : 'w';

  for (const square of royalSquares(after, loser)) {
    const id = after.board[square]?.id;
    if (id) stage.pieceFx(id, 'crumble');
  }
  await stage.wait(350);
  stage.overlay({ kind: 'flash', color, duration: 1100 });
  for (const square of royalSquares(after, result.winner)) {
    stage.overlay({ kind: 'stamp', square, color, icon: 'crown', duration: 1200 });
  }
  await stage.wait(1000);
}

export async function playEvent(ctx: EffectContext): Promise<void> {
  await playEventBody(ctx);
  if (ctx.before.result.kind === 'ongoing' && ctx.after.result.kind !== 'ongoing') {
    await playFinale(ctx.stage, ctx.after);
  }
}

async function playEventBody(ctx: EffectContext): Promise<void> {
  if (ctx.event.kind === 'move') return playMove(ctx);

  const effect = ABILITY_EFFECTS[ctx.event.abilityId];
  if (!effect) {
    ctx.stage.showBoard(ctx.after.board);
    return ctx.stage.wait(MOVE_MS);
  }
  return effect(ctx as EffectContext<AbilityEvent>);
}
