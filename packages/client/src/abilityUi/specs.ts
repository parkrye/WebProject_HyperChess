import type { AbilityParams } from '@hyperchess/engine';

export type StepKind = 'square' | 'captured' | 'choice';

export interface TargetStep {
  readonly key: string;
  readonly kind: StepKind;
  readonly prompt: string;
  /** choice 전용 버튼 라벨 */
  readonly label?: (value: number | string) => string;
}

export interface AbilityUiSpec {
  readonly steps: readonly TargetStep[];
  /** 대표 색 (게이지, 오라, 연출) */
  readonly color: string;
  readonly icon: AbilityIcon;
  /** 순서가 없는 파라미터를 UI에서 양방향으로 고를 수 있게 확장 */
  readonly expandOptions?: (options: AbilityParams[]) => AbilityParams[];
  /** UI 선택값을 엔진이 받는 형태로 되돌림 */
  readonly normalize?: (params: AbilityParams) => AbilityParams;
}

export type AbilityIcon =
  | 'telekinesis' | 'haste' | 'teleport' | 'revive' | 'rewind'
  | 'shield' | 'lance' | 'wheel' | 'cross' | 'crown' | 'heir';

const squareStep = (key: string, prompt: string): TargetStep => ({ key, kind: 'square', prompt });

const ENHANCE_PROMPT = (piece: string) => [squareStep('square', `강화할 ${piece}을(를) 선택하세요`)];

export const ABILITY_UI: Readonly<Record<string, AbilityUiSpec>> = {
  telekinesis: {
    color: '#b57bff',
    icon: 'telekinesis',
    steps: [squareStep('from', '움직일 말을 선택하세요'), squareStep('to', '옮길 칸을 선택하세요')],
  },
  haste: { color: '#3fe0d0', icon: 'haste', steps: [] },
  teleport: {
    color: '#5aa9ff',
    icon: 'teleport',
    steps: [squareStep('a', '첫 번째 말을 선택하세요'), squareStep('b', '위치를 바꿀 말을 선택하세요')],
    expandOptions: (options) => [...options, ...options.map((o) => ({ a: o.b, b: o.a }))],
    normalize: (p) => (Number(p.a) < Number(p.b) ? p : { a: p.b, b: p.a }),
  },
  revive: {
    color: '#ffc94a',
    icon: 'revive',
    steps: [
      { key: 'pieceId', kind: 'captured', prompt: '부활시킬 말을 선택하세요' },
      squareStep('to', '배치할 칸을 선택하세요'),
    ],
  },
  rewind: {
    color: '#9ef0ff',
    icon: 'rewind',
    steps: [{ key: 'steps', kind: 'choice', prompt: '몇 턴 전으로 돌아갈까요?', label: (v) => `${v}턴 전` }],
  },
  heavyInfantry: { color: '#e0925a', icon: 'shield', steps: ENHANCE_PROMPT('폰') },
  lancer: { color: '#ff6b6b', icon: 'lance', steps: ENHANCE_PROMPT('나이트') },
  chariot: { color: '#c9a36b', icon: 'wheel', steps: ENHANCE_PROMPT('룩') },
  paladin: { color: '#f5f0c8', icon: 'cross', steps: ENHANCE_PROMPT('비숍') },
  empress: { color: '#ff5fa2', icon: 'crown', steps: [] },
  heir: { color: '#ffd76b', icon: 'heir', steps: [squareStep('square', '계승자로 삼을 폰을 선택하세요')] },
};

const FALLBACK: AbilityUiSpec = { color: '#aaaaaa', icon: 'crown', steps: [] };

export function abilityUi(abilityId: string): AbilityUiSpec {
  return ABILITY_UI[abilityId] ?? FALLBACK;
}

/** 강화 종류 → 아이콘/색 (말 위 배지) */
export const ENHANCEMENT_BY_PIECE: Readonly<Record<string, string>> = {
  p: 'heavyInfantry',
  n: 'lancer',
  r: 'chariot',
  b: 'paladin',
};
