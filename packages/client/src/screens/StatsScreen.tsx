import { BALANCE_VERSION, type AbilityStat, type ResultSource, type StatsResponse } from '@hyperchess/protocol';
import { useMemo, useState, type CSSProperties } from 'react';
import { abilityUi } from '../abilityUi/specs';
import { abilityName } from '../abilityUi/text';
import { useBgm } from '../audio/bgm';
import { AbilityIconView } from '../components/AbilityIconView';
import { Hero, ModeTabs, type GameMode } from '../components/ModeTabs';
import { useStats } from '../stats/useStats';

const SOURCES: readonly { id: ResultSource; label: string }[] = [
  { id: 'simulation', label: '시뮬레이션' },
  { id: 'arena', label: 'AI 내전' },
  { id: 'ai', label: 'AI 대전' },
  { id: 'local', label: '로컬 2인' },
  { id: 'online', label: '온라인' },
];

const NONE_LABEL = '능력 없음';
const nameOf = (id: string | null) => (id === null ? NONE_LABEL : abilityName(id));
const colorOf = (id: string | null) => (id === null ? '#8a8398' : abilityUi(id).color);

/** 점수율: 승 1, 무 0.5 */
const scoreRate = (wins: number, draws: number, games: number) => (games === 0 ? 0 : (wins + draws / 2) / games);
const percent = (value: number) => `${Math.round(value * 100)}%`;
/** 50%보다 높으면 파랑, 낮으면 빨강으로 차이만큼 진하게 */
const cellColor = (rate: number) => {
  const strength = Math.min(1, Math.abs(rate - 0.5) * 2.5) * 0.75;
  return rate >= 0.5 ? `rgb(79 140 255 / ${strength})` : `rgb(224 82 92 / ${strength})`;
};

export function StatsScreen({ onModeChange }: { onModeChange: (mode: GameMode) => void }) {
  const [sources, setSources] = useState<readonly ResultSource[]>([]);
  const [currentOnly, setCurrentOnly] = useState(false);
  const stats = useStats(sources, currentOnly ? BALANCE_VERSION : null);
  useBgm('title');

  const toggleSource = (id: ResultSource) =>
    setSources((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));

  return (
    <main className="setup stats">
      <Hero />
      <ModeTabs active="stats" onChange={onModeChange} />

      <div className="stats-filters">
        <div className="chip-row" role="group" aria-label="기록 출처">
          <button type="button" className={`chip ${sources.length === 0 ? 'active' : ''}`} aria-pressed={sources.length === 0} onClick={() => setSources([])}>
            전체
          </button>
          {SOURCES.map(({ id, label }) => (
            <button key={id} type="button" className={`chip ${sources.includes(id) ? 'active' : ''}`} aria-pressed={sources.includes(id)} onClick={() => toggleSource(id)}>
              {label}
            </button>
          ))}
        </div>
        <div className="segmented" role="radiogroup" aria-label="밸런스 버전">
          <button type="button" role="radio" aria-checked={!currentOnly} className={!currentOnly ? 'active' : ''} onClick={() => setCurrentOnly(false)}>
            전 버전 합산
          </button>
          <button type="button" role="radio" aria-checked={currentOnly} className={currentOnly ? 'active' : ''} onClick={() => setCurrentOnly(true)}>
            현재 v{BALANCE_VERSION}
          </button>
        </div>
      </div>

      {stats.status === 'loading' && <p className="notice">통계를 불러오는 중…</p>}
      {stats.status === 'error' && <p className="notice notice-error">서버에 연결할 수 없어 통계를 볼 수 없어요</p>}
      {stats.status === 'ready' && <StatsBody data={stats.data} />}
    </main>
  );
}

function StatsBody({ data }: { data: StatsResponse }) {
  const ranked = useMemo(
    () => [...data.abilities].sort((a, b) => scoreRate(b.wins, b.draws, b.games) - scoreRate(a.wins, a.draws, a.games)),
    [data.abilities],
  );

  if (data.total === 0) return <p className="notice">조건에 맞는 대국 기록이 없어요</p>;

  const decided = data.whiteWins + data.blackWins + data.draws;
  return (
    <>
      <section className="stats-summary">
        <strong>{data.total.toLocaleString()}판</strong>
        <span>
          {SOURCES.filter(({ id }) => data.bySource[id])
            .map(({ id, label }) => `${label} ${data.bySource[id]!.toLocaleString()}`)
            .join(' · ')}
        </span>
        <span>
          선공(백) 점수율 {percent(scoreRate(data.whiteWins, data.draws, decided))} · 무승부 {percent(data.draws / decided)}
        </span>
      </section>

      <section className="stats-card" aria-label="능력별 점수율">
        <h2>능력별 점수율</h2>
        <p className="stats-hint">같은 능력끼리의 대국은 제외 · 승 1점, 무 0.5점</p>
        <ol className="stats-ranking">
          {ranked.map((stat) => (
            <AbilityRow key={stat.abilityId ?? 'none'} stat={stat} />
          ))}
        </ol>
      </section>

      <MatchupMatrix data={data} order={ranked.map((s) => s.abilityId)} />
    </>
  );
}

function AbilityRow({ stat }: { stat: AbilityStat }) {
  const rate = scoreRate(stat.wins, stat.draws, stat.games);
  return (
    <li className="stats-row" style={{ '--ability-color': colorOf(stat.abilityId), '--rate': rate } as CSSProperties}>
      <span className="stats-name">
        {stat.abilityId && <AbilityIconView icon={abilityUi(stat.abilityId).icon} size={22} />}
        {nameOf(stat.abilityId)}
      </span>
      <span className="stats-bar" aria-hidden>
        <span className="stats-bar-fill" />
      </span>
      <strong className="stats-rate">{percent(rate)}</strong>
      <small className="stats-count">
        {stat.games}판 {stat.wins}승 {stat.draws}무 {stat.losses}패
      </small>
    </li>
  );
}

function MatchupMatrix({ data, order }: { data: StatsResponse; order: readonly (string | null)[] }) {
  const cells = useMemo(() => new Map(data.matchups.map((m) => [`${m.abilityId}|${m.opponentId}`, m])), [data.matchups]);

  return (
    <section className="stats-card" aria-label="대진별 점수율">
      <h2>대진별 점수율</h2>
      <p className="stats-hint">행 능력이 열 능력을 상대로 얻은 점수율 · 칸에 마우스를 올리면 판 수</p>
      <div className="stats-matrix-scroll">
        <table className="stats-matrix">
          <thead>
            <tr>
              <th />
              {order.map((col) => (
                <th key={col ?? 'none'} scope="col" title={nameOf(col)}>
                  {col ? <AbilityIconView icon={abilityUi(col).icon} size={20} /> : '–'}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {order.map((row) => (
              <tr key={row ?? 'none'}>
                <th scope="row">{nameOf(row)}</th>
                {order.map((col) => {
                  const cell = row === col ? undefined : cells.get(`${row}|${col}`);
                  if (!cell) return <td key={col ?? 'none'} className="stats-empty" />;
                  const rate = scoreRate(cell.wins, cell.draws, cell.games);
                  return (
                    <td
                      key={col ?? 'none'}
                      style={{ background: cellColor(rate) }}
                      title={`${nameOf(row)} vs ${nameOf(col)}: ${cell.games}판 ${cell.wins}승 ${cell.draws}무`}
                    >
                      {Math.round(rate * 100)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
