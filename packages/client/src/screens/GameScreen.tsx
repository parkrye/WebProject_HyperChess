import { opposite } from '@hyperchess/engine';
import { useMemo } from 'react';
import { useAiOpponent } from '../ai/useAiOpponent';
import { GameView } from '../components/GameView';
import { useLocalGame } from '../game/useGame';
import type { LocalGameConfig } from './SetupScreen';

const DIFFICULTY_LABEL = { easy: '쉬움', normal: '보통', hard: '어려움' } as const;

interface LocalGameScreenProps {
  readonly config: LocalGameConfig;
  readonly onRestart: () => void;
  readonly onMenu: () => void;
}

/** 한 기기에서 진행하는 대국: 핫시트 또는 AI 대전 */
export function LocalGameScreen({ config, onRestart, onMenu }: LocalGameScreenProps) {
  const setup = useMemo(() => ({ abilities: config.abilities }), [config.abilities]);
  const { state, busy, stageView, dispatch } = useLocalGame(setup);
  const { ai } = config;
  const { thinking } = useAiOpponent(state, ai, busy, dispatch);

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
