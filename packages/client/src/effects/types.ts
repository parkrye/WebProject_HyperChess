import type { Board, GameEvent, GameState, Square } from '@hyperchess/engine';
import type { AbilityIcon } from '../abilityUi/specs';

export type OverlayKind = 'ring' | 'pillar' | 'burst' | 'beam' | 'stamp' | 'flash' | 'speedlines' | 'clock' | 'scanlines';

export interface OverlaySpec {
  readonly kind: OverlayKind;
  readonly color: string;
  readonly duration: number;
  readonly square?: Square;
  /** beam 전용 도착 칸 */
  readonly to?: Square;
  readonly icon?: AbilityIcon;
}

export interface Overlay extends OverlaySpec {
  readonly id: number;
}

export type PieceFx = 'levitate' | 'land' | 'vanish' | 'appear' | 'rise' | 'empower' | 'dim' | 'afterimage';
export type ScreenFx = 'rewind';

export interface Stage {
  showBoard(board: Board): void;
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
