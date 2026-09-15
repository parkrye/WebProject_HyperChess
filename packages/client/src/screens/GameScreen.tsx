import { opposite, STANDARD_TIME_CONTROL } from '@hyperchess/engine';
import { toGameRecord } from '@hyperchess/protocol';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAiPlayers } from '../ai/useAiOpponent';
import { AbilityReveal } from '../components/AbilityReveal';
import { GameView } from '../components/GameView';
import { useLocalGame } from '../game/useGame';
import { DIFFICULTY_LABEL } from '../abilityUi/text';
import { reportResult } from '../stats/reportResult';
import type { LocalGameConfig } from './SetupScreen';

interface LocalGameScreenProps {
  readonly config: LocalGameConfig;
  readonly onRestart: () => void;
  readonly onMenu: () => void;
}

/** 무작위 능력이 있으면 공개 연출을 먼저 보여준 뒤 대국을 시작한다 (시계도 공개 후 시작) */
export function LocalGameScreen(props: LocalGameScreenProps) {
  const { config } = props;
  const needsReveal = Object.values(config.randomized).some(Boolean);
  const [revealed, setRevealed] = useState(!needsReveal);
  const finishReveal = useCallback(() => setRevealed(true), []);

  if (!revealed) {
    const names = config.ai
      ? { [config.ai.color]: `AI (${DIFFICULTY_LABEL[config.ai.difficulty]})`, [opposite(config.ai.color)]: '나' }
      : undefined;
    return (
      <div className="game">
        <AbilityReveal abilities={config.abilities} randomized={config.randomized} names={names} onDone={finishReveal} />
      </div>
    );
  }
  return <LocalGameBoard {...props} />;
}

/** 한 기기에서 진행하는 대국: 핫시트 또는 AI 대전 */
function LocalGameBoard({ config, onRestart, onMenu }: LocalGameScreenProps) {
  const setup = useMemo(() => ({ abilities: config.abilities, timeControl: STANDARD_TIME_CONTROL }), [config.abilities]);
  const { state, busy, stageView, dispatch } = useLocalGame(setup);
  const { ai } = config;
  const aiPlayers = useMemo(() => (ai ? { [ai.color]: ai.difficulty } : {}), [ai]);
  const { thinking } = useAiPlayers(state, aiPlayers, busy, dispatch);

  // 끝난 대국을 한 번만 기록한다
  const reported = useRef(false);
  useEffect(() => {
    if (reported.current) return;
    const record = ai ? toGameRecord(state, 'ai', { [ai.color]: ai.difficulty }) : toGameRecord(state, 'local');
    if (!record) return;
    reported.current = true;
    void reportResult(record);
  }, [state, ai]);

  const myColor = ai ? opposite(ai.color) : null;
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
      notice={thinking ? 'AI가 생각 중…' : null}
      resultActions={
        <>
          <button type="button" className="btn btn-primary" onClick={onRestart}>
            다시 하기
          </button>
          <button type="button" className="btn btn-ghost" onClick={onMenu}>
            메뉴로
          </button>
        </>
      }
    />
  );
}
