import {
  fileOf,
  isInCheck,
  rankOf,
  royalSquares,
  toAlgebraic,
  type Board as BoardData,
  type Color,
  type GameEvent,
  type GameState,
  type Piece,
  type Square,
} from '@hyperchess/engine';
import type { CSSProperties } from 'react';
import { abilityUi, ENHANCEMENT_BY_PIECE, type AbilityIcon } from '../abilityUi/specs';
import type { Overlay } from '../effects/types';
import type { InteractionController } from '../game/useInteraction';
import type { StageView } from '../game/useStage';
import { AbilityIconView } from './AbilityIconView';
import { PieceSvg } from './PieceSvg';

interface BoardProps {
  readonly state: GameState;
  readonly stage: StageView;
  readonly interaction: InteractionController;
  /** 보드 왼쪽에 진영이 놓이는 색 */
  readonly leftColor: Color;
  readonly busy: boolean;
}

const SQUARES = Array.from({ length: 64 }, (_, i) => i);

/**
 * 좌우 배치 좌표. leftColor 진영이 왼쪽에서 오른쪽으로 전진한다.
 * 백이 왼쪽이면 a파일이 위(백의 왼손 쪽), 흑이 왼쪽이면 180° 회전.
 */
function position(square: Square, leftColor: Color) {
  const file = fileOf(square);
  const rank = rankOf(square);
  return leftColor === 'w' ? { x: rank, y: file } : { x: 7 - rank, y: 7 - file };
}

function eventSquares(event: GameEvent | undefined): Square[] {
  if (!event) return [];
  if (event.kind === 'move') return [event.move.from, event.move.to];
  return event.changes.flatMap((change) => {
    if (change.type === 'move') return [change.from, change.to];
    return [change.square];
  });
}

interface Badge {
  readonly icon: AbilityIcon;
  readonly color: string;
}

function pieceBadge(piece: Piece, state: GameState): Badge | null {
  if (piece.title === 'heir') return { icon: 'heir', color: abilityUi('heir').color };
  if (piece.title === 'oldKing') return { icon: 'crown', color: '#9a93ab' };
  if (piece.enhanced) {
    const spec = abilityUi(ENHANCEMENT_BY_PIECE[piece.type] ?? '');
    return { icon: spec.icon, color: spec.color };
  }
  const rules = state.players[piece.color].rules;
  if (rules.queensRoyal && (piece.type === 'q' || piece.royal)) return { icon: 'crown', color: abilityUi('empress').color };
  return null;
}

function OverlayView({ overlay, leftColor }: { overlay: Overlay; leftColor: Color }) {
  const style = { '--fx-color': overlay.color, '--fx-duration': `${overlay.duration}ms` } as CSSProperties;

  if (overlay.square === undefined) {
    return (
      <div className={`fx fx-${overlay.kind} fx-full`} style={style}>
        {overlay.icon && <AbilityIconView icon={overlay.icon} size={96} />}
      </div>
    );
  }

  const { x, y } = position(overlay.square, leftColor);
  const placed: CSSProperties = { ...style, left: `${x * 12.5}%`, top: `${y * 12.5}%` };

  if (overlay.kind === 'beam' && overlay.to !== undefined) {
    const target = position(overlay.to, leftColor);
    const dx = target.x - x;
    const dy = target.y - y;
    const beamStyle: CSSProperties = {
      ...style,
      left: `${(x + 0.5) * 12.5}%`,
      top: `${(y + 0.5) * 12.5}%`,
      width: `${Math.hypot(dx, dy) * 12.5}%`,
      transform: `rotate(${Math.atan2(dy, dx)}rad)`,
    };
    return <div className="fx fx-beam" style={beamStyle} />;
  }

  return (
    <div className={`fx fx-${overlay.kind} fx-square`} style={placed}>
      {overlay.icon && <AbilityIconView icon={overlay.icon} size={48} />}
    </div>
  );
}

export function Board({ state, stage, interaction, leftColor, busy }: BoardProps) {
  const board: BoardData = stage.board ?? state.board;
  const animating = busy || stage.board !== null;
  const turnSpec = abilityUi(state.players[state.turn].abilityId ?? '');

  const lastSquares = animating ? [] : eventSquares(state.log[state.log.length - 1]);
  const lastEvent = state.log[state.log.length - 1];
  const lastTint = lastEvent?.kind === 'ability' ? abilityUi(lastEvent.abilityId).color : null;
  const checkSquares = !animating && isInCheck(state, state.turn) ? royalSquares(state, state.turn) : [];
  const moveTargets = new Map(interaction.selectedTargets.map((m) => [m.to, m]));
  const hasteActive = !animating && state.turnState.movesAllowed > 1 && state.result.kind === 'ongoing';

  const pieces = board
    .map((piece, square) => (piece ? { piece, square } : null))
    .filter((entry): entry is { piece: Piece; square: Square } => entry !== null)
    .sort((a, b) => (a.piece.id < b.piece.id ? -1 : 1));

  const boardClass = [
    'board',
    interaction.targeting ? 'is-targeting' : '',
    hasteActive ? 'is-haste' : '',
  ].join(' ');

  return (
    <div className={boardClass} style={{ '--turn-color': turnSpec.color } as CSSProperties}>
      <div className="board-squares">
        {SQUARES.map((square) => {
          const { x, y } = position(square, leftColor);
          const dark = (fileOf(square) + rankOf(square)) % 2 === 0;
          const target = moveTargets.get(square);
          const classes = [
            'square',
            dark ? 'dark' : 'light',
            lastSquares.includes(square) ? (lastTint ? 'last-ability' : 'last-move') : '',
            interaction.selected === square ? 'selected' : '',
            target ? (board[square] || target.kind === 'enPassant' ? 'capture-target' : 'move-target') : '',
            checkSquares.includes(square) ? 'in-check' : '',
            interaction.targetingSquares.includes(square) ? 'ability-target' : '',
            interaction.pickedSquares.includes(square) ? 'ability-picked' : '',
          ].join(' ');

          return (
            <button
              key={square}
              type="button"
              className={classes}
              style={{ gridColumn: x + 1, gridRow: y + 1, '--last-tint': lastTint ?? undefined } as CSSProperties}
              aria-label={toAlgebraic(square)}
              onClick={() => interaction.onSquare(square)}
            >
              {y === 7 && <span className="coord coord-bottom">{toAlgebraic(square)[1]}</span>}
              {x === 0 && <span className="coord coord-left">{toAlgebraic(square)[0]}</span>}
            </button>
          );
        })}
      </div>

      <div className="board-pieces">
        {pieces.map(({ piece, square }) => {
          const { x, y } = position(square, leftColor);
          const badge = pieceBadge(piece, state);
          const fx = stage.pieceFx[piece.id];
          return (
            <div
              key={piece.id}
              className="piece"
              style={{ transform: `translate(${x * 100}%, ${y * 100}%)`, '--badge-color': badge?.color } as CSSProperties}
            >
              <div className={`piece-body ${fx ? `pfx-${fx}` : ''} ${badge ? 'has-aura' : ''} ${piece.title === 'oldKing' ? 'is-old-king' : ''}`}>
                <PieceSvg type={piece.type} color={piece.color} />
                {badge && (
                  <span className="piece-badge">
                    <AbilityIconView icon={badge.icon} size={12} />
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="board-fx">
        {stage.overlays.map((overlay) => (
          <OverlayView key={overlay.id} overlay={overlay} leftColor={leftColor} />
        ))}
      </div>
    </div>
  );
}
