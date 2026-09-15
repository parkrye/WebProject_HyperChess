import { useEffect, useRef, useState } from 'react';
import { useSession } from '../auth/session';

/** 상단 바의 사용자 버튼: 누르면 로그아웃(게스트는 로그인) 메뉴 */
export function UserMenu() {
  const { session, signOut } = useSession();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  if (!session) return null;
  const user = session.kind === 'user' ? session.user : null;

  return (
    <div className="user-menu" ref={rootRef}>
      <button type="button" className="user-chip" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span className="user-crown" aria-hidden>
          ♛
        </span>
        <span className="user-name">{user ? user.nickname : '게스트'}</span>
        {user && <span className="user-rating">{user.rating}</span>}
        <span className="user-caret" aria-hidden>
          ▾
        </span>
      </button>
      {open && (
        <div className="user-popover" role="menu">
          <button
            type="button"
            role="menuitem"
            className="user-popover-item"
            onClick={() => {
              setOpen(false);
              void signOut();
            }}
          >
            {user ? '로그아웃' : '로그인'}
          </button>
        </div>
      )}
    </div>
  );
}
