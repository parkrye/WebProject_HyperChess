import { applyAction, getAbility } from '@hyperchess/engine';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { buildDemo, demoAbilities, type AbilityDemo } from '../abilityUi/demos';
import { abilityUi } from '../abilityUi/specs';
import { useBgm } from '../audio/bgm';
import { AbilityDetail } from '../components/AbilityDetail';
import { AbilityIconView } from '../components/AbilityIconView';
import { Board } from '../components/Board';
import { Page } from '../components/Page';
import { useAnimatedGame } from '../game/useAnimatedGame';
import { useInteraction } from '../game/useInteraction';

const ABILITIES = demoAbilities();

/** 첫 국면을 눈에 담을 틈 */
const BEFORE_MS = 700;

export function AbilityGuideScreen({ onBack }: { onBack: () => void }) {
  const [selected, setSelected] = useState(ABILITIES[0].id);
  useBgm('title');

  return (
    <Page title="능력 설명" onBack={onBack}>
      <div className="ability-grid ability-guide-grid">
        {ABILITIES.map((ability) => {
          const spec = abilityUi(ability.id);
          const isSelected = ability.id === selected;
          return (
            <button
              key={ability.id}
              type="button"
              className={`ability-tile ${isSelected ? 'selected' : ''}`}
              style={{ '--ability-color': spec.color } as CSSProperties}
              aria-pressed={isSelected}
              onClick={() => setSelected(ability.id)}
            >
              <AbilityIconView icon={spec.icon} size={32} />
              <span>{ability.name}</span>
            </button>
          );
        })}
      </div>

      <div className="ability-guide-body">
        <AbilityDetail abilityId={selected} />
        <AbilityDemoView abilityId={selected} />
      </div>
    </Page>
  );
}

/** 능력 하나의 연출 예시. 실제 대국과 같은 이벤트를 재생한다 */
function AbilityDemoView({ abilityId }: { abilityId: string }) {
  const [round, setRound] = useState(0);
  // 능력이 바뀌면 처음부터 다시 본다
  useEffect(() => setRound(0), [abilityId]);

  const demo = useMemo(() => {
    try {
      return buildDemo(abilityId);
    } catch (error) {
      console.error('[demo]', error);
      return null;
    }
  }, [abilityId]);

  if (!demo) {
    return (
      <section className="ability-demo">
        <p className="notice notice-error">이 능력의 예시를 만들 수 없어요</p>
      </section>
    );
  }

  return (
    <section className="ability-demo" aria-label={`${getAbility(abilityId).name} 연출 예시`}>
      <DemoStage key={`${abilityId}-${round}`} demo={demo} />
      <p className="ability-demo-caption">{demo.caption}</p>
      <button type="button" className="btn" onClick={() => setRound((r) => r + 1)}>
        다시 보기
      </button>
    </section>
  );
}

/** 데모 하나를 처음부터 끝까지 재생한다. 다시 보려면 key를 바꿔 새로 붙인다 */
function DemoStage({ demo }: { demo: AbilityDemo }) {
  const animated = useAnimatedGame(demo.start);
  const { present } = animated;

  useEffect(() => {
    let cancelled = false;
    const play = async () => {
      await new Promise((resolve) => window.setTimeout(resolve, BEFORE_MS));
      let previous = demo.start;
      for (const action of demo.actions) {
        if (cancelled) return;
        previous = applyAction(previous, action, Date.now());
        await present(previous);
      }
    };
    void play();
    return () => {
      cancelled = true;
    };
  }, [demo, present]);

  // 보는 화면이라 보드는 조작하지 않는다
  const interaction = useInteraction(animated.state, () => {}, true, false);
  return (
    <div className={`demo-board ${animated.stageView.screenFx ? `screen-${animated.stageView.screenFx}` : ''}`}>
      <Board state={animated.state} stage={animated.stageView} interaction={interaction} leftColor="w" busy />
    </div>
  );
}
