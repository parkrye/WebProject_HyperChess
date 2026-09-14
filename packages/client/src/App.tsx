import { useState } from 'react';
import type { GameMode } from './components/ModeTabs';
import { LocalGameScreen } from './screens/GameScreen';
import { OnlineScreen } from './screens/OnlineScreen';
import { SetupScreen, type AbilityChoice } from './screens/SetupScreen';

type Screen =
  | { kind: 'setup' }
  | { kind: 'online' }
  | { kind: 'local'; abilities: AbilityChoice; round: number };

const DEFAULT_CHOICE: AbilityChoice = { w: 'telekinesis', b: 'rewind' };

const initialScreen = (): Screen =>
  new URLSearchParams(window.location.search).has('room') ? { kind: 'online' } : { kind: 'setup' };

export function App() {
  const [screen, setScreen] = useState<Screen>(initialScreen);
  const [lastChoice, setLastChoice] = useState<AbilityChoice>(DEFAULT_CHOICE);

  const changeMode = (mode: GameMode) => {
    if (mode === 'online') setScreen({ kind: 'online' });
    if (mode === 'local') setScreen({ kind: 'setup' });
  };

  switch (screen.kind) {
    case 'setup':
      return (
        <SetupScreen
          initial={lastChoice}
          onModeChange={changeMode}
          onStart={(abilities) => {
            setLastChoice(abilities);
            setScreen({ kind: 'local', abilities, round: 0 });
          }}
        />
      );
    case 'online':
      return <OnlineScreen onModeChange={changeMode} />;
    case 'local':
      return (
        <LocalGameScreen
          key={screen.round}
          abilities={screen.abilities}
          onRestart={() => setScreen({ ...screen, round: screen.round + 1 })}
          onMenu={() => setScreen({ kind: 'setup' })}
        />
      );
  }
}
