import type { Color, Piece, PieceType, PlayerRules } from '@hyperchess/engine';
import type { AbilityIcon } from '../abilityUi/specs';

/** public/assets 아래 가공된 에셋 경로 (scripts/import-assets.mjs 가 생성) */
const ASSETS = '/assets';

const ENHANCED_SPRITE: Partial<Record<PieceType, string>> = {
  p: 'heavyInfantry',
  n: 'lancer',
  r: 'chariot',
  b: 'paladin',
};

export const standardPieceSprite = (type: PieceType, color: Color) => `${ASSETS}/pieces/${color}-${type}.png`;

/** 말의 상태(강화·왕족·여제)에 맞는 스프라이트 */
export function pieceSprite(piece: Piece, rules: PlayerRules): string {
  const { color, type } = piece;
  const file = (name: string) => `${ASSETS}/pieces/${color}-${name}.png`;

  if (piece.title === 'heir' && type === 'p') return file('heir');
  if (piece.title === 'oldKing' && type === 'k') return file('oldking');
  if (type === 'k' && piece.title === 'promoted') return file('promoted');
  if (rules.queensRoyal && type === 'q') return file('empress-q');
  if (rules.queensRoyal && type === 'k') return file('empress-k');
  if (piece.enhanced && ENHANCED_SPRITE[type]) return file(ENHANCED_SPRITE[type]!);
  return standardPieceSprite(type, color);
}

/** 능력 아이콘 이름 → 아이콘 스프라이트 */
const ICON_SPRITE: Readonly<Record<AbilityIcon, string>> = {
  telekinesis: 'telekinesis',
  haste: 'haste',
  teleport: 'teleport',
  revive: 'revive',
  rewind: 'rewind',
  shield: 'heavyInfantry',
  lance: 'lancer',
  wheel: 'chariot',
  cross: 'paladin',
  crown: 'empress',
  heir: 'heir',
  random: 'random',
};

export const abilityIconSprite = (icon: AbilityIcon) => `${ASSETS}/icons/${ICON_SPRITE[icon]}.png`;

export type UiIcon = 'none' | 'random' | 'settings' | 'flip' | 'exit';
export const uiIconSprite = (icon: UiIcon) => `${ASSETS}/icons/${icon}.png`;

export type BadgeSprite = 'shield' | 'lance' | 'wheel' | 'cross' | 'empress' | 'heir' | 'oldking' | 'promoted';
export const badgeSprite = (badge: BadgeSprite) => `${ASSETS}/badges/${badge}.png`;

export const uiSprite = {
  gemEmpty: `${ASSETS}/ui/gem-empty.png`,
  gemFull: `${ASSETS}/ui/gem-full.png`,
  hourglass: `${ASSETS}/ui/hourglass.png`,
  logo: `${ASSETS}/ui/logo.png`,
} as const;

/** 가로 스트립 이펙트 (5프레임) */
export type EffectStrip = 'burst' | 'ring' | 'pillar' | 'crown';
export const EFFECT_FRAMES = 5;
export const effectStripSprite = (strip: EffectStrip) => `${ASSETS}/fx/${strip}.png`;
