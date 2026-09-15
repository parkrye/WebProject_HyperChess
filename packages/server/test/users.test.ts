import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { expectedScore, nextRating } from '../src/elo';
import { RoomManager } from '../src/rooms';
import { UserError, UserStore } from '../src/users';

const tempFile = () => join(mkdtempSync(join(tmpdir(), 'hc-users-')), 'users.json');

describe('elo', () => {
  it('같은 레이팅이면 기대 점수 0.5, 승리 시 K/2만큼 오른다', () => {
    expect(expectedScore(1000, 1000)).toBe(0.5);
    expect(nextRating(1000, 1000, 1)).toBe(1016);
    expect(nextRating(1000, 1000, 0)).toBe(984);
    expect(nextRating(1200, 1000, 0.5)).toBeLessThan(1200);
  });
});

describe('UserStore', () => {
  it('가입·로그인·세션 확인·로그아웃', async () => {
    const store = new UserStore(tempFile());
    const { token, user } = await store.register('기사_1', 'secret');
    expect(user).toMatchObject({ nickname: '기사_1', rating: 1000, games: 0 });
    expect(store.authenticate(token)?.id).toBe(user.id);

    const second = await store.login('기사_1', 'secret');
    expect(second.token).not.toBe(token);
    store.logout(token);
    expect(store.authenticate(token)).toBeNull();
    expect(store.authenticate(second.token)?.nickname).toBe('기사_1');
  });

  it('중복 닉네임(대소문자 무시)·짧은 비밀번호·틀린 비밀번호는 거부한다', async () => {
    const store = new UserStore(tempFile());
    await store.register('Knight', 'secret');
    await expect(store.register('knight', 'secret')).rejects.toMatchObject({ status: 409 });
    await expect(store.register('rook', '12')).rejects.toBeInstanceOf(UserError);
    await expect(store.register('a b', 'secret')).rejects.toMatchObject({ status: 400 });
    await expect(store.login('Knight', 'wrong')).rejects.toMatchObject({ status: 401 });
    await expect(store.login('nobody', 'secret')).rejects.toMatchObject({ status: 401 });
  });

  it('대국 결과로 레이팅·전적을 갱신하고, 게스트는 1000으로 계산한다. 파일에서 다시 읽힌다', async () => {
    const file = tempFile();
    const store = new UserStore(file);
    const a = (await store.register('alpha', 'secret')).user;
    const b = (await store.register('bravo', 'secret')).user;

    store.applyGame({ w: a.id, b: b.id }, 'w');
    store.applyGame({ w: null, b: b.id }, null);

    const reloaded = new UserStore(file);
    const ranking = reloaded.ranking();
    expect(ranking.map((r) => [r.rank, r.nickname, r.rating])).toEqual([
      [1, 'alpha', 1016],
      // 984에서 게스트(1000)와 비기면 +1
      [2, 'bravo', 985],
    ]);
    expect(ranking[1]).toMatchObject({ games: 2, losses: 1, draws: 1 });
  });
});

describe('RoomManager 유저 좌석', () => {
  it('로그인 유저는 닉네임과 레이팅으로 표시되고, 끝나면 좌석별 유저 id를 알린다', () => {
    const ended: Array<Record<string, string | null>> = [];
    const manager = new RoomManager({ ratingOf: () => 1234, onGameEnd: (_game, players) => ended.push(players) });
    const host = manager.create('s1', { name: '무시됨', abilityId: 'haste', color: 'w' }, { userId: 'u1', nickname: 'alpha' });
    manager.join('s2', { code: host.code, name: '손님', abilityId: 'rewind' });

    const { seats } = manager.snapshot(host.code);
    expect(seats.w).toMatchObject({ name: 'alpha', rating: 1234 });
    expect(seats.b).toMatchObject({ name: '손님', rating: null });

    manager.resign('s2');
    expect(ended).toEqual([{ w: 'u1', b: null }]);
  });

  it('같은 계정으로 양쪽 좌석에 앉을 수 없다', () => {
    const manager = new RoomManager();
    const identity = { userId: 'u1', nickname: 'alpha' };
    const host = manager.create('s1', { name: '', abilityId: 'haste', color: 'w' }, identity);
    expect(() => manager.join('s2', { code: host.code, name: '', abilityId: 'haste' }, identity)).toThrow('같은 계정');
  });
});
