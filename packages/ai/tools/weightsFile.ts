/**
 * weights.ts 소스를 만드는 곳. tune(학습 결과 적용)과 gate(후보 적용·되돌리기)가 같은 형식을 써야
 * 되돌린 파일이 원본과 한 글자도 다르지 않다.
 */
import { WEIGHT_KEYS } from '../src/features';

export interface WeightModel {
  readonly base: Readonly<Record<string, number>>;
  readonly deltas: Readonly<Record<string, Readonly<Record<string, number>>>>;
}

const keyLiteral = (key: string) => (/^[a-zA-Z]+$/.test(key) ? key : `'${key}'`);

export function renderWeights(model: WeightModel, source: string): string {
  const baseLines = WEIGHT_KEYS.map((key) => `  ${keyLiteral(key)}: ${model.base[key]},`);
  const abilityLines = Object.entries(model.deltas).flatMap(([id, delta]) => [
    `  ${keyLiteral(id)}: {`,
    ...Object.entries(delta).map(([key, value]) => `    ${keyLiteral(key)}: ${value},`),
    '  },',
  ]);
  return [
    '/**',
    ' * 평가 가중치 (센티폰 단위, 폰 = 100 고정).',
    ' * 부호가 있는 값이다: 음수는 감점 항목.',
    ' * tools/tune.ts(Texel 튜닝)의 --apply가 이 파일을 다시 쓴다.',
    ` * 마지막 튜닝: ${source}`,
    ' */',
    'export const WEIGHTS: Readonly<Record<string, number>> = {',
    ...baseLines,
    '};',
    '',
    '/**',
    ' * 능력별 보정값 (공통 가중치에 더한다, 0인 항목은 생략).',
    ' * 그 능력을 가진 진영의 평가에만 쓰인다. tools/tune.ts가 대국 기록으로 학습한다.',
    ' */',
    'export const ABILITY_WEIGHTS: Readonly<Record<string, Readonly<Record<string, number>>>> = {',
    ...abilityLines,
    '};',
    '',
  ].join('\n');
}
