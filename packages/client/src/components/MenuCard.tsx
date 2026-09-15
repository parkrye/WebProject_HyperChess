import type { Color, PieceType } from '@hyperchess/engine';
import { PieceSprite } from './PieceSprite';

export interface MenuCardArt {
  readonly type: PieceType;
  readonly color: Color;
}

interface MenuCardProps {
  readonly label: string;
  /** 카드에 그릴 말 (두 개면 서로 마주 보게) */
  readonly art: readonly MenuCardArt[];
  readonly onClick: () => void;
}

export function MenuCard({ label, art, onClick }: MenuCardProps) {
  return (
    <button type="button" className="menu-card" onClick={onClick}>
      <span className="menu-card-art" aria-hidden>
        {art.map((piece, index) => (
          <span key={index} className="menu-card-piece">
            <PieceSprite type={piece.type} color={piece.color} faceLeft={index > 0} />
          </span>
        ))}
      </span>
      <strong className="menu-card-label">{label}</strong>
    </button>
  );
}
