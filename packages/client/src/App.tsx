import { useState } from 'react';
import { GameScreen } from './screens/GameScreen';
import { SetupScreen, type AbilityChoice } from './screens/SetupScreen';

type Screen = { kind: 'setup' } | { kind: 'game'; abilities: AbilityChoice; round: number };

const DEFAULT_CHOICE: AbilityChoice = { w: 'telekinesis', b: 'rewind' };

export function App() {
  const [screen, setScreen] = useState<Screen>({ kind: 'setup' });
  const [lastChoice, setLastChoice] = useState<AbilityChoice>(DEFAULT_CHOICE);

  if (screen.kind === 'setup') {
    return (
      <SetupScreen
        initial={lastChoice}
        onStart={(abilities) => {
          setLastChoice(abilities);
          setScreen({ kind: 'game', abilities, round: 0 });
        }}
      />
    );
  }

  return (
    <GameScreen
      key={screen.round}
      abilities={screen.abilities}
      onRestart={() => setScreen({ ...screen, round: screen.round + 1 })}
      onMenu={() => setScreen({ kind: 'setup' })}
    />
  );
}
