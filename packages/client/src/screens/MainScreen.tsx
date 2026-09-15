import { useBgm } from '../audio/bgm';
import { useSession } from '../auth/session';
import { Page } from '../components/Page';

export type MenuTarget = 'single' | 'online' | 'ranking' | 'stats';

const MENU: readonly { id: MenuTarget; label: string }[] = [
  { id: 'single', label: '싱글' },
  { id: 'online', label: '멀티' },
  { id: 'ranking', label: '랭킹' },
  { id: 'stats', label: '통계' },
];

interface MainScreenProps {
  readonly onSelect: (target: MenuTarget) => void;
  readonly onBack: () => void;
}

export function MainScreen({ onSelect, onBack }: MainScreenProps) {
  const { session, signOut } = useSession();
  useBgm('title');

  return (
    <Page onBack={onBack} backLabel="타이틀">
      <div className="account-line">
        {session?.kind === 'user' ? (
          <span>
            <strong>{session.user.nickname}</strong> · {session.user.rating}
          </span>
        ) : (
          <span>게스트</span>
        )}
        <button type="button" className="btn-link" onClick={() => void signOut()}>
          {session?.kind === 'user' ? '로그아웃' : '로그인'}
        </button>
      </div>
      <nav className="menu-list" aria-label="메인 메뉴">
        {MENU.map((item) => (
          <button key={item.id} type="button" className="btn menu-button" onClick={() => onSelect(item.id)}>
            {item.label}
          </button>
        ))}
      </nav>
    </Page>
  );
}
