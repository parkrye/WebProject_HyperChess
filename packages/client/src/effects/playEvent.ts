import { abilityUi } from '../abilityUi/specs';
import { ABILITY_EFFECTS } from './abilityEffects';
import type { AbilityEvent, EffectContext } from './types';

const MOVE_MS = 320;
const CAPTURE_COLOR = '#ff8a5c';

async function playMove({ stage, event, before, after }: EffectContext): Promise<void> {
  const hasted = before.turnState.movesAllowed > 1;
  if (hasted && event.kind === 'move') {
    const id = before.board[event.move.from]?.id;
    if (id) stage.pieceFx(id, 'afterimage');
  }

  stage.showBoard(after.board);
  for (const change of event.changes) {
    if (change.type === 'remove') stage.overlay({ kind: 'burst', square: change.square, color: CAPTURE_COLOR, duration: 650 });
  }
  if (hasted) stage.overlay({ kind: 'speedlines', color: abilityUi('haste').color, duration: 500 });
  await stage.wait(MOVE_MS + 40);
}

export async function playEvent(ctx: EffectContext): Promise<void> {
  if (ctx.event.kind === 'move') return playMove(ctx);

  const effect = ABILITY_EFFECTS[ctx.event.abilityId];
  if (!effect) {
    ctx.stage.showBoard(ctx.after.board);
    return ctx.stage.wait(MOVE_MS);
  }
  return effect(ctx as EffectContext<AbilityEvent>);
}
