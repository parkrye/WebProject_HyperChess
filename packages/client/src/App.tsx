import { useState } from 'react';
import { useSession } from './auth/session';
import { AbilityGuideScreen } from './screens/AbilityGuideScreen';
import { AppNavContext, type AppNav } from './components/AppNav';
import { ArenaScreen, type ArenaConfig } from './screens/ArenaScreen';
import { LocalGameScreen } from './screens/GameScreen';
import { MainScreen } from './screens/MainScreen';
import { OnlineScreen } from './screens/OnlineScreen';
import { RankingScreen } from './screens/RankingScreen';
import { ReplayListScreen, ReplayScreen } from './screens/ReplayScreen';
import type { SavedReplay } from './replay/storage';
import { DEFAULT_SETUP_PREFS, SetupScreen, type LocalGameConfig, type SetupMode, type SetupPrefs } from './screens/SetupScreen';
import { SingleMenuScreen } from './screens/SingleMenuScreen';
import { StatsScreen } from './screens/StatsScreen';
import { TitleScreen } from './screens/TitleScreen';
import { WelcomeScreen } from './screens/WelcomeScreen';

/** 페이지: 타이틀 → (로그인) → 메인 → 싱글/멀티/능력 설명/랭킹/통계 → 설정 → 대국 */
type Screen =
  | { kind: 'title' }
  | { kind: 'login' }
  | { kind: 'main' }
  | { kind: 'single' }
  | { kind: 'setup'; mode: SetupMode }
  | { kind: 'online' }
  | { kind: 'guide' }
  | { kind: 'stats' }
  | { kind: 'ranking' }
  | { kind: 'replays' }
  | { kind: 'replay'; replay: SavedReplay }
  | {
      kind: 'game';
      config: LocalGameConfig;
      mode: 'local' | 'ai';
      round: number;
    }
  | { kind: 'arena'; config: ArenaConfig };

/** 초대 링크(?room=)로 들어오면 바로 멀티로 */
const initialScreen = (): Screen => (new URLSearchParams(window.location.search).has('room') ? { kind: 'online' } : { kind: 'title' });

export function App() {
  const { session } = useSession();
  const [screen, setScreen] = useState<Screen>(initialScreen);
  const [prefs, setPrefs] = useState<SetupPrefs>(DEFAULT_SETUP_PREFS);
  const go = (next: Screen) => {
    setScreen(next);
    window.scrollTo(0, 0);
  };

  const nav: AppNav = {
    current: screen.kind,
    openRanking: () => go({ kind: 'ranking' }),
    openStats: () => go({ kind: 'stats' }),
  };
  return <AppNavContext.Provider value={nav}>{renderScreen()}</AppNavContext.Provider>;

  function renderScreen() {
    // 타이틀 이외의 페이지는 계정(게스트 포함)을 고른 뒤에 들어간다
    if (!session && screen.kind !== 'title') {
      return <WelcomeScreen onDone={() => go(screen.kind === 'login' ? { kind: 'main' } : screen)} onBack={() => go({ kind: 'title' })} />;
    }

    switch (screen.kind) {
      case 'title':
        return <TitleScreen onStart={() => go(session ? { kind: 'main' } : { kind: 'login' })} />;
      case 'login':
        return <WelcomeScreen onDone={() => go({ kind: 'main' })} onBack={() => go({ kind: 'title' })} />;
      case 'main':
        return <MainScreen onSelect={(target) => go({ kind: target })} onBack={() => go({ kind: 'title' })} />;
      case 'single':
        return <SingleMenuScreen onSelect={(mode) => go({ kind: 'setup', mode })} onBack={() => go({ kind: 'main' })} />;
      case 'setup':
        return (
          <SetupScreen
            key={screen.mode}
            mode={screen.mode}
            prefs={prefs}
            onBack={() => go({ kind: 'single' })}
            onStart={(config, nextPrefs) => {
              setPrefs(nextPrefs);
              go({
                kind: 'game',
                config,
                mode: screen.mode === 'ai' ? 'ai' : 'local',
                round: 0,
              });
            }}
            onStartArena={(config, nextPrefs) => {
              setPrefs(nextPrefs);
              go({ kind: 'arena', config });
            }}
          />
        );
      case 'online':
        return <OnlineScreen onBack={() => go({ kind: 'main' })} onSingle={() => go({ kind: 'single' })} />;
      case 'guide':
        return <AbilityGuideScreen onBack={() => go({ kind: 'main' })} />;
      case 'stats':
        return <StatsScreen onBack={() => go({ kind: 'main' })} />;
      case 'ranking':
        return <RankingScreen onBack={() => go({ kind: 'main' })} />;
      case 'replays':
        return <ReplayListScreen onOpen={(replay) => go({ kind: 'replay', replay })} onBack={() => go({ kind: 'main' })} />;
      case 'replay':
        return <ReplayScreen replay={screen.replay} onBack={() => go({ kind: 'replays' })} />;
      case 'game':
        return (
          <LocalGameScreen
            key={screen.round}
            config={screen.config}
            onRestart={() => setScreen({ ...screen, round: screen.round + 1 })}
            onMenu={() => go({ kind: 'setup', mode: screen.mode })}
          />
        );
      case 'arena':
        return <ArenaScreen config={screen.config} onMenu={() => go({ kind: 'setup', mode: 'arena' })} />;
    }
  }
}
