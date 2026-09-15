import { listAbilities } from '@hyperchess/engine';
import type { CSSProperties } from 'react';
import { abilityUi } from '../abilityUi/specs';
import { costLabel, recoveryLabel, TIMING_LABEL } from '../abilityUi/text';
import { RANDOM_ABILITY } from '@hyperchess/protocol';
import { AbilityIconView } from './AbilityIconView';

interface AbilityGridProps {
  readonly selected: string;
  readonly onSelect: (abilityId: string) => void;
  readonly label: string;
}

export function AbilityGrid({ selected, onSelect, label }: AbilityGridProps) {
  return (
    <section className="ability-grid" aria-label={label}>
      <button
        type="button"
        className={`ability-card ability-card-random ${selected === RANDOM_ABILITY ? 'selected' : ''}`}
        style={{ '--ability-color': abilityUi(RANDOM_ABILITY).color } as CSSProperties}
        aria-pressed={selected === RANDOM_ABILITY}
        onClick={() => onSelect(RANDOM_ABILITY)}
      >
        <div className="ability-card-head">
          <span className="ability-icon">
            <AbilityIconView icon="random" size={22} />
          </span>
          <div>
            <strong>무작위</strong>
            <small>게임 시작 시 결정</small>
          </div>
        </div>
        <p>게임을 시작할 때 모든 능력 중 하나가 무작위로 정해지고, 대국 시작 화면에서 공개됩니다.</p>
      </button>
      {listAbilities().map((ability) => {
        const spec = abilityUi(ability.id);
        const isSelected = selected === ability.id;
        return (
          <button
            key={ability.id}
            type="button"
            className={`ability-card ${isSelected ? 'selected' : ''}`}
            style={{ '--ability-color': spec.color } as CSSProperties}
            aria-pressed={isSelected}
            onClick={() => onSelect(ability.id)}
          >
            <div className="ability-card-head">
              <span className="ability-icon">
                <AbilityIconView icon={spec.icon} size={22} />
              </span>
              <div>
                <strong>{ability.name}</strong>
                <small>{TIMING_LABEL[ability.timing]}</small>
              </div>
            </div>
            <p>{ability.description}</p>
            <dl className="ability-stats">
              <div>
                <dt>자원</dt>
                <dd>
                  {ability.balance.startResource}/{ability.balance.maxResource}
                </dd>
              </div>
              <div>
                <dt>비용</dt>
                <dd>{costLabel(ability.id)}</dd>
              </div>
              <div>
                <dt>회복</dt>
                <dd>{recoveryLabel(ability)}</dd>
              </div>
              {ability.balance.cooldownTurns > 0 && (
                <div>
                  <dt>대기</dt>
                  <dd>{ability.balance.cooldownTurns}턴</dd>
                </div>
              )}
            </dl>
          </button>
        );
      })}
    </section>
  );
}

export function randomAbilityId(): string {
  const abilities = listAbilities();
  return abilities[Math.floor(Math.random() * abilities.length)].id;
}
