import type { Color, PieceType } from '@hyperchess/engine';
import type { ReactNode } from 'react';

const BASE = <rect x="22" y="80" width="56" height="10" rx="4" />;

const SHAPES: Record<PieceType, ReactNode> = {
  p: (
    <>
      <circle cx="50" cy="30" r="13" />
      <path d="M37 50Q50 41 63 50L59 58Q69 70 71 80H29Q31 70 41 58Z" />
      {BASE}
    </>
  ),
  r: (
    <>
      <path d="M33 80L36 44H64L67 80Z" />
      <path d="M27 20H38V28H45V20H55V28H62V20H73V44H27Z" />
      {BASE}
    </>
  ),
  n: (
    <>
      <path d="M30 80L34 63Q30 53 36 45L25 50Q17 49 20 41L40 21L42 11L51 19Q71 22 75 46Q78 64 72 80Z" />
      <circle className="piece-detail" cx="44" cy="32" r="3" />
      {BASE}
    </>
  ),
  b: (
    <>
      <path d="M38 80Q40 67 44 60H56Q60 67 62 80Z" />
      <path d="M50 17Q71 36 62 55H38Q29 36 50 17Z" />
      <circle cx="50" cy="13" r="5" />
      <path className="piece-detail-line" d="M57 30L46 43" />
      {BASE}
    </>
  ),
  q: (
    <>
      <path d="M30 80L20 33L31 53L35 25L44 49L50 18L56 49L65 25L69 53L80 33L70 80Z" />
      {[
        [20, 30], [35, 21], [50, 14], [65, 21], [80, 30],
      ].map(([cx, cy]) => (
        <circle key={cx} cx={cx} cy={cy} r="4.5" />
      ))}
      {BASE}
    </>
  ),
  k: (
    <>
      <path d="M30 80Q23 57 34 45Q50 38 66 45Q77 57 70 80Z" />
      <path d="M46 8H54V17H63V25H54V38H46V25H37V17H46Z" />
      {BASE}
    </>
  ),
};

export function PieceSvg({ type, color }: { type: PieceType; color: Color }) {
  return (
    <svg className={`piece-svg piece-${color}`} viewBox="0 0 100 100" aria-hidden="true">
      <g strokeWidth="3.5" strokeLinejoin="round">
        {SHAPES[type]}
      </g>
    </svg>
  );
}
