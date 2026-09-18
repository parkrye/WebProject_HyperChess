/**
 * 대진 단위로 쪼갠 리그전 실행기.
 *
 * 전체 리그전은 몇 시간이 걸려 백그라운드에서 메모리 부족으로 죽는다. 이 실행기는 대진 하나씩
 * 짧게 돌려 결과를 따로 저장하고, 시간 예산이 차면 멈춘다. 다시 부르면 남은 대진부터 이어간다.
 *
 *   node packages/ai/tools/chunked-league.mjs --focus lancer,march,empress [--games 12] [--budget 480] [--workers 3]
 *   node packages/ai/tools/chunked-league.mjs --report --base reports/....json --focus ...
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const REPORTS = join(ROOT, 'reports');
const CHUNKS = join(REPORTS, 'chunks');

const ABILITIES = [
  'telekinesis', 'haste', 'teleport', 'revive', 'rewind', 'heavyInfantry', 'lancer', 'chariot',
  'paladin', 'empress', 'heir', 'alchemy', 'brainwash', 'wall', 'march', 'snipe',
];

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const has = (name) => process.argv.includes(`--${name}`);

const focus = String(arg('focus', '')).split(',').map((s) => s.trim()).filter(Boolean);
const games = Number(arg('games', 12));
const budget = Number(arg('budget', 480));
const workers = Number(arg('workers', 3));

if (focus.length === 0) {
  console.error('--focus 가 필요하다');
  process.exit(1);
}
const unknown = focus.filter((id) => !ABILITIES.includes(id));
if (unknown.length > 0) {
  console.error('모르는 능력: ' + unknown.join(', '));
  process.exit(1);
}

/** focus 능력이 하나라도 낀 대진 (사전순 쌍, 중복 제거) */
function focusPairs() {
  const out = [];
  for (let i = 0; i < ABILITIES.length; i++) {
    for (let j = i + 1; j < ABILITIES.length; j++) {
      const a = ABILITIES[i];
      const b = ABILITIES[j];
      if (focus.includes(a) || focus.includes(b)) out.push([a, b]);
    }
  }
  return out;
}

const chunkName = (a, b) => `${[a, b].sort().join('__')}.json`;

/* ---------- 실행 ---------- */

if (!has('report')) {
  mkdirSync(CHUNKS, { recursive: true });
  const pairs = focusPairs();
  const todo = pairs.filter(([a, b]) => !existsSync(join(CHUNKS, chunkName(a, b))));
  console.log(`대진 ${pairs.length}개 중 남은 것 ${todo.length}개 · 예산 ${budget}초 · 워커 ${workers}`);

  const startedAt = Date.now();
  let done = 0;
  for (const [a, b] of todo) {
    const elapsed = (Date.now() - startedAt) / 1000;
    if (elapsed > budget) {
      console.log(`예산 소진 (${elapsed.toFixed(0)}초). 남은 대진 ${todo.length - done}개`);
      break;
    }
    const before = new Set(readdirSync(REPORTS).filter((n) => n.endsWith('.json')));
    // .cmd 는 셸을 거쳐야 실행된다 (Windows)
    execFileSync(process.execPath, [
      '--import', 'tsx',
      join('packages', 'ai', 'tools', 'balance.ts'),
      '--mode', 'league', '--abilities', `${a},${b}`,
      '--games', String(games), '--depth', '3', '--workers', String(workers), '--yes',
    ], { cwd: ROOT, stdio: 'ignore' });

    const created = readdirSync(REPORTS).filter((n) => n.endsWith('.json') && !before.has(n));
    if (created.length !== 1) throw new Error(`보고서를 찾지 못했다 (${a} vs ${b})`);
    renameSync(join(REPORTS, created[0]), join(CHUNKS, chunkName(a, b)));
    const md = created[0].replace(/\.json$/, '.md');
    if (existsSync(join(REPORTS, md))) renameSync(join(REPORTS, md), join(CHUNKS, md));
    done++;
    console.log(`  ${a} vs ${b} 완료 (${done}/${todo.length}, 누적 ${((Date.now() - startedAt) / 1000).toFixed(0)}초)`);
  }
  const left = todo.length - done;
  console.log(left > 0 ? `아직 ${left}개 남음 — 다시 실행하면 이어간다` : '모든 대진 완료');
  process.exit(left > 0 ? 2 : 0);
}

/* ---------- 집계 ---------- */

const basePath = arg('base', null);
if (!basePath) {
  console.error('--report 에는 --base 가 필요하다');
  process.exit(1);
}

/** 대국 하나에서 각 능력의 점수를 뽑는다 */
function tally(table, result) {
  const { white, black } = result.spec;
  if (white === black) return;
  const score = result.winner === 'w' ? 1 : result.winner === 'b' ? 0 : 0.5;
  for (const [id, s] of [[white, score], [black, 1 - score]]) {
    table[id] ??= { score: 0, games: 0, win: 0, draw: 0, loss: 0, uses: 0, plies: 0 };
    const t = table[id];
    t.score += s;
    t.games++;
    if (s === 1) t.win++;
    else if (s === 0.5) t.draw++;
    else t.loss++;
    t.uses += result.abilityUses?.[id === white ? 'w' : 'b'] ?? 0;
    t.plies += result.plies ?? 0;
  }
}

const involvesFocus = (r) => focus.includes(r.spec.white) || focus.includes(r.spec.black);

const base = JSON.parse(readFileSync(basePath, 'utf8'));
const table = {};
let kept = 0;
for (const r of base.results) {
  if (involvesFocus(r)) continue; // focus 가 낀 대진은 새 측정으로 갈아끼운다
  tally(table, r);
  kept++;
}

let added = 0;
for (const name of readdirSync(CHUNKS).filter((n) => n.endsWith('.json'))) {
  const chunk = JSON.parse(readFileSync(join(CHUNKS, name), 'utf8'));
  for (const r of chunk.results) {
    tally(table, r);
    added++;
  }
}

const rows = Object.entries(table)
  .map(([id, t]) => ({
    id,
    games: t.games,
    rate: t.score / t.games,
    record: `${t.win}-${t.draw}-${t.loss}`,
    uses: t.uses / t.games,
    plies: t.plies / t.games,
  }))
  .sort((a, b) => b.rate - a.rate);

console.log(`기준본에서 가져온 대국 ${kept}판 + 새로 둔 대국 ${added}판`);
console.log('');
console.log('| 능력 | 판 | 승-무-패 | 점수율 | 판당 사용 | 평균 수 |');
console.log('|---|---:|---|---:|---:|---:|');
for (const r of rows) {
  console.log(`| ${r.id} | ${r.games} | ${r.record} | ${(r.rate * 100).toFixed(0)}% | ${r.uses.toFixed(1)} | ${r.plies.toFixed(0)} |`);
}
const out = rows.filter((r) => r.rate < 0.4 || r.rate > 0.6);
console.log('');
console.log(out.length === 0 ? '모든 능력이 40~60% 안에 있다' : '범위 밖: ' + out.map((r) => `${r.id} ${(r.rate * 100).toFixed(0)}%`).join(' · '));
writeFileSync(join(REPORTS, 'chunked-summary.json'), JSON.stringify({ rows, kept, added }, null, 2));
