import { listAbilities, parseFen, type Deployment, type GameMode } from '@hyperchess/engine';
import { CLIENT_RESULT_SOURCES, MAX_RECORD_ACTIONS, type GameRecord, type GameRecordInput, type ResultSource } from '@hyperchess/protocol';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { isAction, isReplayable } from './actions';

const MAX_PLIES = 10_000;
const MAX_REASON_LENGTH = 32;
const DIFFICULTIES = new Set(['easy', 'normal', 'hard']);
const DEPLOYMENTS = new Set<Deployment>(['standard', 'draft', 'chaos']);
const MAX_FEN_LENGTH = 100;

const isColor = (value: unknown) => value === 'w' || value === 'b';
const isAbilityOrNone = (value: unknown) => value === null || (typeof value === 'string' && listAbilities().some((a) => a.id === value));

/** 외부에서 받은 대국 기록을 검증한다. 잘못된 값이면 null */
export function parseGameRecord(input: unknown, allowed: readonly ResultSource[] = CLIENT_RESULT_SOURCES): GameRecordInput | null {
  if (typeof input !== 'object' || input === null) return null;
  const r = input as Record<string, unknown>;
  const abilities = r.abilities as Record<string, unknown> | undefined;
  const difficulty = r.difficulty as Record<string, unknown> | undefined;

  if (!allowed.includes(r.source as ResultSource)) return null;
  if (!Number.isInteger(r.balanceVersion) || (r.balanceVersion as number) < 1) return null;
  if (!abilities || !isAbilityOrNone(abilities.w) || !isAbilityOrNone(abilities.b)) return null;
  if (r.winner !== null && !isColor(r.winner)) return null;
  if (typeof r.reason !== 'string' || r.reason.length > MAX_REASON_LENGTH) return null;
  if (!Number.isInteger(r.plies) || (r.plies as number) < 0 || (r.plies as number) > MAX_PLIES) return null;
  if (difficulty !== undefined && Object.entries(difficulty).some(([k, v]) => !isColor(k) || !DIFFICULTIES.has(v as string))) return null;

  const mode = r.mode === undefined ? undefined : parseMode(r.mode);
  if (mode === null) return null;
  const fen = r.fen;
  if (fen !== undefined && !isFen(fen)) return null;

  const players = { w: abilities.w as string | null, b: abilities.b as string | null };
  const actions = r.actions;
  if (actions !== undefined) {
    if (!Array.isArray(actions) || actions.length > MAX_RECORD_ACTIONS || !actions.every(isAction)) return null;
    // 규칙대로 재생되지 않는 수순은 학습 데이터를 오염시키므로 받지 않는다
    if (!isReplayable(players, actions, { mode, fen })) return null;
  }

  return {
    source: r.source as ResultSource,
    balanceVersion: r.balanceVersion as number,
    abilities: players,
    winner: r.winner as GameRecordInput['winner'],
    reason: r.reason,
    plies: r.plies as number,
    ...(mode ? { mode } : {}),
    ...(fen !== undefined ? { fen } : {}),
    ...(difficulty ? { difficulty: difficulty as GameRecordInput['difficulty'] } : {}),
    ...(actions ? { actions: actions as GameRecordInput['actions'] } : {}),
  };
}

function parseMode(value: unknown): GameMode | null {
  if (typeof value !== 'object' || value === null) return null;
  const m = value as Record<string, unknown>;
  if (!DEPLOYMENTS.has(m.deployment as Deployment) || typeof m.fog !== 'boolean') return null;
  return { deployment: m.deployment as Deployment, fog: m.fog };
}

function isFen(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > MAX_FEN_LENGTH) return false;
  try {
    parseFen(value);
    return true;
  } catch {
    return false;
  }
}

export interface ResultStoreOptions {
  readonly now?: () => number;
  /** 함께 읽기만 하는 기록 파일 (예: 밸런스 시뮬레이션 가져오기 결과) */
  readonly seedFiles?: readonly string[];
}

/** 대국 기록 저장소: JSON Lines 파일에 한 줄씩 추가한다 */
export class ResultStore {
  private records: GameRecord[] | null = null;
  private readonly now: () => number;
  private readonly seedFiles: readonly string[];

  constructor(
    private readonly filePath: string,
    options: ResultStoreOptions = {},
  ) {
    this.now = options.now ?? Date.now;
    this.seedFiles = options.seedFiles ?? [];
  }

  add(input: GameRecordInput): GameRecord {
    const record: GameRecord = { ...input, playedAt: this.now() };
    mkdirSync(dirname(this.filePath), { recursive: true });
    appendFileSync(this.filePath, `${JSON.stringify(record)}\n`);
    this.all().push(record);
    return record;
  }

  all(): GameRecord[] {
    if (this.records) return this.records;
    this.records = [...this.seedFiles, this.filePath].flatMap((file) => (existsSync(file) ? parseLines(readFileSync(file, 'utf8')) : []));
    return this.records;
  }
}

export function parseLines(text: string): GameRecord[] {
  return text
    .split('\n')
    .filter((line) => line.trim())
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as GameRecord];
      } catch {
        return [];
      }
    });
}
