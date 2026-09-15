import type { RankingEntry } from '@hyperchess/protocol';
import { useEffect, useState } from 'react';
import { useBgm } from '../audio/bgm';
import { fetchRanking } from '../auth/api';
import { useSession } from '../auth/session';
import { Page } from '../components/Page';

type RankingState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; entries: RankingEntry[] };

export function RankingScreen({ onBack }: { onBack: () => void }) {
  const { session, refresh } = useSession();
  const [state, setState] = useState<RankingState>({ status: 'loading' });
  useBgm('title');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const entries = await fetchRanking();
        if (!cancelled) setState({ status: 'ready', entries });
      } catch (error) {
        if (!cancelled) setState({ status: 'error', message: error instanceof Error ? error.message : '랭킹을 불러오지 못했어요' });
      }
    };
    void load();
    void refresh();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const myId = session?.kind === 'user' ? session.user.id : null;

  return (
    <Page title="랭킹" onBack={onBack}>
      {state.status === 'error' && <p className="notice notice-error">{state.message}</p>}
      {state.status === 'ready' && state.entries.length === 0 && <p className="notice">기록이 없어요</p>}
      {state.status === 'ready' && state.entries.length > 0 && (
        <div className="table-card">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">순위</th>
                <th scope="col">닉네임</th>
                <th scope="col">레이팅</th>
              </tr>
            </thead>
            <tbody>
              {state.entries.map((entry) => (
                <tr key={entry.id} className={entry.id === myId ? 'is-me' : ''}>
                  <td>{entry.rank}</td>
                  <td>{entry.nickname}</td>
                  <td>{entry.rating}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Page>
  );
}
