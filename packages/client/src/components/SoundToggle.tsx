import { useBgmMuted } from '../audio/bgm';

export function SoundToggle({ className = '' }: { className?: string }) {
  const [muted, setMuted] = useBgmMuted();
  return (
    <button
      type="button"
      className={`btn btn-ghost sound-toggle ${className}`}
      aria-label={muted ? '배경음악 켜기' : '배경음악 끄기'}
      aria-pressed={!muted}
      onClick={() => setMuted(!muted)}
    >
      {muted ? '🔇' : '🔊'}
    </button>
  );
}
