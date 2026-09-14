import { getAbility, type GameState } from '@hyperchess/engine';
import type { CSSProperties } from 'react';
import { abilityUi } from '../abilityUi/specs';
import { abilityBlockReason, costLabel, COLOR_NAME, TIMING_LABEL } from '../abilityUi/text';
import type { InteractionController } from '../game/useInteraction';
import { AbilityIconView } from './AbilityIconView';

interface AbilityPanelProps {
  readonly state: GameState;
  readonly interaction: InteractionController;
  readonly busy: boolean;
}

export function AbilityPanel({ state, interaction, busy }: AbilityPanelProps) {
  const color = state.turn;
  const { abilityId } = state.players[color];
  if (!abilityId || state.result.kind !== 'ongoing') return null;

  const definition = getAbility(abilityId);
  const spec = abilityUi(abilityId);
  const blockReason = abilityBlockReason(state, color, interaction.abilityOptions.length);
  const { step } = interaction;

  return (
    <section className="ability-panel" style={{ '--ability-color': spec.color } as CSSProperties}>
      <header className="ability-head">
        <span className="ability-icon">
          <AbilityIconView icon={spec.icon} size={22} />
        </span>
        <div>
          <div className="ability-name">
            {COLOR_NAME[color]} · {definition.name}
          </div>
          <div className="ability-meta">
            {TIMING_LABEL[definition.timing]} · 비용 {costLabel(abilityId)}
          </div>
        </div>
      </header>

      {interaction.targeting ? (
        <div className="ability-targeting">
          <p className="ability-prompt">{step?.prompt}</p>
          {step?.kind === 'choice' && (
            <div className="choice-row">
              {interaction.stepChoices.map((value) => (
                <button key={String(value)} type="button" className="btn btn-ability" onClick={() => interaction.pick(step.key, value)}>
                  {step.label ? step.label(value) : String(value)}
                </button>
              ))}
            </div>
          )}
          <button type="button" className="btn btn-ghost" onClick={interaction.cancelAbility}>
            취소
          </button>
        </div>
      ) : (
        <div className="ability-actions">
          <p className="ability-desc">{definition.description}</p>
          <button type="button" className="btn btn-ability" disabled={busy || !!blockReason} onClick={interaction.startAbility}>
            {blockReason ?? '능력 사용'}
          </button>
        </div>
      )}
    </section>
  );
}
