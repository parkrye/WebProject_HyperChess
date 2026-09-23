import type { Color, GameState } from '@hyperchess/engine';
import { replayStates, replayTimes } from '@hyperchess/protocol';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { COLOR_NAME, modeLabel, resultText } from '../abilityUi/text';
import { GameView, type ReplaySight } from '../components/GameView';
import { Page } from '../components/Page';
import { useAnimatedGame } from '../game/useAnimatedGame';
import { deleteReplay, listReplays, type SavedReplay } from '../replay/storage';

/** 자동 재생에서 연출이 끝난 뒤 다음 걸음까지 쉬는 시간 */
const PLAY_DELAY_MS = 650;

const SOURCE_LABEL: Readonly<Record<SavedReplay['source'], string>> = { local: '로컬 2인', ai: 'AI 대전', online: '멀티' };

const formatDate = (at: number) =>
  new Date(at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

/* ---------- 목록 ---------- */

interface ReplayListScreenProps {
  readonly onOpen: (replay: SavedReplay) => void;
  readonly onBack: () => void;
}

/** 이 기기에 저장한 리플레이 목록 */
export function ReplayListScreen({ onOpen, onBack }: ReplayListScreenProps) {
  const [replays, setReplays] = useState(listReplays);

  const remove = (replay: SavedReplay) => {
    if (!window.confirm('이 리플레이를 지울까요?')) return;
    deleteReplay(replay.id);
    setReplays(listReplays());
  };

  return (
    <Page title="리플레이" onBack={onBack}>
      {replays.length === 0 && <p className="notice">저장한 리플레이가 없습니다. 대국이 끝난 뒤 결과 창에서 저장할 수 있습니다.</p>}
      <ul className="replay-list">
        {replays.map((replay) => {
          const mode = modeLabel(replay.data.setup.mode);
          return (
            <li key={replay.id} className="replay-item">
              <button type="button" className="replay-open" onClick={() => onOpen(replay)}>
                <span className="replay-meta">
                  {formatDate(replay.savedAt)} · {SOURCE_LABEL[replay.source]}
                  {mode && <span className="mode-chip">{mode}</span>}
                </span>
                <strong className="replay-names">
                  {replay.names.w} vs {replay.names.b}
                </strong>
                <span className="replay-result">{resultText(replay.result).title}</span>
              </button>
              <button type="button" className="btn btn-ghost btn-small" onClick={() => remove(replay)}>
                삭제
              </button>
            </li>
          );
        })}
      </ul>
    </Page>
  );
}

/* ---------- 재생 ---------- */

interface ReplayScreenProps {
  readonly replay: SavedReplay;
  readonly onBack: () => void;
}

export function ReplayScreen({ replay, onBack }: ReplayScreenProps) {
  const loaded = useMemo(() => {
    try {
      return { states: replayStates(replay.data), times: replayTimes(replay.data) };
    } catch {
      return null;
    }
  }, [replay]);

  if (!loaded) {
    return (
      <Page title="리플레이" onBack={onBack}>
        <p className="notice notice-error">이 리플레이를 재생할 수 없습니다 (규칙이 바뀌었거나 저장 내용이 손상됨).</p>
      </Page>
    );
  }
  return <ReplayPlayer replay={replay} states={loaded.states} times={loaded.times} onBack={onBack} />;
}

type SightChoice = Color | 'both';
const SIGHT_CHOICES: readonly SightChoice[] = ['w', 'b', 'both'];

interface ReplayPlayerProps {
  readonly replay: SavedReplay;
  readonly states: readonly GameState[];
  readonly times: readonly number[];
  readonly onBack: () => void;
}

function ReplayPlayer({ replay, states, times, onBack }: ReplayPlayerProps) {
  const { state, busy, stageView, present } = useAnimatedGame(states[0]);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const fog = replay.data.setup.mode.fog;
  const [sightChoice, setSightChoice] = useState<SightChoice>(replay.viewer ?? 'both');
  const shown = useRef(0);
  const last = states.length - 1;

  /** 바로 다음 걸음이면 연출과 함께, 아니면 곧바로 그 국면으로 */
  const goTo = useCallback(
    (target: number) => {
      const next = Math.max(0, Math.min(last, target));
      if (next === shown.current) return;
      const stepForward = next === shown.current + 1;
      shown.current = next;
      setIndex(next);
      void present(states[next], { instant: !stepForward });
    },
    [last, present, states],
  );

  useEffect(() => {
    if (!playing || busy) return;
    if (index >= last) {
      setPlaying(false);
      return;
    }
    const timer = window.setTimeout(() => goTo(index + 1), PLAY_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [playing, busy, index, last, goTo]);

  const sight: ReplaySight | undefined = !fog ? undefined : sightChoice === 'both' ? { kind: 'both' } : { kind: 'color', color: sightChoice };
  const seats = {
    w: { name: replay.names.w, connected: true, isMe: replay.viewer === 'w' },
    b: { name: replay.names.b, connected: true, isMe: replay.viewer === 'b' },
  };
  const final = states[last].result;

  const controls = (
    <div className="replay-controls">
      <div className="replay-buttons" role="group" aria-label="재생 조작">
        <button type="button" className="btn btn-ghost" onClick={() => goTo(0)} aria-label="처음으로">
          ⏮
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => goTo(index - 1)} aria-label="이전 걸음">
          ◀
        </button>
        <button type="button" className="btn btn-primary" onClick={() => setPlaying((p) => !p && index < last)} aria-label={playing ? '일시정지' : '재생'}>
          {playing ? '⏸' : '▶'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => goTo(index + 1)} aria-label="다음 걸음">
          ▶|
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => goTo(last)} aria-label="끝으로">
          ⏭
        </button>
      </div>
      <label className="replay-seek">
        <input type="range" min={0} max={last} value={index} onChange={(event) => goTo(Number(event.target.value))} aria-label="걸음 이동" />
        <span className="replay-count">
          {index} / {last}
        </span>
      </label>
      {fog && (
        <>
          <div className="segmented" role="radiogroup" aria-label="시점">
            {SIGHT_CHOICES.map((choice) => (
              <button
                key={choice}
                type="button"
                role="radio"
                aria-checked={sightChoice === choice}
                className={sightChoice === choice ? 'active' : ''}
                onClick={() => setSightChoice(choice)}
              >
                {choice === 'both' ? '양쪽 시점' : `${COLOR_NAME[choice]} 시점`}
              </button>
            ))}
          </div>
          {sightChoice === 'both' && (
            <p className="replay-legend">
              <span className="legend-swatch haze-w" /> 백에게 안 보임 <span className="legend-swatch haze-b" /> 흑에게 안 보임
            </p>
          )}
        </>
      )}
      <p className="replay-final">
        결과: {resultText(final).title} <span className="replay-final-detail">{resultText(final).detail}</span>
      </p>
    </div>
  );

  return (
    <GameView
      state={state}
      busy={busy}
      stageView={stageView}
      dispatch={() => {}}
      myColor={null}
      seats={seats}
      spectator
      showResultDialog={false}
      sight={sight}
      clockNow={times[index]}
      hideAbilityPanel
      onMenu={onBack}
      resultActions={null}
      sidebar={controls}
    />
  );
}
