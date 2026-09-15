import type { Color, GameState } from '@hyperchess/engine';
import { BALANCE_VERSION, type GameRecordInput, type ResultSource } from '@hyperchess/protocol';

const PENDING_KEY = 'hyperchess.pendingResults';
const MAX_PENDING = 200;

/** 끝난 게임 상태에서 대국 기록을 만든다 (진행 중이면 null) */
export function toGameRecord(
  state: GameState,
  source: ResultSource,
  difficulty?: Partial<Record<Color, string>>,
): GameRecordInput | null {
  const { result } = state;
  if (result.kind === 'ongoing') return null;
  return {
    source,
    balanceVersion: BALANCE_VERSION,
    abilities: { w: state.players.w.abilityId, b: state.players.b.abilityId },
    winner: result.kind === 'win' ? result.winner : null,
    reason: result.reason,
    plies: state.log.length,
    ...(difficulty ? { difficulty } : {}),
  };
}

function readPending(): GameRecordInput[] {
  try {
    return JSON.parse(localStorage.getItem(PENDING_KEY) ?? '[]') as GameRecordInput[];
  } catch {
    return [];
  }
}

function writePending(records: readonly GameRecordInput[]) {
  try {
    if (records.length === 0) localStorage.removeItem(PENDING_KEY);
    else localStorage.setItem(PENDING_KEY, JSON.stringify(records.slice(-MAX_PENDING)));
  } catch {
    // 저장소를 쓸 수 없으면 버린다
  }
}

async function post(record: GameRecordInput): Promise<boolean> {
  try {
    const response = await fetch('/api/results', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record),
    });
    // 4xx는 다시 보내도 거부되므로 전송된 것으로 본다
    return response.ok || (response.status >= 400 && response.status < 500);
  } catch {
    return false;
  }
}

let sending: Promise<void> = Promise.resolve();

/** 대국 기록을 서버로 보낸다. 서버에 닿지 않으면 보관했다가 다음 전송 때 함께 보낸다 (순차 처리) */
export function reportResult(record: GameRecordInput): Promise<void> {
  sending = sending.then(() => send(record));
  return sending;
}

async function send(record: GameRecordInput): Promise<void> {
  const queue = [...readPending(), record];
  const failed: GameRecordInput[] = [];
  for (const item of queue) {
    if (failed.length > 0 || !(await post(item))) failed.push(item);
  }
  writePending(failed);
}
