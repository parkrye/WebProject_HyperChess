import type { Board, Color, GameEvent, GameState, Piece, Square, Wall } from '@hyperchess/engine';
import type { AbilityIcon } from '../abilityUi/specs';

export type OverlayKind =
  | 'ring' | 'pillar' | 'burst' | 'beam' | 'stamp' | 'flash' | 'speedlines' | 'clock' | 'scanlines' | 'shatter'
  | 'sigil' | 'crosshair' | 'dust' | 'shockwave';

export interface OverlaySpec {
  readonly kind: OverlayKind;
  readonly color: string;
  readonly duration: number;
  readonly square?: Square;
  /** beam 전용 도착 칸 */
  readonly to?: Square;
  readonly icon?: AbilityIcon;
  /** 연출 방향 기준 진영 (그 진영의 전진 방향으로 흐름) */
  readonly side?: Color;
  /** shatter 전용: 부서지는 말 */
  readonly piece?: Piece;
}

export interface Overlay extends OverlaySpec {
  readonly id: number;
}

export type PieceFx =
  | 'levitate' | 'land' | 'vanish' | 'appear' | 'rise' | 'empower' | 'dim' | 'afterimage' | 'crumble'
  | 'transmute' | 'hypnotize' | 'recoil' | 'stomp';
export type ScreenFx = 'rewind';

export interface Stage {
  showBoard(board: Board): void;
  showWalls(walls: readonly Wall[]): void;
  overlay(spec: OverlaySpec): void;
  pieceFx(pieceId: string, fx: PieceFx | null): void;
  screen(fx: ScreenFx | null): void;
  wait(ms: number): Promise<void>;
}

export interface EffectContext<E extends GameEvent = GameEvent> {
  readonly event: E;
  readonly before: GameState;
  readonly after: GameState;
  readonly stage: Stage;
}

export type AbilityEvent = Extract<GameEvent, { kind: 'ability' }>;
export type AbilityEffect = (ctx: EffectContext<AbilityEvent>) => Promise<void>;
