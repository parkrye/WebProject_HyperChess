import { fromAlgebraic as sq, IllegalActionError, DRAFT_TIME_LIMIT_MS, kingOnlyPlacement, standardPlacement } from '@hyperchess/engine';
import { describe, expect, it } from 'vitest';
import { RoomError, RoomManager } from '../src/rooms';

const move = (from: string, to: string) => ({ type: 'move' as const, move: { from: sq(from), to: sq(to) } });

/** 방을 만들고 손님을 들인 뒤, 색·능력을 고르고 둘 다 준비해 시작한다 */
function setupRoom(manager = new RoomManager()) {
  const host = manager.create('s1', { name: '호스트' });
  const guest = manager.join('s2', { code: host.code.toLowerCase(), name: '게스트' });
  manager.setColor('s1', 'w');
  manager.setAbility('s1', 'haste');
  manager.setAbility('s2', 'rewind');
  manager.setReady('s1', true);
  manager.setReady('s2', true);
  return { manager, host, guest };
}

describe('RoomManager', () => {
  it('둘 다 준비해야 각자의 능력으로 게임이 시작된다', () => {
    const manager = new RoomManager();
    const host = manager.create('s1', { name: '호스트' });
    manager.join('s2', { code: host.code, name: '게스트' });
    expect(manager.snapshot(host.code).status).toBe('waiting');

    manager.setColor('s1', 'w');
    manager.setAbility('s1', 'haste');
    manager.setAbility('s2', 'rewind');
    manager.setReady('s1', true);
    expect(manager.snapshot(host.code).status).toBe('waiting');

    manager.setReady('s2', true);
    const snapshot = manager.snapshot(host.code);
    expect(snapshot.status).toBe('playing');
    expect(snapshot.game?.players.w.abilityId).toBe('haste');
    expect(snapshot.game?.players.b.abilityId).toBe('rewind');
    // 시작하면서 준비는 풀린다
    expect(snapshot.seats.b?.ready).toBe(false);
  });

  it('준비한 뒤에는 색과 능력을 바꿀 수 없다', () => {
    const manager = new RoomManager();
    const host = manager.create('s1', { name: '호스트' });
    manager.join('s2', { code: host.code, name: '게스트' });

    manager.setReady('s2', true);
    expect(() => manager.setAbility('s2', 'haste')).toThrow('준비를 취소한 뒤');
    expect(() => manager.setColor('s2', 'b')).toThrow('준비를 취소한 뒤');
    manager.setReady('s2', false);
    manager.setAbility('s2', 'haste');
    expect(manager.snapshot(host.code).seats.b).toMatchObject({ abilityId: 'haste', colorChoice: 'random' });
  });

  it('한쪽만 색을 고르면 그대로 주고, 고른 능력이 자리를 따라간다', () => {
    const manager = new RoomManager();
    const host = manager.create('s1', { name: '호스트' });
    manager.join('s2', { code: host.code, name: '게스트' });
    manager.setAbility('s1', 'haste');
    manager.setColor('s1', 'b');
    manager.setReady('s1', true);
    manager.setReady('s2', true);

    const snapshot = manager.snapshot(host.code);
    expect(snapshot.seats.b?.name).toBe('호스트');
    expect(snapshot.seats.w?.name).toBe('게스트');
    expect(snapshot.seats.b?.abilityId).toBe('haste');
    expect(snapshot.game?.players.b.abilityId).toBe('haste');
  });

  it('상대가 무작위를 고르면 남은 색을 가져간다', () => {
    const manager = new RoomManager();
    const host = manager.create('s1', { name: '호스트' });
    manager.join('s2', { code: host.code, name: '게스트' });
    manager.setColor('s2', 'w');
    manager.setReady('s1', true);
    manager.setReady('s2', true);
    expect(manager.snapshot(host.code).seats.w?.name).toBe('게스트');
  });

  it('둘이 같은 색을 고르면 무작위로 가른다', () => {
    // random 은 능력 추첨에도 쓰이므로 색을 정하는 첫 호출만 본다
    const manager = new RoomManager({ random: () => 0.9 });
    const host = manager.create('s1', { name: '호스트' });
    manager.join('s2', { code: host.code, name: '게스트' });
    manager.setColor('s1', 'b');
    manager.setColor('s2', 'b');
    manager.setReady('s1', true);
    manager.setReady('s2', true);
    // 0.9 >= 0.5 이므로 뒤 자리(게스트)가 백이 된다
    expect(manager.snapshot(host.code).seats.w?.name).toBe('게스트');
  });

  it('무작위 선택은 게임 시작 시 결정되고, 재대결마다 새로 뽑는다', () => {
    let roll = 0;
    const manager = new RoomManager({ random: () => [0.05, 0.95, 0.5, 0.2][roll++ % 4] });
    const host = manager.create('s1', { name: 'a' });
    expect(manager.snapshot(host.code).seats.w).toMatchObject({ abilityId: 'random', randomized: true });

    manager.join('s2', { code: host.code, name: 'b' });
    manager.setColor('s1', 'w');
    manager.setAbility('s2', 'haste');
    manager.setReady('s1', true);
    manager.setReady('s2', true);
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

  it('말 변동 없이 오래 끌면 무승부 제안이 뜨고, 양쪽 답으로 결정된다', () => {
    const { manager, host } = setupRoom();
    // 폰만 한 칸씩 밀어 말 변동 없이 30수를 채운다 (같은 국면이 반복되지 않는다)
    const pushes = [
      ...[...'abcdefgh'].flatMap((file) => [move(`${file}2`, `${file}3`), move(`${file}7`, `${file}6`)]),
      ...[...'abcdefgh'].flatMap((file) => [move(`${file}3`, `${file}4`), move(`${file}6`, `${file}5`)]),
    ];
    for (let ply = 0; ply < 30; ply++) manager.act(ply % 2 === 0 ? 's1' : 's2', pushes[ply]);

    const offered = manager.snapshot(host.code).game;
    expect(offered?.draw.quietPlies).toBe(30);
    expect(offered?.draw.offer?.votes).toEqual({});
    // 답하기 전에는 수를 둘 수 없고 시계도 멈춘다
    expect(() => manager.act('s1', pushes[30])).toThrow(IllegalActionError);
    expect(manager.clockDeadline(host.code)).toBeNull();

    manager.voteDraw('s1', 'decline');
    expect(() => manager.voteDraw('s1', 'accept')).toThrow(RoomError);
    manager.voteDraw('s2', 'accept');
    // 답이 엇갈리면 대국이 이어진다
    expect(manager.snapshot(host.code).status).toBe('playing');
    expect(manager.clockDeadline(host.code)).not.toBeNull();
    manager.act('s1', pushes[30]);

    expect(() => manager.voteDraw('s1', 'accept')).toThrow(RoomError);
  });

  it('양쪽이 가치 판정을 고르면 남은 말 가치로 끝난다', () => {
    const { manager, host } = setupRoom();
    const pushes = [
      ...[...'abcdefgh'].flatMap((file) => [move(`${file}2`, `${file}3`), move(`${file}7`, `${file}6`)]),
      ...[...'abcdefgh'].flatMap((file) => [move(`${file}3`, `${file}4`), move(`${file}6`, `${file}5`)]),
    ];
    for (let ply = 0; ply < 30; ply++) manager.act(ply % 2 === 0 ? 's1' : 's2', pushes[ply]);

    manager.voteDraw('s1', 'judge');
    manager.voteDraw('s2', 'judge');
    const snapshot = manager.snapshot(host.code);
    expect(snapshot.status).toBe('finished');
    // 양쪽 말이 그대로이므로 동점 무승부
    expect(snapshot.game?.result).toEqual({ kind: 'draw', reason: 'materialJudge' });
  });

  it('세 번째 참가자와 존재하지 않는 능력은 거부된다', () => {
    const { manager, host } = setupRoom();
    expect(() => manager.join('s3', { code: host.code, name: 'x' })).toThrow(RoomError);
    const other = manager.create('s4', { name: 'x' });
    expect(() => manager.setAbility('s4', 'nope')).toThrow(RoomError);
    expect(other.color).toBe('w');
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

  it('대기 중 혼자 남은 사람이 나가면 방이 사라진다', () => {
    const manager = new RoomManager();
    const host = manager.create('s1', { name: 'a' });
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

  it('대국 종료 시 그 게임에서 둔 수순을 함께 알리고, 재대결하면 새로 쌓는다', () => {
    const recorded: number[] = [];
    const { manager } = setupRoom(new RoomManager({ onGameEnd: (_game, _players, actions) => recorded.push(actions.length) }));
    manager.act('s1', move('e2', 'e4'));
    manager.act('s2', move('e7', 'e5'));
    manager.resign('s1');
    manager.voteRematch('s1');
    manager.voteRematch('s2');
    // 재대결에서는 색이 바뀌어 s2가 백
    manager.act('s2', move('d2', 'd4'));
    manager.resign('s1');
    expect(recorded).toEqual([2, 1]);
  });

  it('모드를 바꾸면 양쪽 준비가 풀린다', () => {
    const manager = new RoomManager();
    const host = manager.create('s1', { name: '호스트' });
    manager.join('s2', { code: host.code, name: '게스트' });
    manager.setReady('s2', true);
    manager.setMode('s1', { deployment: 'chaos', fog: true });
    const snapshot = manager.snapshot(host.code);
    expect(snapshot.mode).toEqual({ deployment: 'chaos', fog: true, secret: false, throne: false });
    expect(snapshot.seats.b?.ready).toBe(false);
    expect(() => manager.setMode('s1', { deployment: 'nope', fog: false })).toThrow('잘못된 모드');
  });

  it('징병전은 양쪽 편성을 받은 뒤 그 배치로 시작한다', () => {
    const manager = new RoomManager();
    const host = manager.create('s1', { name: '호스트' });
    manager.join('s2', { code: host.code, name: '게스트' });
    manager.setColor('s1', 'w');
    manager.setMode('s2', { deployment: 'draft', fog: false });
    manager.setReady('s1', true);
    manager.setReady('s2', true);
    expect(manager.snapshot(host.code).status).toBe('drafting');

    // 흑 자리에 백 편성을 내면 거부
    expect(() => manager.submitDraft('s2', standardPlacement('w'))).toThrow(RoomError);
    manager.submitDraft('s1', kingOnlyPlacement('w'));
    const waiting = manager.snapshot(host.code);
    expect(waiting.seats.w?.drafted).toBe(true);
    expect(waiting.game).toBeNull();
    expect(() => manager.submitDraft('s1', kingOnlyPlacement('w'))).toThrow('이미');

    manager.submitDraft('s2', standardPlacement('b'));
    const started = manager.snapshot(host.code);
    expect(started.status).toBe('playing');
    expect(started.game?.board.filter((p) => p?.color === 'w')).toHaveLength(1);
    expect(started.game?.startFen).toBe('rnbqkbnr/pppppppp/8/8/8/8/8/4K3 w kq - 0 1');
  });

  it('안개전은 받는 사람 시점으로 가린 상태를 보낸다', () => {
    const manager = new RoomManager();
    const host = manager.create('s1', { name: '호스트' });
    manager.join('s2', { code: host.code, name: '게스트' });
    manager.setColor('s1', 'w');
    manager.setMode('s1', { deployment: 'standard', fog: true });
    manager.setReady('s1', true);
    manager.setReady('s2', true);

    const white = manager.snapshot(host.code, 'w').game;
    expect(white?.fogView?.viewer).toBe('w');
    expect(white?.board.filter((p) => p?.color === 'b')).toHaveLength(0);
    expect(manager.snapshot(host.code).game).toBeNull();

    manager.resign('s2');
    expect(manager.snapshot(host.code, 'w').game?.board.filter((p) => p?.color === 'b')).toHaveLength(16);
  });

  it('비밀 능력은 대기실부터 상대 능력을 가리고, 대국이 끝나면 드러낸다', () => {
    const manager = new RoomManager();
    const host = manager.create('s1', { name: '호스트' });
    manager.join('s2', { code: host.code, name: '게스트' });
    manager.setColor('s1', 'w');
    manager.setAbility('s1', 'haste');
    manager.setAbility('s2', 'rewind');
    manager.setMode('s1', { deployment: 'standard', secret: true });
    expect(manager.snapshot(host.code, 'w').seats.b).toMatchObject({ abilityHidden: true, abilityId: 'random' });
    expect(manager.snapshot(host.code, 'b').seats.b).toMatchObject({ abilityHidden: false, abilityId: 'rewind' });

    manager.setReady('s1', true);
    manager.setReady('s2', true);
    const white = manager.snapshot(host.code, 'w');
    expect(white.game?.players.b.abilityId).toBeNull();
    expect(white.game?.players.w.abilityId).toBe('haste');

    manager.resign('s2');
    expect(manager.snapshot(host.code, 'w').game?.players.b.abilityId).toBe('rewind');
    expect(manager.snapshot(host.code, 'w').seats.b?.abilityHidden).toBe(false);
  });

  it('편성 제한 시간이 지나면 안 낸 쪽을 표준 배치로 채워 시작한다', () => {
    let now = 1_000;
    const manager = new RoomManager({ now: () => now });
    const host = manager.create('s1', { name: '호스트' });
    manager.join('s2', { code: host.code, name: '게스트' });
    manager.setColor('s1', 'w');
    manager.setMode('s1', { deployment: 'draft' });
    manager.setReady('s1', true);
    manager.setReady('s2', true);
    expect(manager.snapshot(host.code).draftDeadline).toBe(1_000 + DRAFT_TIME_LIMIT_MS);
    manager.submitDraft('s1', kingOnlyPlacement('w'));

    now += DRAFT_TIME_LIMIT_MS;
    expect(manager.expireDraft(host.code)).toBe(false);
    now = manager.draftExpiry(host.code)!;
    expect(manager.expireDraft(host.code)).toBe(true);
    const started = manager.snapshot(host.code);
    expect(started.status).toBe('playing');
    expect(started.draftDeadline).toBeNull();
    expect(started.game?.board.filter((p) => p?.color === 'b')).toHaveLength(16);
  });
});
