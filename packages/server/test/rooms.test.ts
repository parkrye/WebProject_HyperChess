import { fromAlgebraic as sq, IllegalActionError } from '@hyperchess/engine';
import { describe, expect, it } from 'vitest';
import { RoomError, RoomManager } from '../src/rooms';

const move = (from: string, to: string) => ({ type: 'move' as const, move: { from: sq(from), to: sq(to) } });

function setupRoom(manager = new RoomManager()) {
  const host = manager.create('s1', { name: '호스트', abilityId: 'haste', color: 'w' });
  const guest = manager.join('s2', { code: host.code.toLowerCase(), name: '게스트', abilityId: 'rewind' });
  return { manager, host, guest };
}

describe('RoomManager', () => {
  it('두 명이 모이면 각자의 능력으로 게임이 시작된다', () => {
    const { manager, host, guest } = setupRoom();
    expect(guest.color).toBe('b');
    const snapshot = manager.snapshot(host.code);
    expect(snapshot.status).toBe('playing');
    expect(snapshot.game?.players.w.abilityId).toBe('haste');
    expect(snapshot.game?.players.b.abilityId).toBe('rewind');
  });

  it('무작위 선택은 게임 시작 시 결정되고, 재대결마다 새로 뽑는다', () => {
    let roll = 0;
    const manager = new RoomManager({ random: () => [0.05, 0.95, 0.5, 0.2][roll++ % 4] });
    const host = manager.create('s1', { name: 'a', abilityId: 'random', color: 'w' });
    expect(manager.snapshot(host.code).seats.w).toMatchObject({ abilityId: 'random', randomized: true });

    manager.join('s2', { code: host.code, name: 'b', abilityId: 'haste' });
    const first = manager.snapshot(host.code);
    expect(first.seats.w?.randomized).toBe(true);
    expect(first.seats.w?.abilityId).not.toBe('random');
    expect(first.game?.players.w.abilityId).toBe(first.seats.w?.abilityId);
    expect(first.seats.b).toMatchObject({ abilityId: 'haste', randomized: false });

    manager.resign('s2');
    manager.voteRematch('s1');
    manager.voteRematch('s2');
    const second = manager.snapshot(host.code);
    // 재대결에서 색이 바뀌어 무작위 좌석은 흑
    expect(second.seats.b?.randomized).toBe(true);
    expect(second.game?.players.b.abilityId).toBe(second.seats.b?.abilityId);
  });

  it('세 번째 참가자와 존재하지 않는 능력은 거부된다', () => {
    const { manager, host } = setupRoom();
    expect(() => manager.join('s3', { code: host.code, name: 'x', abilityId: 'haste' })).toThrow(RoomError);
    expect(() => manager.create('s4', { name: 'x', abilityId: 'nope', color: 'w' })).toThrow(RoomError);
  });

  it('자기 차례에만, 합법적인 수만 둘 수 있다', () => {
    const { manager, host } = setupRoom();
    expect(() => manager.act('s2', move('e7', 'e5'))).toThrow('상대 차례입니다');
    expect(() => manager.act('s1', move('e2', 'e5'))).toThrow(IllegalActionError);
    manager.act('s1', move('e2', 'e4'));
    expect(manager.snapshot(host.code).game?.turn).toBe('b');
  });

  it('연결이 끊겨도 토큰으로 같은 좌석에 재접속한다', () => {
    const { manager, host } = setupRoom();
    manager.disconnect('s1');
    expect(manager.snapshot(host.code).seats.w?.connected).toBe(false);
    const resumed = manager.resume('s9', { code: host.code, token: host.token });
    expect(resumed.color).toBe('w');
    manager.act('s9', move('e2', 'e4'));
    expect(() => manager.resume('s8', { code: host.code, token: 'wrong' })).toThrow(RoomError);
  });

  it('대국 중 퇴장은 기권이고, 양쪽 재대결 동의 시 색을 바꿔 새 게임', () => {
    const { manager, host } = setupRoom();
    manager.resign('s2');
    expect(manager.snapshot(host.code).status).toBe('finished');

    manager.voteRematch('s1');
    expect(manager.snapshot(host.code).rematchVotes).toEqual(['w']);
    manager.voteRematch('s2');

    const snapshot = manager.snapshot(host.code);
    expect(snapshot.status).toBe('playing');
    expect(snapshot.seats.w?.name).toBe('게스트');
    expect(manager.connectedSeats(host.code)).toEqual([
      { socketId: 's2', color: 'w' },
      { socketId: 's1', color: 'b' },
    ]);
  });

  it('차례 시간을 넘기면 시간 초과로 패배하고, 서버 시각이 스냅샷에 담긴다', () => {
    let now = 1_000;
    const manager = new RoomManager({ now: () => now });
    const { host } = setupRoom(manager);
    expect(manager.snapshot(host.code).serverTime).toBe(1_000);
    expect(manager.clockDeadline(host.code)).toBe(1_000 + 120_000);

    now = 60_000;
    manager.act('s1', move('e2', 'e4'));
    expect(manager.clockDeadline(host.code)).toBe(60_000 + 120_000);

    now = 179_999;
    expect(manager.expireClock(host.code)).toBe(false);
    now = 180_000;
    expect(manager.expireClock(host.code)).toBe(true);
    expect(manager.snapshot(host.code).game?.result).toEqual({ kind: 'win', winner: 'w', reason: 'timeout' });
    expect(manager.clockDeadline(host.code)).toBeNull();
  });

  it('모두 떠난 방은 유휴 시간이 지나면 정리된다', () => {
    let now = 0;
    const manager = new RoomManager({ now: () => now });
    const { host } = setupRoom(manager);
    manager.disconnect('s1');
    manager.disconnect('s2');
    now = 5000;
    expect(manager.sweep(10000)).toEqual([]);
    now = 20000;
    expect(manager.sweep(10000)).toEqual([host.code]);
    expect(manager.roomCount).toBe(0);
  });

  it('대기 중 방장이 나가면 방이 사라진다', () => {
    const manager = new RoomManager();
    const host = manager.create('s1', { name: 'a', abilityId: 'haste', color: 'random' });
    manager.leave('s1');
    expect(() => manager.snapshot(host.code)).toThrow(RoomError);
  });

  it('대국이 끝나면 onGameEnd를 한 번만 알린다', () => {
    const ended: string[] = [];
    const { manager } = setupRoom(new RoomManager({ onGameEnd: (game) => ended.push(game.result.kind) }));
    manager.resign('s2');
    manager.leave('s1');
    expect(ended).toEqual(['win']);
  });
});
