import { listAbilities } from '@hyperchess/engine';
import type { CategorySummary, StatsCategory } from '@hyperchess/protocol';
import { useEffect, useState } from 'react';
import { abilityUi } from '../abilityUi/specs';
import { useBgm } from '../audio/bgm';
import { AbilityIconView } from '../components/AbilityIconView';
import { Page } from '../components/Page';

const CATEGORY_LABEL: Readonly<Record<StatsCategory, string>> = {
  all: '전체',
  versus: '대전',
  ai: 'AI 대전',
  arena: 'AI 내전',
};

type SummaryState = { status: 'loading' } | { status: 'error' } | { status: 'ready'; rows: CategorySummary[] };

const percent = (count: number, games: number) => (games === 0 ? '-' : `${Math.round((count / games) * 100)}%`);

export function StatsScreen({ onBack }: { onBack: () => void }) {
  const [state, setState] = useState<SummaryState>({ status: 'loading' });
  const [category, setCategory] = useState<StatsCategory>('all');
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

  const summary = state.status === 'ready' ? state.rows.find((r) => r.category === category) : undefined;

  return (
    <Page title="통계" onBack={onBack}>
      {state.status === 'error' && <p className="notice notice-error">서버에 연결할 수 없어요</p>}

      <div className="segmented stats-tabs" role="tablist" aria-label="분류">
        {(Object.keys(CATEGORY_LABEL) as StatsCategory[]).map((id) => (
          <button key={id} type="button" role="tab" aria-selected={category === id} className={category === id ? 'active' : ''} onClick={() => setCategory(id)}>
            {CATEGORY_LABEL[id]}
          </button>
        ))}
      </div>

      <div className="table-card">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">판 수</th>
              <th scope="col">백 승</th>
              <th scope="col">흑 승</th>
              <th scope="col">무승부</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{summary ? summary.games.toLocaleString() : '-'}</td>
              <td>{summary ? percent(summary.whiteWins, summary.games) : '-'}</td>
              <td>{summary ? percent(summary.blackWins, summary.games) : '-'}</td>
              <td>{summary ? percent(summary.draws, summary.games) : '-'}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <AbilityTable summary={summary} />
    </Page>
  );
}

/** 능력별 전적. 기록이 없어도 모든 능력을 같은 순서로 보여 줘 분류를 바꿔도 표가 흔들리지 않는다 */
function AbilityTable({ summary }: { summary: CategorySummary | undefined }) {
  const stats = new Map(summary?.abilities.map((a) => [a.abilityId, a]));
  return (
    <div className="table-card">
      <table className="data-table">
        <thead>
          <tr>
            <th scope="col">능력</th>
            <th scope="col">판 수</th>
            <th scope="col">승</th>
            <th scope="col">무</th>
            <th scope="col">패</th>
            <th scope="col">승률</th>
          </tr>
        </thead>
        <tbody>
          {listAbilities().map((ability) => {
            const stat = stats.get(ability.id);
            return (
              <tr key={ability.id}>
                <th scope="row">
                  <span className="stats-ability">
                    <AbilityIconView icon={abilityUi(ability.id).icon} size={20} />
                    {ability.name}
                  </span>
                </th>
                <td>{stat ? stat.games.toLocaleString() : '-'}</td>
                <td>{stat ? stat.wins : '-'}</td>
                <td>{stat ? stat.draws : '-'}</td>
                <td>{stat ? stat.losses : '-'}</td>
                <td>{stat ? percent(stat.wins, stat.games) : '-'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
