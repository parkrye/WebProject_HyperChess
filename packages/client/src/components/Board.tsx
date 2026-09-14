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
import { abilityUi } from '../abilityUi/specs';
import { badgeSprite, effectStripSprite, pieceSprite, type BadgeSprite, type EffectStrip } from '../assets/sprites';
import type { Overlay } from '../effects/types';
import type { InteractionController } from '../game/useInteraction';
import type { StageView } from '../game/useStage';
import { AbilityIconView } from './AbilityIconView';
import { PieceSprite } from './PieceSprite';

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

/**
 * 스프라이트만으로 표현되지 않는 상태의 배지.
 * 강화 말·폰 계승자·선왕·승급 킹·여제 말은 전용 스프라이트가 있어 배지를 달지 않는다.
 */
function pieceBadge(piece: Piece): BadgeSprite | null {
  if (piece.title === 'heir' && piece.type !== 'p') return 'heir';
  if (piece.title === 'oldKing' && piece.type !== 'k') return 'oldking';
  return null;
}

/** 이펙트 오버레이 종류 → 스프라이트 스트립 (없으면 CSS 연출) */
function effectStrip(overlay: Overlay): EffectStrip | null {
  if (overlay.kind === 'burst') return 'burst';
  if (overlay.kind === 'ring') return 'ring';
  if (overlay.kind === 'pillar') return 'pillar';
  if (overlay.kind === 'stamp' && overlay.icon === 'crown') return 'crown';
  return null;
}

/** side 진영의 전진 방향 (화면 x축 부호) */
const forward = (side: Color | undefined, leftColor: Color) => (side === undefined || side === leftColor ? 1 : -1);

function OverlayView({ overlay, leftColor }: { overlay: Overlay; leftColor: Color }) {
  const style = {
    '--fx-color': overlay.color,
    '--fx-duration': `${overlay.duration}ms`,
    '--fwd': forward(overlay.side, leftColor),
  } as CSSProperties;

  if (overlay.square === undefined) {
    return (
      <div className={`fx fx-${overlay.kind} fx-full`} style={style}>
        {overlay.icon && <AbilityIconView icon={overlay.icon} size={96} />}
      </div>
    );
  }

  const { x, y } = position(overlay.square, leftColor);
  const placed: CSSProperties = { ...style, left: `${x * 12.5}%`, top: `${y * 12.5}%` };

  const strip = effectStrip(overlay);
  if (strip) {
    const spriteStyle = { ...placed, '--fx-sprite': `url(${effectStripSprite(strip)})` } as CSSProperties;
    return (
      <div className="fx fx-square" style={spriteStyle}>
        <div className={`fx-sprite fx-sprite-${strip}`} />
      </div>
    );
  }

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

  if (overlay.kind === 'shatter' && overlay.piece) {
    const { type, color } = overlay.piece;
    return (
      <div className="fx fx-shatter fx-square" style={placed}>
        <div className="shard shard-a">
          <PieceSprite type={type} color={color} faceLeft={color !== leftColor} />
        </div>
        <div className="shard shard-b">
          <PieceSprite type={type} color={color} faceLeft={color !== leftColor} />
        </div>
      </div>
    );
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
  const moveTargets = new Map(animating ? [] : interaction.selectedTargets.map((m) => [m.to, m]));
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
            !animating && interaction.selected === square ? 'selected' : '',
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
          const badge = pieceBadge(piece);
          const fx = stage.pieceFx[piece.id];
          const bodyClass = ['piece-body', fx ? `pfx-${fx}` : '', checkSquares.includes(square) ? 'is-checked' : ''].join(' ');
          const pieceStyle = {
            transform: `translate(${x * 100}%, ${y * 100}%)`,
            '--fwd': forward(piece.color, leftColor),
          } as CSSProperties;
          const sprite = pieceSprite(piece, state.players[piece.color].rules);
          return (
            <div key={piece.id} className="piece" style={pieceStyle}>
              <div className={bodyClass}>
                <PieceSprite type={piece.type} color={piece.color} src={sprite} faceLeft={piece.color !== leftColor} />
                {badge && <img className="piece-badge" src={badgeSprite(badge)} alt="" draggable={false} />}
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
