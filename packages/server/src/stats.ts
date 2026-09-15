import { STATS_CATEGORIES, type AbilityStat, type CategorySummary, type GameRecord, type MatchupStat, type ResultSource, type StatsResponse } from '@hyperchess/protocol';

export interface StatsFilter {
  /** 비어 있으면 전체 출처 */
  readonly sources?: readonly ResultSource[];
  /** 없으면 전 버전 합산 */
  readonly version?: number;
}

type Tally = { games: number; wins: number; draws: number; losses: number };
const emptyTally = (): Tally => ({ games: 0, wins: 0, draws: 0, losses: 0 });

const key = (abilityId: string | null) => abilityId ?? '';
const fromKey = (value: string) => (value === '' ? null : value);

function addOutcome(tally: Tally, outcome: 'win' | 'draw' | 'loss') {
  tally.games += 1;
  if (outcome === 'win') tally.wins += 1;
  else if (outcome === 'draw') tally.draws += 1;
  else tally.losses += 1;
}

/** 대국 기록을 능력별 · 대진별로 집계한다. 같은 능력끼리의 대국은 능력 승률에서 제외한다 */
export function computeStats(records: readonly GameRecord[], filter: StatsFilter = {}): StatsResponse {
  const sources = filter.sources?.length ? new Set(filter.sources) : null;
  const versions = new Set<number>();
  const bySource: Partial<Record<ResultSource, number>> = {};
  const abilities = new Map<string, Tally>();
  const matchups = new Map<string, Tally>();
  let total = 0;
  let whiteWins = 0;
  let blackWins = 0;
  let draws = 0;

  for (const record of records) {
    versions.add(record.balanceVersion);
    if (sources && !sources.has(record.source)) continue;
    if (filter.version !== undefined && record.balanceVersion !== filter.version) continue;

    total += 1;
    bySource[record.source] = (bySource[record.source] ?? 0) + 1;
    if (record.winner === 'w') whiteWins += 1;
    else if (record.winner === 'b') blackWins += 1;
    else draws += 1;

    const { w, b } = record.abilities;
    if (w === b) continue;
    const outcomeOf = (color: 'w' | 'b') => (record.winner === null ? 'draw' : record.winner === color ? 'win' : 'loss');
    for (const [self, other, color] of [
      [w, b, 'w'],
      [b, w, 'b'],
    ] as const) {
      const outcome = outcomeOf(color);
      addOutcome(getOrCreate(abilities, key(self)), outcome);
      addOutcome(getOrCreate(matchups, `${key(self)}|${key(other)}`), outcome);
    }
  }

  return {
    total,
    whiteWins,
    blackWins,
    draws,
    bySource,
    versions: [...versions].sort((a, b) => a - b),
    abilities: [...abilities].map(([id, t]): AbilityStat => ({ abilityId: fromKey(id), ...t })),
    matchups: [...matchups].map(([pair, t]): MatchupStat => {
      const [self, other] = pair.split('|');
      return { abilityId: fromKey(self), opponentId: fromKey(other), games: t.games, wins: t.wins, draws: t.draws };
    }),
  };
}

/** 분류별 판 수와 백·흑 승, 무승부 합계 (전 버전 합산) */
export function summarizeCategories(records: readonly GameRecord[]): CategorySummary[] {
  return STATS_CATEGORIES.map(({ id, sources }) => {
    const { total, whiteWins, blackWins, draws } = computeStats(records, { sources });
    return { category: id, games: total, whiteWins, blackWins, draws };
  });
}

function getOrCreate(map: Map<string, Tally>, id: string): Tally {
  let tally = map.get(id);
  if (!tally) {
    tally = emptyTally();
    map.set(id, tally);
  }
  return tally;
}
