import { useMemo } from 'react';
import { GameView } from '../components/GameView';
import { useLocalGame } from '../game/useGame';
import type { AbilityChoice } from './SetupScreen';

interface LocalGameScreenProps {
  readonly abilities: AbilityChoice;
  readonly onRestart: () => void;
  readonly onMenu: () => void;
}

export function LocalGameScreen({ abilities, onRestart, onMenu }: LocalGameScreenProps) {
  const setup = useMemo(() => ({ abilities }), [abilities]);
  const { state, busy, stageView, dispatch } = useLocalGame(setup);

  return (
    <GameView
      state={state}
      busy={busy}
      stageView={stageView}
      dispatch={dispatch}
      myColor={null}
      onMenu={onMenu}
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
