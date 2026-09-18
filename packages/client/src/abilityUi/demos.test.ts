import { applyAction, listAbilities } from '@hyperchess/engine';
import { describe, expect, it } from 'vitest';
import { buildDemo, demoAbilities } from './demos';

describe('능력 연출 데모', () => {
  it('모든 능력에 데모가 있다', () => {
    expect(demoAbilities().map((a) => a.id)).toEqual(listAbilities().map((a) => a.id));
  });

  it.each(listAbilities().map((ability) => [ability.id] as const))('%s 데모가 끝까지 재생된다', (abilityId) => {
    const demo = buildDemo(abilityId);
    // 컷 설명은 시작 국면 + 행동마다 한 줄
    expect(demo.cuts).toHaveLength(demo.actions.length + 1);
    expect(demo.cuts.every((cut) => cut.length > 0)).toBe(true);

    let state = demo.start;
    for (const action of demo.actions) {
      state = applyAction(state, action, 0);
    }
    // 첫 행동이 능력이고, 연출기가 보는 마지막 기록이 그 능력이어야 한다
    // (시간 역행은 기록을 잘라내므로 길이가 아니라 마지막 항목으로 본다)
    const [first] = demo.actions;
    expect(first.type).toBe('ability');
    expect(applyAction(demo.start, first, 0).log.at(-1)).toMatchObject({ kind: 'ability', abilityId });
  });
});
