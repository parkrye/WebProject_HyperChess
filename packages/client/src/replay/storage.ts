import type { Color, GameResult } from '@hyperchess/engine';
import type { ReplayData } from '@hyperchess/protocol';

const STORAGE_KEY = 'hyperchess:replays';
/** 오래된 것부터 지워 이만큼만 둔다 (localStorage 용량) */
export const MAX_REPLAYS = 30;

export type ReplaySource = 'local' | 'ai' | 'online';

export interface SavedReplay {
  readonly id: string;
  readonly savedAt: number;
  readonly source: ReplaySource;
  /** 자리 이름 (나·AI·상대 닉네임 등) */
  readonly names: Readonly<Record<Color, string>>;
  /** 이 기기에서 둔 색. 핫시트는 null */
  readonly viewer: Color | null;
  readonly result: GameResult;
  readonly data: ReplayData;
}

/** 이 기기에 저장한 리플레이 (최신순). 읽을 수 없으면 빈 목록 */
export function listReplays(): SavedReplay[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as SavedReplay[]) : [];
  } catch {
    return [];
  }
}

function writeReplays(replays: readonly SavedReplay[]): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(replays));
    return true;
  } catch {
    return false;
  }
}

/** 저장에 성공하면 저장된 항목, 저장소를 쓸 수 없으면 null */
export function saveReplay(entry: Omit<SavedReplay, 'id' | 'savedAt'>): SavedReplay | null {
  const saved: SavedReplay = { ...entry, id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, savedAt: Date.now() };
  return writeReplays([saved, ...listReplays()].slice(0, MAX_REPLAYS)) ? saved : null;
}

export function deleteReplay(id: string): void {
  writeReplays(listReplays().filter((replay) => replay.id !== id));
}

export const findReplay = (id: string): SavedReplay | null => listReplays().find((replay) => replay.id === id) ?? null;
