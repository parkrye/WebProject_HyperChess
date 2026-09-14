import type { GameResult, GameState, PieceType } from '@hyperchess/engine';
import { useEffect, useState, type ReactNode } from 'react';
import { resultText } from '../abilityUi/text';
import type { InteractionController } from '../game/useInteraction';
import { PieceSprite } from './PieceSprite';

/** 여제 규칙에서는 퀸 자리에 승급 킹(k)이 들어간다 */
const PROMOTION_ORDER: readonly PieceType[] = ['q', 'k', 'r', 'b', 'n'];

export function PromotionDialog({ state, interaction }: { state: GameState; interaction: InteractionController }) {
  const { promotion } = interaction;
  if (!promotion) return null;

  const options = PROMOTION_ORDER.map((type) => promotion.options.find((m) => m.promotion === type)).filter((m) => !!m);
  return (
    <div className="dialog-backdrop" onClick={interaction.cancelPromotion}>
      <div className="dialog" role="dialog" aria-label="프로모션 선택" onClick={(e) => e.stopPropagation()}>
        <h2>프로모션</h2>
        <div className="promotion-row">
          {options.map((move) => (
            <button key={move.promotion} type="button" className="promotion-option" onClick={() => interaction.choosePromotion(move)}>
              <PieceSprite type={move.promotion ?? 'q'} color={state.turn} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ResultDialog({ result, children }: { result: GameResult; children: ReactNode }) {
  const [hidden, setHidden] = useState(false);
  useEffect(() => setHidden(false), [result]);
  if (result.kind === 'ongoing' || hidden) return null;
  const { title, detail } = resultText(result);
  return (
    <div className="dialog-backdrop">
      <div className="dialog result-dialog" role="dialog" aria-label="게임 결과">
        <h2>{title}</h2>
        <p>{detail}</p>
        <div className="dialog-actions">{children}</div>
        <button type="button" className="btn-link" onClick={() => setHidden(true)}>
          보드 보기
        </button>
      </div>
    </div>
  );
}
