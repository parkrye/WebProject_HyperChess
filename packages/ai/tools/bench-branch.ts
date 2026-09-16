/** 능력별 사용 후보 수: 탐색이 상위 몇 개만 남기므로 후보가 많을수록 좋은 수를 놓칠 위험이 크다 */
import { applyAction, createGame, legalAbilityOptions, legalMoves, listAbilities, type Action, type GameState } from '@hyperchess/engine';

function seeded(seed: number) {
  let value = seed;
  return () => ((value = (Math.imul(value, 1664525) + 1013904223) >>> 0), value / 4294967296);
}

console.log('능력           평균 후보   최대   후보>4 비율');
for (const ability of listAbilities()) {
  const random = seeded(5);
  const counts: number[] = [];
  for (let g = 0; g < 10; g++) {
    let state: GameState = createGame({ abilities: { w: ability.id, b: ability.id } });
    for (let p = 0; p < 80 && state.result.kind === 'ongoing'; p++) {
      const options = legalAbilityOptions(state);
      if (options.length > 0) counts.push(options.length);
      const moves = legalMoves(state);
      const action: Action =
        options.length > 0 && (moves.length === 0 || random() < 0.25)
          ? { type: 'ability', params: options[Math.floor(random() * options.length)] }
          : { type: 'move', move: moves[Math.floor(random() * moves.length)] };
      state = applyAction(state, action, 0);
    }
  }
  if (counts.length === 0) {
    console.log(`${ability.id.padEnd(14)} (후보 없음)`);
    continue;
  }
  const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
  const over = counts.filter((c) => c > 4).length / counts.length;
  console.log(`${ability.id.padEnd(14)} ${mean.toFixed(1).padStart(8)} ${String(Math.max(...counts)).padStart(6)} ${(over * 100).toFixed(0).padStart(10)}%`);
}
