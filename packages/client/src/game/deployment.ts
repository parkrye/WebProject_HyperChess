import { chaosPlacement, deploySquare, placementFen, type Color, type PieceType, type Placement } from '@hyperchess/engine';

/**
 * AI의 징병 편성 후보. 줄마다 a~h 파일 순서의 8글자 ('.'은 빈칸), 첫 줄부터.
 * 모두 예산(39) 안이다 (deployment.test.ts에서 확인).
 */
export const AI_DRAFT_PRESETS: readonly (readonly string[])[] = [
  // 표준
  ['rnbqkbnr', 'pppppppp'],
  // 퀸 둘: 비숍 둘을 팔아 퀸 하나를 더 산다
  ['rn.qkq.r', 'pppppppp'],
  // 기병대: 룩 하나 대신 나이트를 늘리고 폰을 앞세운다
  ['nnbqkbnr', 'pppppppp', '..p..p..'],
];

export function presetPlacement(color: Color, rows: readonly string[]): Placement {
  return rows.flatMap((row, rank) =>
    [...row].flatMap((letter, file) => (letter === '.' ? [] : [{ square: deploySquare(color, file, rank), type: letter as PieceType }])),
  );
}

export function aiDraftPlacement(color: Color, random: () => number = Math.random): Placement {
  return presetPlacement(color, AI_DRAFT_PRESETS[Math.floor(random() * AI_DRAFT_PRESETS.length)]);
}

/** 혼돈 배치 시작 FEN (호출할 때마다 새로 뽑는다) */
export const chaosFen = (random: () => number = Math.random): string => placementFen(chaosPlacement('w', random), chaosPlacement('b', random));
