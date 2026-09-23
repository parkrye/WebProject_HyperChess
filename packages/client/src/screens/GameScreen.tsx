import { opposite, placementFen, STANDARD_TIME_CONTROL, type Color, type DrawVote, type Placement } from '@hyperchess/engine';
import { toGameRecord } from '@hyperchess/protocol';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAiPlayers } from '../ai/useAiOpponent';
import { AbilityReveal } from '../components/AbilityReveal';
import { DraftBoard } from '../components/DraftBoard';
import { Page } from '../components/Page';
import { SaveReplayButton } from '../components/SaveReplayButton';
import { GameView } from '../components/GameView';
import { aiDraftPlacement, chaosFen } from '../game/deployment';
import { useLocalGame } from '../game/useGame';
import { COLOR_NAME, DIFFICULTY_LABEL } from '../abilityUi/text';
import { reportResult } from '../stats/reportResult';
import type { LocalGameConfig } from './SetupScreen';

interface LocalGameScreenProps {
  readonly config: LocalGameConfig;
  readonly onRestart: () => void;
  readonly onMenu: () => void;
}

const COLORS: readonly Color[] = ['w', 'b'];

/**
 * 무작위 능력이 있으면 공개 연출을 먼저 보여주고, 징병전이면 편성을 받은 뒤 대국을 시작한다 (시계도 그 뒤에 시작).
 * 혼돈 배치는 판마다 새로 뽑는다 (다시 하기는 이 화면을 새로 띄운다).
 */
export function LocalGameScreen(props: LocalGameScreenProps) {
  const { config } = props;
  const needsReveal = Object.values(config.randomized).some(Boolean);
  const [revealed, setRevealed] = useState(!needsReveal);
  const finishReveal = useCallback(() => setRevealed(true), []);
  const [chaos] = useState(() => (config.mode.deployment === 'chaos' ? chaosFen() : null));
  // AI 편성은 미리 정해 둔다
  const [drafts, setDrafts] = useState<Partial<Record<Color, Placement>>>(() =>
    config.mode.deployment === 'draft' && config.ai ? { [config.ai.color]: aiDraftPlacement(config.ai.color) } : {},
  );

  if (!revealed) {
    const names = config.ai
      ? { [config.ai.color]: `AI (${DIFFICULTY_LABEL[config.ai.difficulty]})`, [opposite(config.ai.color)]: '나' }
      : undefined;
    return (
      <div className="game">
        <AbilityReveal abilities={config.abilities} randomized={config.randomized} names={names} hidden={secretReveal(config)} onDone={finishReveal} />
      </div>
    );
  }

  if (config.mode.deployment === 'draft') {
    const pending = COLORS.find((color) => !drafts[color]);
    if (pending) {
      // 핫시트에서 두 번째로 편성하는 쪽은 앞사람의 편성을 보지 않도록 한 번 가린다
      const handoff = !config.ai && pending === 'b';
      return (
        <DraftPhase
          key={pending}
          color={pending}
          handoff={handoff}
          onDone={(placement) => setDrafts((prev) => ({ ...prev, [pending]: placement }))}
          onMenu={props.onMenu}
        />
      );
    }
  }

  const fen = chaos ?? (drafts.w && drafts.b ? placementFen(drafts.w, drafts.b) : undefined);
  return <LocalGameBoard {...props} fen={fen} />;
}

/** 비밀 능력: AI 대전은 AI 능력을, 핫시트는 둘 다 공개 화면에서 가린다 (각자 자기 차례에 본다) */
function secretReveal(config: LocalGameScreenProps['config']): Partial<Record<Color, boolean>> {
  if (!config.mode.secret) return {};
  return config.ai ? { [config.ai.color]: true } : { w: true, b: true };
}

interface DraftPhaseProps {
  readonly color: Color;
  readonly handoff: boolean;
  readonly onDone: (placement: Placement) => void;
  readonly onMenu: () => void;
}

function DraftPhase({ color, handoff, onDone, onMenu }: DraftPhaseProps) {
  const [open, setOpen] = useState(!handoff);
  return (
    <Page title={`징병 · ${COLOR_NAME[color]} 편성`} onBack={onMenu} backLabel="나가기">
      {open ? (
        <DraftBoard color={color} onDone={onDone} />
      ) : (
        <div className="handoff-card handoff-inline">
          <strong>{COLOR_NAME[color]} 편성 차례</strong>
          <p>상대가 화면을 보지 않을 때 누르세요.</p>
          <button type="button" className="btn btn-primary btn-large" onClick={() => setOpen(true)}>
            편성 시작
          </button>
        </div>
      )}
    </Page>
  );
}

/** 한 기기에서 진행하는 대국: 핫시트 또는 AI 대전 */
function LocalGameBoard({ config, fen, onRestart, onMenu }: LocalGameScreenProps & { readonly fen?: string }) {
  const setup = useMemo(
    () => ({ abilities: config.abilities, timeControl: STANDARD_TIME_CONTROL, mode: config.mode, fen }),
    [config.abilities, config.mode, fen],
  );
  const { state, busy, stageView, dispatch, actions, vote, giveUp, replay } = useLocalGame(setup);
  const { ai } = config;
  const aiPlayers = useMemo(() => (ai ? { [ai.color]: ai.difficulty } : {}), [ai]);
  // 무승부 제안에 답하는 동안에는 AI도 수를 고르지 않는다
  const { thinking } = useAiPlayers(state, aiPlayers, busy, dispatch, { paused: !!state.draw.offer });

  // 끝난 대국을 한 번만 기록한다
  const reported = useRef(false);
  useEffect(() => {
    if (reported.current) return;
    const extras = { actions: [...actions.current], ...(ai ? { difficulty: { [ai.color]: ai.difficulty } } : {}) };
    const record = toGameRecord(state, ai ? 'ai' : 'local', extras);
    if (!record) return;
    reported.current = true;
    void reportResult(record);
  }, [state, ai, actions]);

  const myColor = ai ? opposite(ai.color) : null;

  const confirmResign = () => {
    // 핫시트에서는 지금 둘 차례인 쪽이 기권한다
    const color = myColor ?? state.turn;
    if (window.confirm(`${COLOR_NAME[color]}이 기권합니다. 정말 기권할까요?`)) giveUp(color);
  };
  // AI 대전에서는 AI가 사람의 선택을 그대로 따른다 (핫시트는 두 색이 차례로 답한다)
  const voteDrawAs = (color: Color, choice: DrawVote) => vote(ai ? [color, ai.color] : [color], choice);
  const seats = ai
    ? {
        [myColor!]: { name: '나', connected: true, isMe: false },
        [ai.color]: { name: `AI (${DIFFICULTY_LABEL[ai.difficulty]})`, connected: true, isMe: false },
      }
    : undefined;

  return (
    <GameView
      state={state}
      busy={busy}
      stageView={stageView}
      dispatch={dispatch}
      myColor={myColor}
      seats={seats as Parameters<typeof GameView>[0]['seats']}
      randomized={config.randomized}
      onMenu={onMenu}
      onResign={confirmResign}
      onDrawVote={voteDrawAs}
      notice={thinking ? 'AI가 생각 중…' : null}
      resultActions={
        <>
          <button type="button" className="btn btn-primary" onClick={onRestart}>
            다시 하기
          </button>
          <SaveReplayButton
            entry={() => ({
              source: ai ? 'ai' : 'local',
              names: { w: seats?.w?.name ?? COLOR_NAME.w, b: seats?.b?.name ?? COLOR_NAME.b },
              viewer: myColor,
              result: state.result,
              data: replay(),
            })}
          />
          <button type="button" className="btn btn-ghost" onClick={onMenu}>
            메뉴로
          </button>
        </>
      }
    />
  );
}
