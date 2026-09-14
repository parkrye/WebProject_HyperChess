import type { Color, PieceType } from '@hyperchess/engine';
import { standardPieceSprite } from '../assets/sprites';

interface PieceSpriteProps {
  readonly type: PieceType;
  readonly color: Color;
  /** 상태별 스프라이트 경로 (없으면 기본 말) */
  readonly src?: string;
  /** 오른쪽 진영: 원본은 오른쪽을 보므로 좌우 반전 */
  readonly faceLeft?: boolean;
}

export function PieceSprite({ type, color, src, faceLeft = false }: PieceSpriteProps) {
  return (
    <img
      className={`piece-img ${faceLeft ? 'face-left' : ''}`}
      src={src ?? standardPieceSprite(type, color)}
      alt=""
      draggable={false}
    />
  );
}
