import type { AbilityParams } from '@hyperchess/engine';
import type { AbilityUiSpec, TargetStep } from '../abilityUi/specs';

export type Picks = Readonly<Record<string, number | string>>;

export function matchingOptions(options: readonly AbilityParams[], picks: Picks): AbilityParams[] {
  return options.filter((option) => Object.entries(picks).every(([key, value]) => String(option[key]) === String(value)));
}

/** 아직 고르지 않은 첫 단계. options를 주면 남은 선택지에 값이 없는 선택 단계는 건너뛴다 */
export function currentStep(spec: AbilityUiSpec, picks: Picks, options?: readonly AbilityParams[]): TargetStep | null {
  return (
    spec.steps.find((step) => {
      if (step.key in picks) return false;
      return !(step.optional && options && stepValues(options, picks, step.key).length === 0);
    }) ?? null
  );
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
  if (currentStep(spec, picks, options)) return null;
  const match = matchingOptions(options, picks).find((option) => spec.steps.every((step) => step.key in picks || option[step.key] === undefined));
  if (!match) return null;
  return spec.normalize ? spec.normalize(match) : match;
}
