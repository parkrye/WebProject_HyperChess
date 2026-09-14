import { getAbility, type Color, type GameState } from '@hyperchess/engine';
import type { CSSProperties } from 'react';
import { abilityUi } from '../abilityUi/specs';
import { COLOR_NAME } from '../abilityUi/text';
import type { InteractionController } from '../game/useInteraction';
import { AbilityIconView } from './AbilityIconView';
import { PieceSvg } from './PieceSvg';

export interface SeatLabel {
  readonly name: string;
  readonly connected: boolean;
  readonly isMe: boolean;
}

interface PlayerBarProps {
  readonly state: GameState;
  readonly color: Color;
  readonly interaction: InteractionController;
  readonly seat?: SeatLabel;
}

export function PlayerBar({ state, color, interaction, seat }: PlayerBarProps) {
  const player = state.players[color];
  const definition = player.abilityId ? getAbility(player.abilityId) : null;
  const spec = abilityUi(player.abilityId ?? '');
  const active = state.turn === color && state.result.kind === 'ongoing';

  const pickingCaptured = active && interaction.step?.kind === 'captured';
  const pickable = new Set(pickingCaptured ? interaction.stepChoices.map(String) : []);

  return (
    <section className={`player-bar ${active ? 'is-active' : ''}`} style={{ '--ability-color': spec.color } as CSSProperties}>
      <div className="player-id">
        <span className={`player-dot dot-${color}`} />
        <strong>{seat ? seat.name : COLOR_NAME[color]}</strong>
        {seat?.isMe && <span className="seat-tag">나</span>}
        {seat && !seat.connected && <span className="seat-tag seat-offline">연결 끊김</span>}
        {definition && (
          <span className="player-ability">
            <AbilityIconView icon={spec.icon} size={16} />
            {definition.name}
          </span>
        )}
      </div>

      {definition && (
        <div className="resource" aria-label={`자원 ${player.meter.resource}/${definition.balance.maxResource}`}>
          {Array.from({ length: definition.balance.maxResource }, (_, i) => (
            <span key={i} className={`pip ${i < player.meter.resource ? 'filled' : ''}`} />
          ))}
          {player.meter.cooldown > 0 && <span className="cooldown">⏳{player.meter.cooldown}</span>}
        </div>
      )}

      <div className="captured" aria-label="잃은 말">
        {state.captured[color].map((piece) => {
          const canPick = pickable.has(piece.id);
          return (
            <button
              key={piece.id}
              type="button"
              className={`captured-piece ${canPick ? 'pickable' : ''}`}
              disabled={!canPick}
              onClick={() => interaction.pick('pieceId', piece.id)}
            >
              <PieceSvg type={piece.type} color={piece.color} />
            </button>
          );
        })}
      </div>
    </section>
  );
}
