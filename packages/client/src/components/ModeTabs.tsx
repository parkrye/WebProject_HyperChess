import { uiSprite } from '../assets/sprites';
import { useInstallPrompt } from '../pwa/useInstallPrompt';
import { AccountBadge } from './AccountBadge';
import { SoundToggle } from './SoundToggle';

export type GameMode = 'local' | 'ai' | 'arena' | 'online' | 'stats' | 'ranking';

const MODES: readonly { id: GameMode; label: string; enabled: boolean }[] = [
  { id: 'local', label: '로컬 2인', enabled: true },
  { id: 'ai', label: 'AI 대전', enabled: true },
  { id: 'arena', label: 'AI 내전', enabled: true },
  { id: 'online', label: '온라인', enabled: true },
  { id: 'stats', label: '통계', enabled: true },
  { id: 'ranking', label: '랭킹', enabled: true },
];

export function ModeTabs({ active, onChange }: { active: GameMode; onChange: (mode: GameMode) => void }) {
  return (
    <nav className="mode-tabs" aria-label="게임 모드">
      {MODES.map((mode) => (
        <button
          key={mode.id}
          type="button"
          className={`mode-tab ${mode.id === active ? 'active' : ''}`}
          disabled={!mode.enabled}
          aria-current={mode.id === active}
          onClick={() => onChange(mode.id)}
        >
          {mode.label}
          {!mode.enabled && <small>준비 중</small>}
        </button>
      ))}
    </nav>
  );
}

export function Hero() {
  return (
    <header className="setup-hero">
      <SoundToggle className="hero-sound" />
      <AccountBadge />
      <h1 className="logo">
        <img src={uiSprite.logo} alt="HyperChess" draggable={false} />
      </h1>
      <p>초능력을 하나 골라 체스판을 뒤흔드세요</p>
      <InstallButton />
    </header>
  );
}

/** 홈 화면 설치 버튼 (설치 가능할 때만), iOS는 수동 추가 안내 */
function InstallButton() {
  const { canInstall, showIosHint, install } = useInstallPrompt();
  if (canInstall) {
    return (
      <button type="button" className="btn install-button" onClick={() => void install()}>
        📲 앱으로 설치
      </button>
    );
  }
  if (showIosHint) return <p className="install-hint">Safari 공유 버튼 → "홈 화면에 추가"로 앱처럼 실행할 수 있어요</p>;
  return null;
}
