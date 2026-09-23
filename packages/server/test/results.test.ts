import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fromAlgebraic as sq } from '@hyperchess/engine';
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

  it('수순은 규칙대로 재생될 때만 받아들인다', () => {
    const e2e4 = { type: 'move', move: { from: sq('e2'), to: sq('e4') } };
    const e7e5 = { type: 'move', move: { from: sq('e7'), to: sq('e5') } };
    expect(parseGameRecord({ ...valid, actions: [e2e4, e7e5] })?.actions).toEqual([e2e4, e7e5]);
    // 흑 차례에 백 폰을 다시 두는 잘못된 수순
    expect(parseGameRecord({ ...valid, actions: [e2e4, e2e4] })).toBeNull();
    expect(parseGameRecord({ ...valid, actions: [{ type: 'teleport' }] })).toBeNull();
    expect(parseGameRecord({ ...valid, actions: 'e2e4' })).toBeNull();
  });

  it('모드 대국은 기록된 시작 국면에서 재생한다', () => {
    // 퀸 하나와 킹만 둔 징병 배치: 표준 시작에서는 d1 퀸이 d4로 갈 수 없다
    const fen = '4k3/8/8/8/8/8/8/3QK3 w - - 0 1';
    const d1d4 = { type: 'move', move: { from: sq('d1'), to: sq('d4') } };
    const mode = { deployment: 'draft', fog: true };
    expect(parseGameRecord({ ...valid, mode, fen, actions: [d1d4] })?.fen).toBe(fen);
    expect(parseGameRecord({ ...valid, mode, actions: [d1d4] })).toBeNull();
    expect(parseGameRecord({ ...valid, mode: { deployment: 'nope', fog: false } })).toBeNull();
    expect(parseGameRecord({ ...valid, fen: 'garbage' })).toBeNull();
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
