import type { ReactNode } from 'react';
import { useSession } from '../auth/session';
import { uiIconSprite } from '../assets/sprites';
import { useAppNav } from './AppNav';
import { SoundToggle } from './SoundToggle';
import { UserMenu } from './UserMenu';

interface PageProps {
  readonly title?: string;
  /** 없으면 뒤로가기 버튼을 두지 않는다 */
  readonly onBack?: () => void;
  readonly backLabel?: string;
  /** 랭킹·통계·사용자 버튼 표시 (로그인 전 페이지는 false) */
  readonly showNav?: boolean;
  readonly className?: string;
  readonly children: ReactNode;
}

/** 모든 메뉴 페이지의 공통 틀: 문서 흐름 안의 상단 바(뒤로 · 제목 · 랭킹 · 통계 · 사용자 · 소리) + 본문 */
export function Page({ title, onBack, backLabel = '뒤로', showNav = true, className = '', children }: PageProps) {
  const nav = useAppNav();
  const { session } = useSession();
  const navVisible = showNav && !!nav && !!session;

  return (
    <div className={`page ${className}`}>
      <header className="page-header">
        <div className="page-header-back">
          {onBack && (
            <button type="button" className="btn btn-ghost header-button" onClick={onBack} aria-label={backLabel}>
              <img className="ui-icon" src={uiIconSprite('exit')} alt="" draggable={false} />
              <span className="header-button-label">{backLabel}</span>
            </button>
          )}
        </div>
        {/* 제목이 없어도 가운데 칸을 유지해 좌우 버튼 위치가 페이지마다 같게 한다 */}
        <h1 className="page-title">{title}</h1>
        <div className="page-header-actions">
          {navVisible && (
            <>
              <button
                type="button"
                className={`btn btn-ghost icon-button ${nav.current === 'ranking' ? 'active' : ''}`}
                aria-label="랭킹"
                aria-current={nav.current === 'ranking'}
                onClick={nav.openRanking}
              >
                🏆
              </button>
              <button
                type="button"
                className={`btn btn-ghost icon-button ${nav.current === 'stats' ? 'active' : ''}`}
                aria-label="통계"
                aria-current={nav.current === 'stats'}
                onClick={nav.openStats}
              >
                📊
              </button>
              <UserMenu />
            </>
          )}
          <SoundToggle className="icon-button" />
        </div>
      </header>
      <main className="page-body">{children}</main>
    </div>
  );
}
