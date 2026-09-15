import type { Difficulty } from '@hyperchess/ai';
import type { Color } from '@hyperchess/engine';
import { RANDOM_ABILITY, resolveAbilityChoice, toGameRecord, type GameRecordInput } from '@hyperchess/protocol';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { COLOR_NAME, DIFFICULTY_LABEL, resultText } from '../abilityUi/text';
import { useAiPlayers } from '../ai/useAiOpponent';
import { AbilityReveal } from '../components/AbilityReveal';
import { GameView } from '../components/GameView';
import { useLocalGame } from '../game/useGame';
import { reportResult } from '../stats/reportResult';

export interface ArenaConfig {
  /** 능력 선택값 (무작위면 대국마다 새로 뽑는다) */
  readonly choices: Readonly<Record<Color, string>>;
  readonly difficulty: Readonly<Record<Color, Difficulty>>;
}

/** 연출 배속. 0은 연출 생략 */
type Speed = 1 | 2 | 4 | 0;
const SPEEDS: readonly { id: Speed; label: string }[] = [
  { id: 1, label: '1×' },
  { id: 2, label: '2×' },
  { id: 4, label: '4×' },
  { id: 0, label: '생략' },
];
const AI_THINK_MS = 450;
const NEXT_GAME_MS = 3000;

interface Tally {
  readonly games: number;
  readonly w: number;
  readonly b: number;
  readonly draws: number;
}

interface Match {
  readonly abilities: Record<Color, string>;
  readonly randomized: Record<Color, boolean>;
}

const resolveMatch = (choices: ArenaConfig['choices']): Match => ({
  abilities: { w: resolveAbilityChoice(choices.w), b: resolveAbilityChoice(choices.b) },
  randomized: { w: choices.w === RANDOM_ABILITY, b: choices.b === RANDOM_ABILITY },
});

interface ArenaScreenProps {
  readonly config: ArenaConfig;
  readonly onMenu: () => void;
}

/** AI 내전: AI끼리 두는 모습을 보여 주고, 결과를 서버에 기록한다 */
export function ArenaScreen({ config, onMenu }: ArenaScreenProps) {
  const [round, setRound] = useState(0);
  const [speed, setSpeed] = useState<Speed>(1);
  const [paused, setPaused] = useState(false);
  const [continuous, setContinuous] = useState(true);
  const [finished, setFinished] = useState(false);
  const [tally, setTally] = useState<Tally>({ games: 0, w: 0, b: 0, draws: 0 });
  const speedRef = useRef<number>(speed);
  speedRef.current = speed;

  // round가 바뀔 때마다 무작위 능력을 새로 뽑는다
  const match = useMemo(() => resolveMatch(config.choices), [config.choices, round]);

  const nextRound = useCallback(() => {
    setFinished(false);
    setRound((r) => r + 1);
  }, []);

  const handleFinish = useCallback((record: GameRecordInput) => {
    setFinished(true);
    setTally((t) => ({
      games: t.games + 1,
      w: t.w + (record.winner === 'w' ? 1 : 0),
      b: t.b + (record.winner === 'b' ? 1 : 0),
      draws: t.draws + (record.winner === null ? 1 : 0),
    }));
    void reportResult(record);
  }, []);

  useEffect(() => {
    if (!finished || !continuous || paused) return;
    const timer = window.setTimeout(nextRound, NEXT_GAME_MS / Math.max(1, speed));
    return () => window.clearTimeout(timer);
  }, [finished, continuous, paused, speed, nextRound]);

  const controls = (
    <section className="arena-panel" aria-label="AI 내전 조작">
      <div className="arena-controls">
        <div className="segmented" role="radiogroup" aria-label="배속">
          {SPEEDS.map(({ id, label }) => (
            <button key={id} type="button" role="radio" aria-checked={speed === id} className={speed === id ? 'active' : ''} onClick={() => setSpeed(id)}>
              {label}
            </button>
          ))}
        </div>
        <button type="button" className="btn btn-ghost" aria-pressed={paused} onClick={() => setPaused((p) => !p)}>
          {paused ? '▶ 계속' : '⏸ 일시정지'}
        </button>
        <label className="arena-toggle">
          <input type="checkbox" checked={continuous} onChange={(e) => setContinuous(e.target.checked)} />
          연속 대국
        </label>
      </div>
      <p className="arena-tally">
        {tally.games}판 · 백 {tally.w}승 · 흑 {tally.b}승 · 무 {tally.draws}
      </p>
    </section>
  );

  const resultActions = (
    <>
      <button type="button" className="btn btn-primary" onClick={nextRound}>
        {continuous && !paused ? '바로 다음 대국' : '다음 대국'}
      </button>
      <button type="button" className="btn btn-ghost" onClick={onMenu}>
        메뉴로
      </button>
    </>
  );

  return (
    <ArenaRound
      key={round}
      match={match}
      difficulty={config.difficulty}
      speed={speed}
      speedRef={speedRef}
      paused={paused}
      autoNext={continuous && !paused}
      onFinish={handleFinish}
      onMenu={onMenu}
      controls={controls}
      resultActions={resultActions}
    />
  );
}

interface ArenaRoundProps {
  readonly match: Match;
  readonly difficulty: ArenaConfig['difficulty'];
  readonly speed: Speed;
  readonly speedRef: RefObject<number>;
  readonly paused: boolean;
  /** 연속 대국으로 곧 다음 판이 시작되면 결과 창 대신 안내만 띄운다 */
  readonly autoNext: boolean;
  readonly onFinish: (record: GameRecordInput) => void;
  readonly onMenu: () => void;
  readonly controls: ReactNode;
  readonly resultActions: ReactNode;
}

const seatName = (color: Color, difficulty: Difficulty) => `${COLOR_NAME[color]} AI (${DIFFICULTY_LABEL[difficulty]})`;

/** 한 판: 무작위 능력이면 공개 연출(연출 생략 배속에서는 건너뜀) 후 대국 */
function ArenaRound(props: ArenaRoundProps) {
  const { match, difficulty } = props;
  const needsReveal = (match.randomized.w || match.randomized.b) && props.speed !== 0;
  const [revealed, setRevealed] = useState(!needsReveal);
  const finishReveal = useCallback(() => setRevealed(true), []);

  if (!revealed) {
    return (
      <div className="game">
        <AbilityReveal
          abilities={match.abilities}
          randomized={match.randomized}
          names={{ w: seatName('w', difficulty.w), b: seatName('b', difficulty.b) }}
          onDone={finishReveal}
        />
      </div>
    );
  }
  return <ArenaBoard {...props} />;
}

function ArenaBoard({ match, difficulty, speed, speedRef, paused, autoNext, onFinish, onMenu, controls, resultActions }: ArenaRoundProps) {
  // 관전·기록용이라 시간 제한 없이 둔다 (일시정지 가능)
  const setup = useMemo(() => ({ abilities: match.abilities }), [match.abilities]);
  const { state, busy, stageView, dispatch, actions } = useLocalGame(setup, speedRef);
  const minThinkMs = speed === 0 ? 0 : AI_THINK_MS / speed;
  const { thinking } = useAiPlayers(state, difficulty, busy, dispatch, { paused, minThinkMs });

  const reported = useRef(false);
  useEffect(() => {
    if (reported.current) return;
    const record = toGameRecord(state, 'arena', { difficulty, actions: [...actions.current] });
    if (!record) return;
    reported.current = true;
    onFinish(record);
  }, [state, difficulty, onFinish, actions]);

  const seats = useMemo(
    () => ({
      w: { name: seatName('w', difficulty.w), connected: true, isMe: false },
      b: { name: seatName('b', difficulty.b), connected: true, isMe: false },
    }),
    [difficulty],
  );

  const notice = (() => {
    if (state.result.kind !== 'ongoing') {
      const { title, detail } = resultText(state.result);
      return `${title} (${detail})${autoNext ? ' · 곧 다음 대국이 시작됩니다' : ''}`;
    }
    if (paused) return '일시정지됨';
    return thinking ? `${COLOR_NAME[state.turn]} AI가 생각 중…` : null;
  })();

  return (
    <GameView
      state={state}
      busy={busy}
      stageView={stageView}
      dispatch={dispatch}
      myColor={null}
      spectator
      seats={seats}
      randomized={match.randomized}
      onMenu={onMenu}
      notice={notice}
      sidebar={controls}
      showResultDialog={!autoNext}
      resultActions={resultActions}
    />
  );
}
