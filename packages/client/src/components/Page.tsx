import type { ReactNode } from 'react';
import { uiIconSprite } from '../assets/sprites';
import { SoundToggle } from './SoundToggle';

interface PageProps {
  readonly title?: string;
  /** 없으면 뒤로가기 버튼을 두지 않는다 */
  readonly onBack?: () => void;
  readonly backLabel?: string;
  readonly className?: string;
  readonly children: ReactNode;
}

/** 모든 메뉴 페이지의 공통 틀: 문서 흐름 안의 헤더(뒤로·제목·소리) + 본문. 고정 요소가 없어 스크롤해도 겹치지 않는다 */
export function Page({ title, onBack, backLabel = '뒤로', className = '', children }: PageProps) {
  return (
    <div className={`page ${className}`}>
      <header className="page-header">
        <div className="page-header-side">
          {onBack && (
            <button type="button" className="btn btn-ghost btn-icon-text" onClick={onBack}>
              <img className="ui-icon" src={uiIconSprite('exit')} alt="" draggable={false} />
              {backLabel}
            </button>
          )}
        </div>
        {/* 제목이 없어도 가운데 칸을 유지해 좌우 버튼 위치가 페이지마다 같게 한다 */}
        <h1 className="page-title">{title}</h1>
        <div className="page-header-side page-header-end">
          <SoundToggle />
        </div>
      </header>
      <main className="page-body">{children}</main>
    </div>
  );
}
