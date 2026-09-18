import { listAbilities } from '@hyperchess/engine';
import type { AbilityStat, CategorySummary, StatsCategory } from '@hyperchess/protocol';
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

/** 능력별 표에서 고를 수 있는 정렬 기준 */
type SortKey = 'name' | 'games' | 'wins' | 'draws' | 'losses' | 'rate';
type SortDir = 'asc' | 'desc';

const COLUMNS: readonly { readonly key: SortKey; readonly label: string; readonly defaultDir: SortDir }[] = [
  { key: 'name', label: '능력', defaultDir: 'asc' },
  { key: 'games', label: '판 수', defaultDir: 'desc' },
  { key: 'wins', label: '승', defaultDir: 'desc' },
  { key: 'draws', label: '무', defaultDir: 'desc' },
  { key: 'losses', label: '패', defaultDir: 'desc' },
  { key: 'rate', label: '승률', defaultDir: 'desc' },
];

interface AbilityRow {
  readonly id: string;
  readonly name: string;
  readonly stat: AbilityStat | undefined;
}

/** 기록이 없는 능력은 정렬 기준과 무관하게 항상 뒤로 보낸다 */
function compareRows(a: AbilityRow, b: AbilityRow, key: SortKey, dir: SortDir): number {
  if (key === 'name') return dir === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name);
  if (!a.stat || !b.stat) return a.stat ? -1 : b.stat ? 1 : 0;

  const value = (stat: AbilityStat) => (key === 'rate' ? (stat.games === 0 ? -1 : stat.wins / stat.games) : stat[key]);
  const diff = value(a.stat) - value(b.stat);
  if (diff !== 0) return dir === 'asc' ? diff : -diff;
  return a.name.localeCompare(b.name);
}

/** 능력별 전적. 정렬하지 않으면 기록이 없어도 모든 능력을 같은 순서로 보여 줘 분류를 바꿔도 표가 흔들리지 않는다 */
function AbilityTable({ summary }: { summary: CategorySummary | undefined }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir } | null>(null);
  const stats = new Map(summary?.abilities.map((a) => [a.abilityId, a]));
  const rows: AbilityRow[] = listAbilities().map((ability) => ({ id: ability.id, name: ability.name, stat: stats.get(ability.id) }));
  if (sort) rows.sort((a, b) => compareRows(a, b, sort.key, sort.dir));

  const toggle = (key: SortKey, defaultDir: SortDir) =>
    setSort((prev) => (prev?.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: defaultDir }));

  return (
    <div className="table-card">
      <table className="data-table">
        <thead>
          <tr>
            {COLUMNS.map(({ key, label, defaultDir }) => {
              const active = sort?.key === key ? sort.dir : null;
              return (
                <th key={key} scope="col" aria-sort={active === 'asc' ? 'ascending' : active === 'desc' ? 'descending' : 'none'}>
                  <button type="button" className={`sort-button ${active ? 'active' : ''}`} onClick={() => toggle(key, defaultDir)}>
                    {label}
                    <span className="sort-arrow" aria-hidden>
                      {active === 'asc' ? '▲' : active === 'desc' ? '▼' : '↕'}
                    </span>
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ id, name, stat }) => (
            <tr key={id}>
              <th scope="row">
                <span className="stats-ability">
                  <AbilityIconView icon={abilityUi(id).icon} size={20} />
                  {name}
                </span>
              </th>
              <td>{stat ? stat.games.toLocaleString() : '-'}</td>
              <td>{stat ? stat.wins : '-'}</td>
              <td>{stat ? stat.draws : '-'}</td>
              <td>{stat ? stat.losses : '-'}</td>
              <td>{stat ? percent(stat.wins, stat.games) : '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
