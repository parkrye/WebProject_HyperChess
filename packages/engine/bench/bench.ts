import { applyAction, createGame, legalMoves, type GameState } from '../src';

function perft(state: GameState, depth: number): number {
  const moves = legalMoves(state);
  if (depth === 1) return moves.length;
  let nodes = 0;
  for (const m of moves) nodes += perft(applyAction(state, { type: 'move', move: m }), depth - 1);
  return nodes;
}

const kiwipete = createGame({ fen: 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1' });
const start = performance.now();
const nodes = perft(kiwipete, 3);
const ms = performance.now() - start;
console.log(`kiwipete d3 nodes=${nodes} ${ms.toFixed(0)}ms`);

{
  const positions: GameState[] = [];
  const collect = (state: GameState, depth: number) => {
    for (const m of legalMoves(state)) {
      const next = applyAction(state, { type: 'move', move: m });
      positions.push(state);
      if (depth > 1) collect(next, depth - 1);
    }
  };
  collect(kiwipete, 2);
  const t0 = performance.now();
  let applied = 0;
  for (const state of positions) {
    const m = legalMoves(state)[0];
    if (m) { applyAction(state, { type: 'move', move: m }); applied++; }
  }
  const t1 = performance.now();
  for (const state of positions) legalMoves(state);
  const t2 = performance.now();
  console.log(`applyAction(+legalMoves) x${applied}: ${(t1 - t0).toFixed(0)}ms, legalMoves x${positions.length}: ${(t2 - t1).toFixed(0)}ms`);
}
