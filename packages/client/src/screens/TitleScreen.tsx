import { useBgm } from '../audio/bgm';
import { uiSprite } from '../assets/sprites';
import { SoundToggle } from '../components/SoundToggle';
import { useInstallPrompt } from '../pwa/useInstallPrompt';

export function TitleScreen({ onStart }: { onStart: () => void }) {
  useBgm('title');
  return (
    <div className="page title-page">
      <header className="page-header">
        <div className="page-header-side" />
        <div className="page-header-side page-header-end">
          <SoundToggle />
        </div>
      </header>
      <main className="title-body">
        <h1 className="logo">
          <img src={uiSprite.logo} alt="HyperChess" draggable={false} />
        </h1>
        <button type="button" className="btn btn-primary btn-large" onClick={onStart}>
          시작
        </button>
        <InstallButton />
      </main>
    </div>
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
  if (showIosHint) return <p className="install-hint">Safari 공유 버튼 → "홈 화면에 추가"로 설치할 수 있어요</p>;
  return null;
}
