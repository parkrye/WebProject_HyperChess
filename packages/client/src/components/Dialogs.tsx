import { materialScores, type Color, type DrawVote, type GameResult, type GameState, type PieceType } from '@hyperchess/engine';
import { useEffect, useState, type ReactNode } from 'react';
import { COLOR_NAME, DRAW_VOTE_TEXT, judgeScoreText, resultText } from '../abilityUi/text';
import type { InteractionController } from '../game/useInteraction';
import { PieceSprite } from './PieceSprite';

const VOTE_ORDER: readonly DrawVote[] = ['accept', 'judge', 'decline'];

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

/**
 * 무승부 제안 창. 양쪽 답이 같아야 결정되므로 아직 답하지 않은 색에게 차례로 묻는다.
 * askColor가 null이면 상대의 답을 기다리는 중이다 (핫시트에서는 먼저 답한 쪽의 선택을 보여 주지 않는다).
 */
export function DrawOfferDialog({
  state,
  askColor,
  onVote,
}: {
  state: GameState;
  askColor: Color | null;
  onVote: (color: Color, vote: DrawVote) => void;
}) {
  const { offer, quietPlies } = state.draw;
  if (!offer || state.result.kind !== 'ongoing') return null;

  const scores = materialScores(state);
  return (
    <div className="dialog-backdrop">
      <div className="dialog draw-dialog" role="dialog" aria-label="무승부 제안">
        <h2>무승부 제안</h2>
        <p>말이 잡히거나 바뀌지 않은 채 {quietPlies}수가 지났습니다.</p>
        <p className="draw-scores">
          남은 말 가치 · 백 {judgeScoreText(scores.w)} <span aria-hidden="true">:</span> 흑 {judgeScoreText(scores.b)}
        </p>
        {askColor ? (
          <>
            <p className="draw-asking">{COLOR_NAME[askColor]}의 답</p>
            <div className="draw-votes">
              {VOTE_ORDER.map((vote) => (
                <button key={vote} type="button" className="btn btn-ghost draw-vote" onClick={() => onVote(askColor, vote)}>
                  <strong>{DRAW_VOTE_TEXT[vote].label}</strong>
                  <small>{DRAW_VOTE_TEXT[vote].hint}</small>
                </button>
              ))}
            </div>
          </>
        ) : (
          <p className="draw-asking">상대의 답을 기다리는 중…</p>
        )}
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
