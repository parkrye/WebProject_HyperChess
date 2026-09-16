/** 평가 함수 처리량 측정: 능력별로 초당 몇 국면을 평가하는지 */
import { applyAction, createGame, legalAbilityOptions, legalMoves, listAbilities, type Action, type GameState } from '@hyperchess/engine';
import { evaluate } from '../src/evaluate';

function seeded(seed: number) {
  let value = seed;
  return () => ((value = (Math.imul(value, 1664525) + 1013904223) >>> 0), value / 4294967296);
}

function positions(abilityId: string, games: number, plies: number): GameState[] {
  const random = seeded(7);
  const out: GameState[] = [];
  for (let g = 0; g < games; g++) {
    let state = createGame({ abilities: { w: abilityId, b: abilityId } });
    for (let p = 0; p < plies && state.result.kind === 'ongoing'; p++) {
      const abilityOptions = legalAbilityOptions(state);
      const moves = legalMoves(state);
      const action: Action =
        abilityOptions.length > 0 && (moves.length === 0 || random() < 0.25)
          ? { type: 'ability', params: abilityOptions[Math.floor(random() * abilityOptions.length)] }
          : { type: 'move', move: moves[Math.floor(random() * moves.length)] };
      state = applyAction(state, action, 0);
      out.push(state);
    }
  }
  return out;
}

const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
for (const abilityId of only.length > 0 ? only : listAbilities().map((a) => a.id)) {
  const states = positions(abilityId, 12, 70);
  for (const state of states.slice(0, 200)) evaluate(state, 'w'); // 워밍업
  const rounds = 30;
  const started = performance.now();
  for (let r = 0; r < rounds; r++) for (const state of states) evaluate(state, 'w');
  const elapsed = performance.now() - started;
  const perSecond = (states.length * rounds) / (elapsed / 1000);
  console.log(`${abilityId.padEnd(13)} ${(perSecond / 1000).toFixed(0).padStart(6)}k 국면/초`);
}
