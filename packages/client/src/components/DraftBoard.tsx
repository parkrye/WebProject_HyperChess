import {
  DRAFT_BUDGET,
  DRAFT_COST,
  DRAFT_RANKS,
  deploySquare,
  draftError,
  fileOf,
  kingOnlyPlacement,
  placementCost,
  rankOf,
  relativeRank,
  standardPlacement,
  type Color,
  type PieceType,
  type Placement,
  type Square,
} from '@hyperchess/engine';
import { useState } from 'react';
import { COLOR_NAME } from '../abilityUi/text';
import { PieceSprite } from './PieceSprite';

type Buyable = keyof typeof DRAFT_COST;
const BUYABLE: readonly Buyable[] = ['p', 'n', 'b', 'r', 'q'];
const PIECE_NAME: Readonly<Record<PieceType, string>> = { p: '폰', n: '나이트', b: '비숍', r: '룩', q: '퀸', k: '킹' };

/** 도구: 살 말 종류, 또는 킹 옮기기 */
type Tool = Buyable | 'k';

interface DraftBoardProps {
  readonly color: Color;
  /** 편성을 마치면 호출 */
  readonly onDone: (placement: Placement) => void;
}

/**
 * 징병 편성판. 게임 화면처럼 내 진영이 왼쪽에 오도록 줄을 열로, 파일을 행으로 그린다.
 * 빈칸을 누르면 고른 말을 사서 두고, 산 말을 다시 누르면 판다. 킹을 누른 뒤 첫 줄 빈칸을 누르면 옮긴다.
 */
export function DraftBoard({ color, onDone }: DraftBoardProps) {
  const [placement, setPlacement] = useState<Placement>(() => standardPlacement(color));
  const [tool, setTool] = useState<Tool>('p');
  const [hint, setHint] = useState<string | null>(null);

  const spent = placementCost(placement);
  const error = draftError(color, placement);
  const at = (square: Square) => placement.find((entry) => entry.square === square)?.type ?? null;

  const place = (square: Square) => {
    const occupant = at(square);
    const rank = relativeRank(square, color);
    setHint(null);

    if (occupant === 'k') {
      setTool(tool === 'k' ? 'p' : 'k');
      return;
    }
    if (tool === 'k') {
      if (occupant || rank !== 0) {
        setHint('킹은 첫 줄 빈칸으로만 옮길 수 있습니다');
        return;
      }
      setPlacement((prev) => prev.map((entry) => (entry.type === 'k' ? { ...entry, square } : entry)));
      setTool('p');
      return;
    }
    if (occupant) {
      setPlacement((prev) => prev.filter((entry) => entry.square !== square));
      return;
    }
    if (rank > 0 && tool !== 'p') {
      setHint('둘째·셋째 줄에는 폰만 둘 수 있습니다');
      return;
    }
    if (spent + DRAFT_COST[tool] > DRAFT_BUDGET) {
      setHint('예산이 모자랍니다');
      return;
    }
    setPlacement((prev) => [...prev, { square, type: tool }]);
  };

  // 내 첫 줄이 왼쪽 열. 흑은 게임 화면에서 180° 돌아 있으므로 파일 순서도 뒤집는다
  const cells = Array.from({ length: 8 * DRAFT_RANKS }, (_, index) => {
    const rank = index % DRAFT_RANKS;
    const row = Math.floor(index / DRAFT_RANKS);
    const file = color === 'w' ? row : 7 - row;
    return { square: deploySquare(color, file, rank), rank };
  });

  return (
    <div className="draft">
      <div className="draft-budget">
        <span>
          {COLOR_NAME[color]} 편성 · 남은 예산 <strong>{DRAFT_BUDGET - spent}</strong> / {DRAFT_BUDGET}
        </span>
      </div>

      <div className="draft-tools" role="radiogroup" aria-label="살 말">
        {BUYABLE.map((type) => (
          <button
            key={type}
            type="button"
            role="radio"
            aria-checked={tool === type}
            className={`draft-tool ${tool === type ? 'active' : ''}`}
            disabled={spent + DRAFT_COST[type] > DRAFT_BUDGET}
            onClick={() => setTool(type)}
          >
            <PieceSprite type={type} color={color} />
            <span className="draft-tool-name">{PIECE_NAME[type]}</span>
            <span className="draft-tool-cost">{DRAFT_COST[type]}</span>
          </button>
        ))}
      </div>

      <div className="draft-grid" style={{ gridTemplateColumns: `repeat(${DRAFT_RANKS}, 1fr)` }}>
        {cells.map(({ square, rank }) => {
          const type = at(square);
          const dark = (fileOf(square) + rankOf(square)) % 2 === 0;
          const kingSlot = tool === 'k' && rank === 0 && !type;
          return (
            <button
              key={square}
              type="button"
              className={['square', dark ? 'dark' : 'light', kingSlot ? 'move-target' : '', type === 'k' && tool === 'k' ? 'selected' : ''].join(' ')}
              onClick={() => place(square)}
              aria-label={type ? PIECE_NAME[type] : '빈칸'}
            >
              {type && <PieceSprite type={type} color={color} />}
            </button>
          );
        })}
      </div>

      <p className="notice">{hint ?? error ?? '킹을 누르면 첫 줄 안에서 옮길 수 있습니다'}</p>

      <div className="page-actions">
        <button type="button" className="btn btn-ghost" onClick={() => setPlacement(standardPlacement(color))}>
          표준 배치
        </button>
        <button type="button" className="btn btn-ghost" onClick={() => setPlacement(kingOnlyPlacement(color))}>
          비우기
        </button>
        <button type="button" className="btn btn-primary" disabled={error !== null} onClick={() => onDone(placement)}>
          편성 완료
        </button>
      </div>
    </div>
  );
}
