import type { AuthRequest, AuthResponse, PublicUser, RankingEntry } from '@hyperchess/protocol';

/** 서버 응답 오류 (status 0은 네트워크 오류) */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (init.token) headers.Authorization = `Bearer ${init.token}`;

  let response: Response;
  try {
    response = await fetch(path, { ...init, headers, cache: 'no-store' });
  } catch {
    throw new ApiError(0, '서버에 연결할 수 없어요');
  }
  const body = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok) throw new ApiError(response.status, body?.error ?? '요청을 처리하지 못했어요');
  return body as T;
}

export const registerUser = (req: AuthRequest) => request<AuthResponse>('/api/auth/register', { method: 'POST', body: JSON.stringify(req) });
export const loginUser = (req: AuthRequest) => request<AuthResponse>('/api/auth/login', { method: 'POST', body: JSON.stringify(req) });
export const logoutUser = (token: string) => request<unknown>('/api/auth/logout', { method: 'POST', token, body: '{}' });
export const fetchMe = (token: string) => request<PublicUser>('/api/auth/me', { token });
export const fetchRanking = () => request<RankingEntry[]>('/api/ranking');
