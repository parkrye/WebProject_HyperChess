import { getAbility, THRONE_HOLD_TURNS, type Color, type GameState } from '@hyperchess/engine';
import type { CSSProperties } from 'react';
import { abilityUi } from '../abilityUi/specs';
import { COLOR_NAME, SECRET_ABILITY_NAME } from '../abilityUi/text';
import type { InteractionController } from '../game/useInteraction';
import { uiSprite } from '../assets/sprites';
import { AbilityIconView } from './AbilityIconView';
import { PieceSprite } from './PieceSprite';

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
  readonly className?: string;
  /** 무작위로 결정된 능력 */
  readonly randomized?: boolean;
  /** 비밀 능력: 아직 드러나지 않아 능력과 자원을 가린다 */
  readonly abilityHidden?: boolean;
}

export function PlayerBar({ state, color, interaction, seat, className = '', randomized = false, abilityHidden = false }: PlayerBarProps) {
  const player = state.players[color];
  const definition = player.abilityId && !abilityHidden ? getAbility(player.abilityId) : null;
  const spec = abilityUi(definition?.id ?? '');
  const throne = state.mode.throne ? state.throne[color] : 0;
  const active = state.turn === color && state.result.kind === 'ongoing';

  const pickingCaptured = active && interaction.step?.kind === 'captured';
  const pickable = new Set(pickingCaptured ? interaction.stepChoices.map(String) : []);

  return (
    <section className={`player-bar ${className} ${active ? 'is-active' : ''}`} style={{ '--ability-color': spec.color } as CSSProperties}>
      <div className="player-id">
        <span className={`player-dot dot-${color}`} />
        {/* 띠가 좁으면 이름이 …로 잘리므로 전체 이름은 덧말로 남긴다 */}
        <strong title={seat ? seat.name : COLOR_NAME[color]}>{seat ? seat.name : COLOR_NAME[color]}</strong>
        {seat?.isMe && <span className="seat-tag">나</span>}
        {seat && <span className={`seat-tag seat-offline ${seat.connected ? 'is-hidden' : ''}`}>연결 끊김</span>}
        {abilityHidden && (
          <span className="player-ability">
            <AbilityIconView icon="random" size={16} />
            {SECRET_ABILITY_NAME}
          </span>
        )}
        {throne > 0 && (
          <span className="seat-tag throne-tag" title="왕좌에 머문 채 맞은 자기 턴">
            왕좌 {throne}/{THRONE_HOLD_TURNS}
          </span>
        )}
        {definition && (
          <span className="player-ability">
            {randomized && <AbilityIconView icon="random" size={16} className="random-mark" />}
            <AbilityIconView icon={spec.icon} size={16} />
            {definition.name}
          </span>
        )}
      </div>

      {definition && (
        <div className="resource" aria-label={`자원 ${player.meter.resource}/${definition.balance.maxResource}`}>
          {Array.from({ length: definition.balance.maxResource }, (_, i) => {
            const amount = Math.max(0, Math.min(1, player.meter.resource - i));
            const state = amount >= 1 ? 'filled' : amount > 0 ? 'half' : '';
            return <img key={i} className={`pip ${state}`} src={amount > 0 ? uiSprite.gemFull : uiSprite.gemEmpty} alt="" draggable={false} />;
          })}
          {/* 재사용 대기가 없어도 자리를 유지한다 */}
          <span className={`cooldown ${player.meter.cooldown > 0 ? '' : 'is-hidden'}`}>
            <img className="cooldown-icon" src={uiSprite.hourglass} alt="재사용 대기" draggable={false} />
            {player.meter.cooldown || 0}
          </span>
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
              <PieceSprite type={piece.type} color={piece.color} />
            </button>
          );
        })}
      </div>
    </section>
  );
}
