import type { GameResult, GameState, PieceType } from '@hyperchess/engine';
import { resultText } from '../abilityUi/text';
import type { InteractionController } from '../game/useInteraction';
import { PieceSvg } from './PieceSvg';

const PROMOTION_ORDER: readonly PieceType[] = ['q', 'r', 'b', 'n'];

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
              <PieceSvg type={move.promotion ?? 'q'} color={state.turn} />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ResultDialog({ result, onRestart, onMenu }: { result: GameResult; onRestart: () => void; onMenu: () => void }) {
  if (result.kind === 'ongoing') return null;
  const { title, detail } = resultText(result);
  return (
    <div className="dialog-backdrop">
      <div className="dialog result-dialog" role="dialog" aria-label="게임 결과">
        <h2>{title}</h2>
        <p>{detail}</p>
        <div className="dialog-actions">
          <button type="button" className="btn btn-primary" onClick={onRestart}>
            다시 하기
          </button>
          <button type="button" className="btn btn-ghost" onClick={onMenu}>
            메뉴로
          </button>
        </div>
      </div>
    </div>
  );
}
