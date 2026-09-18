import { getAbility, listAbilities } from '@hyperchess/engine';
import { RANDOM_ABILITY } from '@hyperchess/protocol';
import type { CSSProperties } from 'react';
import { abilityUi } from '../abilityUi/specs';
import { abilityName, costLabel, recoveryLabel, TIMING_LABEL } from '../abilityUi/text';
import { AbilityIconView } from './AbilityIconView';

const CHOICES = [RANDOM_ABILITY, ...listAbilities().map((a) => a.id)];

interface AbilityPickerProps {
  readonly selected: string;
  readonly onSelect: (abilityId: string) => void;
  readonly label: string;
  /** 선택한 능력의 설명을 함께 보여 줄지 (기본 true). 멀티는 능력 설명 페이지가 따로 있어 끈다 */
  readonly showDetail?: boolean;
  readonly disabled?: boolean;
}

/** 선택한 능력의 설명(자리 고정) + 아이콘·이름만 있는 능력 목록 */
export function AbilityPicker({ selected, onSelect, label, showDetail = true, disabled = false }: AbilityPickerProps) {
  return (
    <section className="ability-picker" aria-label={label}>
      {showDetail && <AbilityDetailStack selected={selected} />}
      <div className="ability-grid">
        {CHOICES.map((id) => {
          const spec = abilityUi(id);
          const isSelected = id === selected;
          return (
            <button
              key={id}
              type="button"
              className={`ability-tile ${isSelected ? 'selected' : ''}`}
              style={{ '--ability-color': spec.color } as CSSProperties}
              aria-pressed={isSelected}
              disabled={disabled}
              onClick={() => onSelect(id)}
            >
              <AbilityIconView icon={spec.icon} size={32} />
              <span>{abilityName(id)}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/** 모든 능력의 설명을 같은 칸에 겹쳐 두어, 선택이 바뀌어도 아래 목록이 움직이지 않게 한다 */
function AbilityDetailStack({ selected }: { selected: string }) {
  return (
    <div className="ability-detail-stack">
      {CHOICES.map((id) => (
        <div key={id} className={`ability-detail ${id === selected ? '' : 'is-hidden'}`} aria-hidden={id !== selected}>
          <AbilityDetail abilityId={id} />
        </div>
      ))}
    </div>
  );
}

function AbilityDetail({ abilityId }: { abilityId: string }) {
  const spec = abilityUi(abilityId);
  if (abilityId === RANDOM_ABILITY) {
    return (
      <div className="ability-detail-body" style={{ '--ability-color': spec.color } as CSSProperties}>
        <strong className="ability-detail-name">무작위</strong>
        <p>게임을 시작할 때 모든 능력 중 하나로 정해집니다.</p>
      </div>
    );
  }

  const ability = getAbility(abilityId);
  const { balance } = ability;
  return (
    <div className="ability-detail-body" style={{ '--ability-color': spec.color } as CSSProperties}>
      <strong className="ability-detail-name">
        {ability.name} <small>{TIMING_LABEL[ability.timing]}</small>
      </strong>
      <p>{ability.description}</p>
      <dl className="ability-stats">
        <div>
          <dt>자원</dt>
          <dd>
            {balance.startResource}/{balance.maxResource}
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
        <div>
          <dt>대기</dt>
          <dd>{balance.cooldownTurns > 0 ? `${balance.cooldownTurns}턴` : '없음'}</dd>
        </div>
      </dl>
    </div>
  );
}
