import type { AuthResponse, PublicUser } from '@hyperchess/protocol';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ApiError, fetchMe, logoutUser } from './api';

const SESSION_KEY = 'hyperchess.session';

export type Session =
  | { readonly kind: 'guest' }
  | { readonly kind: 'user'; readonly token: string; readonly user: PublicUser };

interface SessionContextValue {
  /** null이면 아직 시작 방법을 고르지 않음 */
  readonly session: Session | null;
  readonly startAsGuest: () => void;
  readonly signIn: (auth: AuthResponse) => void;
  readonly signOut: () => Promise<void>;
  /** 서버에서 최신 레이팅·전적을 다시 받는다 */
  readonly refresh: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

function saveSession(session: Session | null) {
  try {
    if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    // 저장소를 못 쓰면 이번 실행 동안만 유지
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSessionState] = useState<Session | null>(loadSession);

  const setSession = useCallback((next: Session | null) => {
    saveSession(next);
    setSessionState(next);
  }, []);

  const token = session?.kind === 'user' ? session.token : null;

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const user = await fetchMe(token);
      setSession({ kind: 'user', token, user });
    } catch (error) {
      // 세션이 만료되면 시작 화면으로. 오프라인이면 저장된 정보로 계속한다
      if (error instanceof ApiError && error.status === 401) setSession(null);
    }
  }, [token, setSession]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<SessionContextValue>(
    () => ({
      session,
      startAsGuest: () => setSession({ kind: 'guest' }),
      signIn: (auth) => setSession({ kind: 'user', token: auth.token, user: auth.user }),
      signOut: async () => {
        if (token) await logoutUser(token).catch(() => undefined);
        setSession(null);
      },
      refresh,
    }),
    [session, token, setSession, refresh],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('SessionProvider가 필요합니다');
  return value;
}
