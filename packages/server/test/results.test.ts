import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseGameRecord, ResultStore } from '../src/results';

const valid = {
  source: 'arena',
  balanceVersion: 14,
  abilities: { w: 'haste', b: null },
  winner: 'w',
  reason: 'checkmate',
  plies: 42,
  difficulty: { w: 'normal', b: 'hard' },
};

describe('parseGameRecord', () => {
  it('올바른 기록을 받아들인다', () => {
    expect(parseGameRecord(valid)).toEqual(valid);
    expect(parseGameRecord({ ...valid, winner: null, reason: 'threefold' })?.winner).toBeNull();
  });

  it('잘못된 출처·능력·승자·난이도는 거부한다', () => {
    expect(parseGameRecord({ ...valid, source: 'online' })).toBeNull();
    expect(parseGameRecord({ ...valid, abilities: { w: 'nope', b: null } })).toBeNull();
    expect(parseGameRecord({ ...valid, winner: 'x' })).toBeNull();
    expect(parseGameRecord({ ...valid, difficulty: { w: 'godlike' } })).toBeNull();
    expect(parseGameRecord('text')).toBeNull();
  });
});

describe('ResultStore', () => {
  it('기록을 파일에 추가하고 다시 읽는다', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'hc-results-')), 'nested', 'results.jsonl');
    const store = new ResultStore(file, { now: () => 1000 });
    store.add(parseGameRecord(valid)!);
    store.add(parseGameRecord({ ...valid, winner: 'b' })!);

    expect(readFileSync(file, 'utf8').trim().split('\n')).toHaveLength(2);
    const reloaded = new ResultStore(file).all();
    expect(reloaded.map((r) => r.winner)).toEqual(['w', 'b']);
    expect(reloaded[0].playedAt).toBe(1000);
  });
});
