export type GameMode = 'local' | 'ai' | 'online';

const MODES: readonly { id: GameMode; label: string; enabled: boolean }[] = [
  { id: 'local', label: '로컬 2인', enabled: true },
  { id: 'ai', label: 'AI 대전', enabled: true },
  { id: 'online', label: '온라인', enabled: true },
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
      <h1>
        HYPER<span>CHESS</span>
      </h1>
      <p>초능력을 하나 골라 체스판을 뒤흔드세요</p>
    </header>
  );
}
