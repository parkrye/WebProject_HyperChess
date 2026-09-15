import { NICKNAME_MAX_LENGTH, NICKNAME_MIN_LENGTH, PASSWORD_MIN_LENGTH } from '@hyperchess/protocol';
import { useState, type FormEvent } from 'react';
import { useBgm } from '../audio/bgm';
import { loginUser, registerUser } from '../auth/api';
import { useSession } from '../auth/session';
import { Page } from '../components/Page';

type Tab = 'login' | 'register';

interface WelcomeScreenProps {
  readonly onDone: () => void;
  readonly onBack: () => void;
}

/** 로그인 · 새 계정 · 게스트 중 하나로 시작한다 */
export function WelcomeScreen({ onDone, onBack }: WelcomeScreenProps) {
  const { startAsGuest, signIn } = useSession();
  const [tab, setTab] = useState<Tab>('login');
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
      signIn(await (tab === 'register' ? registerUser : loginUser)({ nickname, password }));
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : '요청을 처리하지 못했어요');
      setPending(false);
    }
  };

  const guest = () => {
    startAsGuest();
    onDone();
  };

  return (
    <Page onBack={onBack}>
      <section className="welcome-card">
        <div className="segmented" role="tablist" aria-label="계정">
          {(
            [
              ['login', '로그인'],
              ['register', '새 계정'],
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
          <p className={`notice notice-error notice-slot ${error ? '' : 'is-empty'}`} role="alert">
            {error ?? ' '}
          </p>
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {tab === 'register' ? '가입' : '로그인'}
          </button>
        </form>

        <button type="button" className="btn btn-ghost" onClick={guest}>
          게스트로 시작
        </button>
      </section>
    </Page>
  );
}
