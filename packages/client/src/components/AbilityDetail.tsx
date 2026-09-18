import { getAbility } from '@hyperchess/engine';
import { RANDOM_ABILITY } from '@hyperchess/protocol';
import type { CSSProperties } from 'react';
import { abilityUi } from '../abilityUi/specs';
import { costLabel, recoveryLabel, TIMING_LABEL } from '../abilityUi/text';

/** 능력 하나의 설명과 수치. 능력 선택기와 능력 설명 페이지가 함께 쓴다 */
export function AbilityDetail({ abilityId }: { abilityId: string }) {
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
