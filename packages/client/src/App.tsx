import { useState } from 'react';
import type { GameMode } from './components/ModeTabs';
import { ArenaScreen, type ArenaConfig } from './screens/ArenaScreen';
import { LocalGameScreen } from './screens/GameScreen';
import { OnlineScreen } from './screens/OnlineScreen';
import { RankingScreen } from './screens/RankingScreen';
import { StatsScreen } from './screens/StatsScreen';
import { WelcomeScreen } from './screens/WelcomeScreen';
import { useSession } from './auth/session';
import { DEFAULT_SETUP_PREFS, SetupScreen, type LocalGameConfig, type SetupMode, type SetupPrefs } from './screens/SetupScreen';

type Screen =
  | { kind: 'setup'; mode: SetupMode }
  | { kind: 'online' }
  | { kind: 'stats' }
  | { kind: 'ranking' }
  | { kind: 'game'; config: LocalGameConfig; mode: 'local' | 'ai'; round: number }
  | { kind: 'arena'; config: ArenaConfig };

const initialScreen = (): Screen =>
  new URLSearchParams(window.location.search).has('room') ? { kind: 'online' } : { kind: 'setup', mode: 'local' };

export function App() {
  const { session } = useSession();
  const [screen, setScreen] = useState<Screen>(initialScreen);
  const [prefs, setPrefs] = useState<SetupPrefs>(DEFAULT_SETUP_PREFS);

  const changeMode = (mode: GameMode) => {
    if (mode === 'online' || mode === 'stats' || mode === 'ranking') setScreen({ kind: mode });
    else setScreen({ kind: 'setup', mode });
  };

  if (!session) return <WelcomeScreen />;

  switch (screen.kind) {
    case 'setup':
      return (
        <SetupScreen
          key={screen.mode}
          mode={screen.mode}
          prefs={prefs}
          onModeChange={changeMode}
          onStart={(config, nextPrefs) => {
            setPrefs(nextPrefs);
            setScreen({ kind: 'game', config, mode: screen.mode === 'ai' ? 'ai' : 'local', round: 0 });
          }}
          onStartArena={(config, nextPrefs) => {
            setPrefs(nextPrefs);
            setScreen({ kind: 'arena', config });
          }}
        />
      );
    case 'online':
      return <OnlineScreen onModeChange={changeMode} />;
    case 'stats':
      return <StatsScreen onModeChange={changeMode} />;
    case 'ranking':
      return <RankingScreen onModeChange={changeMode} />;
    case 'game':
      return (
        <LocalGameScreen
          key={screen.round}
          config={screen.config}
          onRestart={() => setScreen({ ...screen, round: screen.round + 1 })}
          onMenu={() => setScreen({ kind: 'setup', mode: screen.mode })}
        />
      );
    case 'arena':
      return <ArenaScreen config={screen.config} onMenu={() => setScreen({ kind: 'setup', mode: 'arena' })} />;
  }
}
