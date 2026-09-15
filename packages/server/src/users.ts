import type { Color } from '@hyperchess/engine';
import {
  INITIAL_RATING,
  NICKNAME_MAX_LENGTH,
  NICKNAME_MIN_LENGTH,
  PASSWORD_MIN_LENGTH,
  type AuthResponse,
  type PublicUser,
  type RankingEntry,
} from '@hyperchess/protocol';
import { randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { promisify } from 'node:util';
import { nextRating } from './elo';

const scryptAsync = promisify(scrypt) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;
const KEY_LENGTH = 64;
const PASSWORD_MAX_LENGTH = 128;
const NICKNAME_PATTERN = /^[\p{L}\p{N}_-]+$/u;

export class UserError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

interface StoredUser {
  readonly id: string;
  readonly nickname: string;
  readonly salt: string;
  readonly passwordHash: string;
  readonly createdAt: number;
  rating: number;
  games: number;
  wins: number;
  draws: number;
  losses: number;
}

interface UserData {
  users: StoredUser[];
  /** 세션 토큰 → 유저 id */
  sessions: Record<string, string>;
}

const nicknameKey = (nickname: string) => nickname.trim().toLowerCase();

export const toPublicUser = ({ id, nickname, rating, games, wins, draws, losses }: StoredUser): PublicUser => ({
  id,
  nickname,
  rating,
  games,
  wins,
  draws,
  losses,
});

async function hashPassword(password: string, salt: Buffer): Promise<Buffer> {
  return scryptAsync(password, salt, KEY_LENGTH);
}

/** 간이 유저 DB: JSON 파일 하나에 유저와 세션을 저장한다 */
export class UserStore {
  private readonly data: UserData;

  constructor(
    private readonly filePath: string,
    private readonly now: () => number = Date.now,
  ) {
    this.data = existsSync(filePath) ? (JSON.parse(readFileSync(filePath, 'utf8')) as UserData) : { users: [], sessions: {} };
  }

  async register(rawNickname: unknown, rawPassword: unknown): Promise<AuthResponse> {
    const nickname = String(rawNickname ?? '').trim();
    const password = String(rawPassword ?? '');
    if (nickname.length < NICKNAME_MIN_LENGTH || nickname.length > NICKNAME_MAX_LENGTH) {
      throw new UserError(`닉네임은 ${NICKNAME_MIN_LENGTH}~${NICKNAME_MAX_LENGTH}자여야 합니다`, 400);
    }
    if (!NICKNAME_PATTERN.test(nickname)) throw new UserError('닉네임에는 글자·숫자·_·-만 쓸 수 있습니다', 400);
    if (password.length < PASSWORD_MIN_LENGTH || password.length > PASSWORD_MAX_LENGTH) {
      throw new UserError(`비밀번호는 ${PASSWORD_MIN_LENGTH}자 이상이어야 합니다`, 400);
    }
    if (this.findByNickname(nickname)) throw new UserError('이미 사용 중인 닉네임입니다', 409);

    const salt = randomBytes(16);
    const hash = await hashPassword(password, salt);
    // 해싱을 기다리는 사이 같은 닉네임이 먼저 가입했을 수 있다
    if (this.findByNickname(nickname)) throw new UserError('이미 사용 중인 닉네임입니다', 409);

    const user: StoredUser = {
      id: randomUUID(),
      nickname,
      salt: salt.toString('base64'),
      passwordHash: hash.toString('base64'),
      createdAt: this.now(),
      rating: INITIAL_RATING,
      games: 0,
      wins: 0,
      draws: 0,
      losses: 0,
    };
    this.data.users.push(user);
    return this.startSession(user);
  }

  async login(rawNickname: unknown, rawPassword: unknown): Promise<AuthResponse> {
    const user = this.findByNickname(String(rawNickname ?? ''));
    const password = String(rawPassword ?? '').slice(0, PASSWORD_MAX_LENGTH);
    const invalid = new UserError('닉네임 또는 비밀번호가 올바르지 않습니다', 401);
    if (!user) {
      // 없는 닉네임도 비슷한 시간이 걸리게 한다
      await hashPassword(password, randomBytes(16));
      throw invalid;
    }
    const hash = await hashPassword(password, Buffer.from(user.salt, 'base64'));
    if (!timingSafeEqual(hash, Buffer.from(user.passwordHash, 'base64'))) throw invalid;
    return this.startSession(user);
  }

  logout(token: string) {
    if (!(token in this.data.sessions)) return;
    delete this.data.sessions[token];
    this.save();
  }

  /** 세션 토큰의 유저. 없거나 만료되었으면 null */
  authenticate(token: unknown): PublicUser | null {
    if (typeof token !== 'string' || !token) return null;
    const userId = this.data.sessions[token];
    const user = userId ? this.findById(userId) : undefined;
    return user ? toPublicUser(user) : null;
  }

  ratingOf(userId: string): number | null {
    return this.findById(userId)?.rating ?? null;
  }

  /** 온라인 대국 결과를 레이팅·전적에 반영한다. 게스트는 고정 레이팅으로 계산하고 기록하지 않는다 */
  applyGame(players: Readonly<Record<Color, string | null>>, winner: Color | null) {
    const users = { w: players.w ? this.findById(players.w) : undefined, b: players.b ? this.findById(players.b) : undefined };
    if (!users.w && !users.b) return;
    const before = { w: users.w?.rating ?? INITIAL_RATING, b: users.b?.rating ?? INITIAL_RATING };

    for (const color of ['w', 'b'] as const) {
      const user = users[color];
      if (!user) continue;
      const opponent = color === 'w' ? 'b' : 'w';
      const score = winner === null ? 0.5 : winner === color ? 1 : 0;
      user.rating = nextRating(before[color], before[opponent], score);
      user.games += 1;
      if (score === 1) user.wins += 1;
      else if (score === 0) user.losses += 1;
      else user.draws += 1;
    }
    this.save();
  }

  /** 온라인 대국을 1판 이상 둔 유저의 레이팅 순위 */
  ranking(limit = 100): RankingEntry[] {
    return this.data.users
      .filter((u) => u.games > 0)
      .sort((a, b) => b.rating - a.rating || b.games - a.games)
      .slice(0, limit)
      .map((user, index) => ({ rank: index + 1, ...toPublicUser(user) }));
  }

  private startSession(user: StoredUser): AuthResponse {
    const token = randomBytes(32).toString('base64url');
    this.data.sessions[token] = user.id;
    this.save();
    return { token, user: toPublicUser(user) };
  }

  private findByNickname(nickname: string) {
    const key = nicknameKey(nickname);
    return this.data.users.find((u) => nicknameKey(u.nickname) === key);
  }

  private findById(id: string) {
    return this.data.users.find((u) => u.id === id);
  }

  /** 쓰는 도중 꺼져도 파일이 깨지지 않도록 임시 파일에 쓴 뒤 교체한다 */
  private save() {
    mkdirSync(dirname(this.filePath), { recursive: true });
    const temp = `${this.filePath}.tmp`;
    writeFileSync(temp, JSON.stringify(this.data, null, 2));
    renameSync(temp, this.filePath);
  }
}
