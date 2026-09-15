import { NICKNAME_MAX_LENGTH, NICKNAME_MIN_LENGTH, PASSWORD_MIN_LENGTH } from '@hyperchess/protocol';
import { useState, type FormEvent } from 'react';
import { useBgm } from '../audio/bgm';
import { loginUser, registerUser } from '../auth/api';
import { useSession } from '../auth/session';
import { Hero } from '../components/ModeTabs';

type Tab = 'register' | 'login';

/** 처음 실행하면 게스트 · 새 계정 · 로그인 중 하나로 시작한다 */
export function WelcomeScreen() {
  const { startAsGuest, signIn } = useSession();
  const [tab, setTab] = useState<Tab>('register');
  const [nickname, setNickname] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  useBgm('title');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);
    try {
      const auth = await (tab === 'register' ? registerUser : loginUser)({ nickname, password });
      signIn(auth);
    } catch (e) {
      setError(e instanceof Error ? e.message : '요청을 처리하지 못했어요');
      setPending(false);
    }
  };

  return (
    <main className="setup welcome">
      <Hero />
      <section className="welcome-card">
        <div className="segmented" role="tablist" aria-label="계정">
          {(
            [
              ['register', '새 계정'],
              ['login', '로그인'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              className={tab === id ? 'active' : ''}
              onClick={() => {
                setTab(id);
                setError(null);
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <form className="welcome-form" onSubmit={submit}>
          <label className="field">
            <span>닉네임</span>
            <input
              value={nickname}
              minLength={NICKNAME_MIN_LENGTH}
              maxLength={NICKNAME_MAX_LENGTH}
              autoComplete="username"
              required
              onChange={(e) => setNickname(e.target.value)}
            />
          </label>
          <label className="field">
            <span>비밀번호</span>
            <input
              type="password"
              value={password}
              minLength={PASSWORD_MIN_LENGTH}
              autoComplete={tab === 'register' ? 'new-password' : 'current-password'}
              required
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <p className={`welcome-hint ${tab === 'register' ? '' : 'is-hidden'}`}>
            닉네임 {NICKNAME_MIN_LENGTH}~{NICKNAME_MAX_LENGTH}자(글자·숫자·_·-), 비밀번호 {PASSWORD_MIN_LENGTH}자 이상. 온라인 대국 결과가 랭킹에 반영됩니다.
          </p>
          <p className={`notice notice-error notice-slot ${error ? '' : 'is-empty'}`} role="alert">
            {error ?? '\u00a0'}
          </p>
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {pending ? '처리 중…' : tab === 'register' ? '가입하고 시작' : '로그인'}
          </button>
        </form>

        <div className="welcome-divider">또는</div>
        <button type="button" className="btn btn-ghost" onClick={startAsGuest}>
          게스트로 시작
        </button>
        <p className="welcome-hint">게스트의 대국도 통계에는 반영되지만 랭킹에는 오르지 않습니다.</p>
      </section>
    </main>
  );
}
