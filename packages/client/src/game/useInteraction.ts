import {
  legalAbilityOptions,
  legalMoves,
  type AbilityParams,
  type Action,
  type GameState,
  type GeneratedMove,
  type Square,
} from '@hyperchess/engine';
import { useEffect, useMemo, useState } from 'react';
import { abilityUi } from '../abilityUi/specs';
import { completedParams, currentStep, stepValues, uiOptions, type Picks } from './targeting';

export interface PendingPromotion {
  readonly from: Square;
  readonly to: Square;
  readonly options: readonly GeneratedMove[];
}

/** canAct: 이 화면의 사용자가 현재 차례를 조작할 수 있는지 (온라인에서 상대 차례면 false) */
export function useInteraction(state: GameState, dispatch: (action: Action) => void, busy: boolean, canAct = true) {
  const [selected, setSelected] = useState<Square | null>(null);
  const [picks, setPicks] = useState<Picks | null>(null);
  const [promotion, setPromotion] = useState<PendingPromotion | null>(null);

  useEffect(() => {
    setSelected(null);
    setPicks(null);
    setPromotion(null);
  }, [state]);

  const ongoing = state.result.kind === 'ongoing' && canAct;
  const moves = useMemo(() => (ongoing ? legalMoves(state) : []), [state, ongoing]);
  const abilityOptions = useMemo(() => (ongoing ? legalAbilityOptions(state) : []), [state, ongoing]);

  const abilityId = state.players[state.turn].abilityId;
  const spec = abilityUi(abilityId ?? '');
  const options = useMemo(() => uiOptions(spec, abilityOptions), [spec, abilityOptions]);
  const step = picks ? currentStep(spec, picks) : null;
  const stepChoices = picks && step ? stepValues(options, picks, step.key) : [];

  const selectedTargets = selected === null ? [] : moves.filter((m) => m.from === selected);
  const targetingSquares = step?.kind === 'square' ? stepChoices.map(Number) : [];
  const pickedSquares = picks
    ? spec.steps.filter((s) => s.kind === 'square' && s.key in picks).map((s) => Number(picks[s.key]))
    : [];

  const activateAbility = (params: AbilityParams) => dispatch({ type: 'ability', params });

  const pick = (key: string, value: number | string) => {
    if (!picks) return;
    const next = { ...picks, [key]: value };
    const params = completedParams(spec, options, next);
    if (params) activateAbility(params);
    else setPicks(next);
  };

  const onSquare = (square: Square) => {
    if (busy || !ongoing) return;

    if (picks) {
      if (step?.kind === 'square' && targetingSquares.includes(square)) pick(step.key, square);
      return;
    }

    const candidates = selectedTargets.filter((m) => m.to === square);
    if (candidates.length > 1) {
      setPromotion({ from: candidates[0].from, to: square, options: candidates });
      return;
    }
    if (candidates.length === 1) {
      dispatch({ type: 'move', move: candidates[0] });
      return;
    }
    const canSelect = moves.some((m) => m.from === square);
    setSelected(canSelect && selected !== square ? square : null);
  };

  const startAbility = () => {
    if (busy || abilityOptions.length === 0) return;
    setSelected(null);
    if (spec.steps.length === 0) {
      activateAbility(abilityOptions[0]);
      return;
    }
    setPicks({});
  };

  return {
    moves,
    abilityOptions,
    selected,
    selectedTargets,
    targeting: picks !== null,
    step,
    stepChoices,
    targetingSquares,
    pickedSquares,
    promotion,
    onSquare,
    startAbility,
    pick,
    cancelAbility: () => setPicks(null),
    choosePromotion: (move: GeneratedMove) => dispatch({ type: 'move', move }),
    cancelPromotion: () => setPromotion(null),
  };
}

export type InteractionController = ReturnType<typeof useInteraction>;
