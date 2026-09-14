import type { AbilityParams } from '@hyperchess/engine';
import type { AbilityUiSpec, TargetStep } from '../abilityUi/specs';

export type Picks = Readonly<Record<string, number | string>>;

export function matchingOptions(options: readonly AbilityParams[], picks: Picks): AbilityParams[] {
  return options.filter((option) => Object.entries(picks).every(([key, value]) => String(option[key]) === String(value)));
}

export function currentStep(spec: AbilityUiSpec, picks: Picks): TargetStep | null {
  return spec.steps.find((step) => !(step.key in picks)) ?? null;
}

export function stepValues(options: readonly AbilityParams[], picks: Picks, key: string): (number | string)[] {
  const values = new Map<string, number | string>();
  for (const option of matchingOptions(options, picks)) {
    const value = option[key];
    if (value !== undefined) values.set(String(value), value);
  }
  return [...values.values()];
}

export function uiOptions(spec: AbilityUiSpec, options: AbilityParams[]): AbilityParams[] {
  return spec.expandOptions ? spec.expandOptions(options) : options;
}

/** 모든 단계를 골랐을 때 엔진에 보낼 파라미터. 아직이면 null */
export function completedParams(spec: AbilityUiSpec, options: readonly AbilityParams[], picks: Picks): AbilityParams | null {
  if (currentStep(spec, picks)) return null;
  const match = matchingOptions(options, picks)[0];
  if (!match) return null;
  return spec.normalize ? spec.normalize(match) : match;
}
