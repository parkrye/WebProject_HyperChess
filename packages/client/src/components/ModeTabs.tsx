import { uiSprite } from '../assets/sprites';
import { useInstallPrompt } from '../pwa/useInstallPrompt';
import { AccountBadge } from './AccountBadge';
import { SoundToggle } from './SoundToggle';

/** 화면 이동 대상. 'single'은 마지막으로 연 싱글 모드로 이동 */
export type GameMode = 'single' | 'local' | 'ai' | 'arena' | 'online' | 'stats' | 'ranking';

const SINGLE_MODES: readonly { id: GameMode; label: string }[] = [
  { id: 'local', label: '로컬 플레이' },
  { id: 'ai', label: 'AI 대전' },
  { id: 'arena', label: 'AI 내전' },
];

const LINKS: readonly { id: GameMode; label: string; icon: string }[] = [
  { id: 'stats', label: '통계', icon: '📊' },
  { id: 'ranking', label: '랭킹', icon: '🏆' },
];

/** 싱글/멀티 큰 분기 + 싱글 하위 모드, 오른쪽 위에 통계·랭킹 바로가기 */
export function ModeTabs({ active, onChange }: { active: GameMode; onChange: (mode: GameMode) => void }) {
  const isSingle = SINGLE_MODES.some((mode) => mode.id === active);
  return (
    <>
      <nav className="mode-tabs" aria-label="게임 모드">
        <button type="button" className={`mode-tab mode-tab-main ${isSingle ? 'active' : ''}`} aria-current={isSingle} onClick={() => onChange('single')}>
          싱글
        </button>
        <button type="button" className={`mode-tab mode-tab-main ${active === 'online' ? 'active' : ''}`} aria-current={active === 'online'} onClick={() => onChange('online')}>
          멀티
        </button>
      </nav>
      {isSingle && (
        <nav className="segmented sub-tabs" aria-label="싱글 플레이">
          {SINGLE_MODES.map((mode) => (
            <button key={mode.id} type="button" className={mode.id === active ? 'active' : ''} aria-current={mode.id === active} onClick={() => onChange(mode.id)}>
              {mode.label}
            </button>
          ))}
        </nav>
      )}
      <nav className="quick-links" aria-label="기록">
        {LINKS.map((link) => (
          <button
            key={link.id}
            type="button"
            className={`btn btn-ghost quick-link ${link.id === active ? 'active' : ''}`}
            aria-current={link.id === active}
            onClick={() => onChange(link.id)}
          >
            <span aria-hidden>{link.icon}</span>
            {link.label}
          </button>
        ))}
      </nav>
    </>
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
