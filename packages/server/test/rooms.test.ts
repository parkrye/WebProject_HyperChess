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
});
