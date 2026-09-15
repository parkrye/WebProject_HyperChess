import type { RankingEntry } from '@hyperchess/protocol';
import { useEffect, useState } from 'react';
import { useBgm } from '../audio/bgm';
import { fetchRanking } from '../auth/api';
import { useSession } from '../auth/session';
import { Hero, ModeTabs, type GameMode } from '../components/ModeTabs';

type RankingState = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; entries: RankingEntry[] };

export function RankingScreen({ onModeChange }: { onModeChange: (mode: GameMode) => void }) {
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

  const me = session?.kind === 'user' ? session.user : null;

  return (
    <main className="setup ranking">
      <Hero />
      <ModeTabs active="ranking" onChange={onModeChange} />

      <p className="ranking-hint">
        온라인 대국 결과로 매기는 레이팅(Elo, 시작 1000)입니다. 게스트 상대는 1000으로 계산합니다.
        {me ? ` 내 레이팅 ${me.rating} · ${me.games}판 ${me.wins}승 ${me.draws}무 ${me.losses}패` : ' 게스트는 랭킹에 오르지 않아요.'}
      </p>

      {state.status === 'loading' && <p className="notice">랭킹을 불러오는 중…</p>}
      {state.status === 'error' && <p className="notice notice-error">{state.message}</p>}
      {state.status === 'ready' && state.entries.length === 0 && <p className="notice">아직 온라인 대국을 둔 유저가 없어요</p>}
      {state.status === 'ready' && state.entries.length > 0 && (
        <div className="stats-card ranking-card">
          <table className="ranking-table">
            <thead>
              <tr>
                <th scope="col">순위</th>
                <th scope="col">닉네임</th>
                <th scope="col">레이팅</th>
                <th scope="col">전적</th>
              </tr>
            </thead>
            <tbody>
              {state.entries.map((entry) => (
                <tr key={entry.id} className={entry.id === me?.id ? 'is-me' : ''}>
                  <td>{entry.rank}</td>
                  <td>{entry.nickname}</td>
                  <td>
                    <strong>{entry.rating}</strong>
                  </td>
                  <td>
                    {entry.games}판 {entry.wins}승 {entry.draws}무 {entry.losses}패
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
