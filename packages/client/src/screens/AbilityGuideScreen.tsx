import { applyAction, getAbility } from '@hyperchess/engine';
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
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

/** 첫 컷을 눈에 담을 틈 */
const BEFORE_MS = 800;
/** 컷과 컷 사이 */
const BETWEEN_MS = 500;

const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

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
      {/* 능력이 바뀌면 처음부터 새로 재생한다 */}
      <DemoStage key={abilityId} demo={demo} />
    </section>
  );
}

/**
 * 데모를 컷 단위로 보여 준다. 처음에는 저절로 재생되고, 멈춘 뒤에는 컷을 하나씩 넘길 수 있다.
 * 앞으로 갈 때는 연출을 재생하고, 뒤로 갈 때는 연출 없이 그 국면만 보여 준다.
 */
function DemoStage({ demo }: { demo: AbilityDemo }) {
  const speedRef = useRef(1);
  const animated = useAnimatedGame(demo.start, speedRef);
  const { present, busy } = animated;
  const [cut, setCut] = useState(0);
  const cutRef = useRef(0);
  const [playing, setPlaying] = useState(true);

  /** 컷마다의 국면 (0은 시작 국면) */
  const frames = useMemo(() => {
    const list = [demo.start];
    for (const action of demo.actions) list.push(applyAction(list[list.length - 1], action, Date.now()));
    return list;
  }, [demo]);
  const last = frames.length - 1;

  const show = useCallback(
    async (index: number, animate: boolean) => {
      speedRef.current = animate ? 1 : 0;
      cutRef.current = index;
      setCut(index);
      await present(frames[index]);
      speedRef.current = 1;
    },
    [frames, present],
  );

  useEffect(() => {
    if (!playing) return;
    let cancelled = false;
    const run = async () => {
      await wait(cutRef.current === 0 ? BEFORE_MS : BETWEEN_MS);
      while (!cancelled && cutRef.current < last) {
        await show(cutRef.current + 1, true);
        if (cutRef.current < last) await wait(BETWEEN_MS);
      }
      if (!cancelled) setPlaying(false);
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [playing, last, show]);

  const step = (delta: number) => {
    setPlaying(false);
    void show(Math.min(last, Math.max(0, cutRef.current + delta)), delta > 0);
  };

  const toggle = () => {
    if (playing) {
      setPlaying(false);
      return;
    }
    // 끝까지 본 뒤 다시 누르면 처음부터
    if (cutRef.current === last) void show(0, false);
    setPlaying(true);
  };

  // 보는 화면이라 보드는 조작하지 않는다
  const interaction = useInteraction(animated.state, () => {}, true, false);

  return (
    <>
      <div className={`demo-board ${animated.stageView.screenFx ? `screen-${animated.stageView.screenFx}` : ''}`}>
        <Board state={animated.state} stage={animated.stageView} interaction={interaction} leftColor="w" busy />
      </div>

      <p className="ability-demo-caption" aria-live="polite">
        {demo.cuts[cut]}
      </p>

      <div className="demo-controls">
        <button type="button" className="btn btn-ghost" disabled={busy || cut === 0} onClick={() => step(-1)} aria-label="이전 컷">
          ◀
        </button>
        <button type="button" className="btn btn-primary demo-play" onClick={toggle}>
          {playing ? '⏸ 멈춤' : cut === last ? '↻ 처음부터' : '▶ 재생'}
        </button>
        <button type="button" className="btn btn-ghost" disabled={busy || cut === last} onClick={() => step(1)} aria-label="다음 컷">
          ▶
        </button>
        <span className="demo-progress">
          {cut + 1} / {frames.length}
        </span>
      </div>
    </>
  );
}
