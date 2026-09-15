import type { GameRecord } from '@hyperchess/protocol';
import { describe, expect, it } from 'vitest';
import { computeStats } from '../src/stats';

const record = (w: string | null, b: string | null, winner: 'w' | 'b' | null, extra: Partial<GameRecord> = {}): GameRecord => ({
  source: 'simulation',
  balanceVersion: 14,
  abilities: { w, b },
  winner,
  reason: winner ? 'checkmate' : 'threefold',
  plies: 10,
  playedAt: 0,
  ...extra,
});

describe('computeStats', () => {
  const records = [
    record('haste', 'rewind', 'w'),
    record('rewind', 'haste', 'w'),
    record('haste', null, null),
    record('haste', 'haste', 'b'),
    record('haste', 'rewind', 'b', { source: 'online', balanceVersion: 13 }),
  ];

  it('능력별 승·무·패를 양쪽 입장에서 집계하고 같은 능력끼리는 제외한다', () => {
    const stats = computeStats(records);
    const haste = stats.abilities.find((a) => a.abilityId === 'haste');
    expect(haste).toEqual({ abilityId: 'haste', games: 4, wins: 1, draws: 1, losses: 2 });
    expect(stats.abilities.find((a) => a.abilityId === null)).toEqual({ abilityId: null, games: 1, wins: 0, draws: 1, losses: 0 });
    expect(stats.total).toBe(5);
    expect(stats.whiteWins).toBe(2);
    expect(stats.versions).toEqual([13, 14]);
  });

  it('출처·버전으로 거른다', () => {
    expect(computeStats(records, { sources: ['online'] }).total).toBe(1);
    const v14 = computeStats(records, { version: 14 });
    expect(v14.total).toBe(4);
    const matchup = v14.matchups.find((m) => m.abilityId === 'rewind' && m.opponentId === 'haste');
    expect(matchup).toEqual({ abilityId: 'rewind', opponentId: 'haste', games: 2, wins: 1, draws: 0 });
  });
});
