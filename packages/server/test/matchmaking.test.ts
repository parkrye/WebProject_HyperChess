import { describe, expect, it } from 'vitest';
import { Matchmaker, type MatchTicket } from '../src/matchmaking';

const ticket = (socketId: string, userId?: string): MatchTicket => ({
  socketId,
  request: { name: socketId },
  identity: userId ? { userId, nickname: userId } : null,
});

describe('Matchmaker', () => {
  it('먼저 기다린 사람과 짝을 짓고 대기열에서 뺀다', () => {
    const matchmaker = new Matchmaker();
    expect(matchmaker.enqueue(ticket('a'))).toBeNull();
    expect(matchmaker.size).toBe(1);
    expect(matchmaker.enqueue(ticket('b'))?.socketId).toBe('a');
    expect(matchmaker.size).toBe(0);
  });

  it('순서대로 매칭한다', () => {
    const matchmaker = new Matchmaker();
    matchmaker.enqueue(ticket('a'));
    expect(matchmaker.enqueue(ticket('b'))?.socketId).toBe('a');
    matchmaker.enqueue(ticket('c'));
    expect(matchmaker.size).toBe(1);
    expect(matchmaker.enqueue(ticket('d'))?.socketId).toBe('c');
  });

  it('같은 소켓이 다시 요청하거나 같은 계정이면 짝이 되지 않는다', () => {
    const matchmaker = new Matchmaker();
    matchmaker.enqueue(ticket('a', 'u1'));
    expect(matchmaker.enqueue(ticket('a', 'u1'))).toBeNull();
    expect(matchmaker.size).toBe(1);
    expect(matchmaker.enqueue(ticket('b', 'u1'))).toBeNull();
    expect(matchmaker.enqueue(ticket('c'))?.socketId).toBe('a');
  });

  it('취소하면 대기열에서 빠진다', () => {
    const matchmaker = new Matchmaker();
    matchmaker.enqueue(ticket('a'));
    expect(matchmaker.cancel('a')).toBe(true);
    expect(matchmaker.cancel('a')).toBe(false);
    expect(matchmaker.enqueue(ticket('b'))).toBeNull();
  });
});
