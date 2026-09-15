import { useSession } from '../auth/session';

/** 현재 계정 표시와 로그아웃(게스트는 계정 만들기) */
export function AccountBadge() {
  const { session, signOut } = useSession();
  if (!session) return null;

  const isUser = session.kind === 'user';
  return (
    <div className="account-badge">
      {isUser ? (
        <span>
          <strong>{session.user.nickname}</strong> · {session.user.rating}
        </span>
      ) : (
        <span>게스트</span>
      )}
      <button type="button" className="btn-link" onClick={() => void signOut()}>
        {isUser ? '로그아웃' : '계정 만들기·로그인'}
      </button>
    </div>
  );
}
