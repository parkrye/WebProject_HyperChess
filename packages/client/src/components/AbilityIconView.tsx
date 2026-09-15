import type { ReactNode } from 'react';
import { abilityUi, type AbilityIcon } from '../abilityUi/specs';
import { abilityIconSprite } from '../assets/sprites';

/** 도트 아트가 준비되기 전까지 쓰는 벡터 아이콘 (금테 보석 배지 + 문양) */
const GLYPHS: Partial<Record<AbilityIcon, ReactNode>> = {
  // 연금술: 삼각형 안의 원 (변성 문양)
  alchemy: (
    <>
      <path d="M16 7 L25 23 H7 Z" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinejoin="round" />
      <circle cx="16" cy="17.5" r="3.2" fill="#fff" />
    </>
  ),
  // 세뇌: 소용돌이 눈
  brainwash: (
    <>
      <path d="M16 16 A1.5 1.5 0 0 1 19 16 A3 3 0 0 1 13 16 A4.5 4.5 0 0 1 22 16 A6 6 0 0 1 10 16" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
    </>
  ),
  // 성벽: 성가퀴가 있는 벽돌 벽
  wall: (
    <>
      <path d="M8 12 H11 V10 H14 V12 H18 V10 H21 V12 H24 V24 H8 Z" fill="#fff" />
      <path d="M8 16 H24 M8 20 H24 M13 12 V16 M19 12 V16 M16 16 V20 M11 20 V24 M21 20 V24" stroke="#8a6a44" strokeWidth="1.2" />
    </>
  ),
  // 총진군: 겹친 전진 화살표
  march: (
    <>
      <path d="M10 15 L16 9 L22 15 M10 20 L16 14 L22 20 M10 25 L16 19 L22 25" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  // 저격: 조준경
  snipe: (
    <>
      <circle cx="16" cy="16" r="7" fill="none" stroke="#fff" strokeWidth="2" />
      <path d="M16 6 V12 M16 20 V26 M6 16 H12 M20 16 H26" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
      <circle cx="16" cy="16" r="1.6" fill="#fff" />
    </>
  ),
};

const ICON_ABILITY: Partial<Record<AbilityIcon, string>> = { alchemy: 'alchemy', brainwash: 'brainwash', wall: 'wall', march: 'march', snipe: 'snipe' };

export function AbilityIconView({ icon, size = 20, className }: { icon: AbilityIcon; size?: number; className?: string }) {
  const sprite = abilityIconSprite(icon);
  if (sprite) {
    return <img className={`icon-img ${className ?? ''}`} src={sprite} width={size} height={size} alt="" draggable={false} />;
  }
  const gem = abilityUi(ICON_ABILITY[icon] ?? '').color;
  return (
    <svg className={`icon-img icon-vector ${className ?? ''}`} viewBox="0 0 32 32" width={size} height={size} aria-hidden>
      <circle cx="16" cy="16" r="14.5" fill="#e8b94a" stroke="#3a2a14" strokeWidth="1.5" />
      <circle cx="16" cy="16" r="11.5" fill={gem} stroke="#3a2a14" strokeWidth="1" />
      {GLYPHS[icon]}
    </svg>
  );
}
