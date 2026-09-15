import type { CategorySummary, StatsCategory } from '@hyperchess/protocol';
import { useEffect, useState } from 'react';
import { useBgm } from '../audio/bgm';
import { Page } from '../components/Page';

const CATEGORY_LABEL: Readonly<Record<StatsCategory, string>> = {
  all: '전체',
  versus: '대전',
  ai: 'AI 대전',
  arena: 'AI 내전',
};

type SummaryState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; rows: CategorySummary[] };

const rate = (count: number, games: number) => (games === 0 ? '-' : `${Math.round((count / games) * 100)}%`);

export function StatsScreen({ onBack }: { onBack: () => void }) {
  const [state, setState] = useState<SummaryState>({ status: 'loading' });
  useBgm('title');

  useEffect(() => {
    const controller = new AbortController();
    const load = async () => {
      try {
        const response = await fetch('/api/stats/summary', { signal: controller.signal, cache: 'no-store' });
        if (!response.ok) throw new Error(String(response.status));
        setState({ status: 'ready', rows: (await response.json()) as CategorySummary[] });
      } catch {
        if (!controller.signal.aborted) setState({ status: 'error' });
      }
    };
    void load();
    return () => controller.abort();
  }, []);

  return (
    <Page title="통계" onBack={onBack}>
      {state.status === 'error' && <p className="notice notice-error">서버에 연결할 수 없어요</p>}
      {/* 불러오기 전에도 같은 표 모양을 유지한다 */}
      <div className="table-card">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">분류</th>
              <th scope="col">판 수</th>
              <th scope="col">백 승</th>
              <th scope="col">흑 승</th>
              <th scope="col">무승부</th>
            </tr>
          </thead>
          <tbody>
            {(Object.keys(CATEGORY_LABEL) as StatsCategory[]).map((category) => {
              const row = state.status === 'ready' ? state.rows.find((r) => r.category === category) : undefined;
              return (
                <tr key={category}>
                  <th scope="row">{CATEGORY_LABEL[category]}</th>
                  <td>{row ? row.games.toLocaleString() : '-'}</td>
                  <td>{row ? rate(row.whiteWins, row.games) : '-'}</td>
                  <td>{row ? rate(row.blackWins, row.games) : '-'}</td>
                  <td>{row ? rate(row.draws, row.games) : '-'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Page>
  );
}
