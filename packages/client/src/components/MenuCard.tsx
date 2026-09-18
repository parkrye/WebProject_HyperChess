import type { Color, PieceType } from '@hyperchess/engine';
import { PieceSprite } from './PieceSprite';

export interface MenuCardArt {
  readonly type: PieceType;
  readonly color: Color;
}

interface MenuCardProps {
  readonly label: string;
  /** 라벨 아래 한 줄 설명 */
  readonly hint: string;
  /** 카드에 그릴 말 (두 개면 서로 마주 보게) */
  readonly art: readonly MenuCardArt[];
  /** 가로로 긴 카드 (한 줄을 혼자 차지한다) */
  readonly wide?: boolean;
  readonly onClick: () => void;
}

export function MenuCard({ label, hint, art, wide = false, onClick }: MenuCardProps) {
  return (
    <button type="button" className={`menu-card ${wide ? 'menu-card-wide' : ''}`} onClick={onClick}>
      <span className="menu-card-art" aria-hidden>
        {art.map((piece, index) => (
          <span key={index} className="menu-card-piece">
            <PieceSprite type={piece.type} color={piece.color} faceLeft={index > 0} />
          </span>
        ))}
      </span>
      <span className="menu-card-text">
        <strong className="menu-card-label">{label}</strong>
        <span className="menu-card-hint">{hint}</span>
      </span>
    </button>
  );
}
