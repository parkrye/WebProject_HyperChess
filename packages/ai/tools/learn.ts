/**
 * 능력별 학습 루프: 대국 수집 → 기록 반영 → 학습(공통 가중치 + 능력별 보정) → 적용을 사이클로 반복한다.
 *
 * 실행
 *   - 루트의 learn.bat 더블클릭
 *   - npm run learn -w @hyperchess/ai -- --games 2 --cycles 10
 *
 * 한 사이클
 *   1. 16종 리그전(대진 120개 × games판)을 새 시드로 둔다 → reports/balance-league-*.json
 *      리그전이라 모든 능력이 같은 판 수만큼 기록된다
 *   2. 보고서를 대국 기록(data/simulation.jsonl)으로 가져온다
 *   3. min-version 이상 기록으로 학습해 후보 가중치를 낸다 (아직 적용하지 않는다)
 *   4. 후보로 동족전을 두어 기준 점수율 이상일 때만 weights.ts에 적용한다
 *      검증 오차가 줄어도 기력은 떨어질 수 있어, 오차만으로는 적용 여부를 정하지 않는다
 *      적용된 가중치는 다음 사이클의 대국에 바로 쓰인다
 *   5. reports/learn-log.md에 사이클 결과를 한 줄씩 남긴다
 *
 * 옵션
 *   --games N          사이클마다 대진당 대국 수, 짝수 권장 (기본 2 → 240판)
 *   --cycles N         반복 횟수 (기본 끝없이, Ctrl+C·창 닫기로 종료)
 *   --cpu P            대국 CPU 사용량 % (기본 50)
 *   --depth N          대국 AI 탐색 깊이 (기본 2)
 *   --min-version N    학습에 쓸 최소 밸런스 버전 (기본 현재 버전)
 *   --epochs N         사이클마다 최대 학습 반복 (기본 300)
 *   --min-games N      학습에 쓸 기록이 이보다 적으면 그 사이클은 수집만 한다 (기본 1500, 적은 데이터로 능력별 보정이 과적합되지 않게)
 *   --ability-l2 X     능력별 보정 벌점 (tune 기본값 사용)
 *   --gate-games N     후보 판정에 쓸 동족전 판 수 (기본 200, 0이면 판정 없이 바로 적용)
 *   --gate-ms N        판정 대국의 수당 시간 (기본 200)
 *   --gate-min X       적용에 필요한 점수율 (기본 0.5 = 나빠지지만 않으면 통과)
 */
import { BALANCE_VERSION } from '@hyperchess/protocol';
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const REPORT_DIR = join(REPO_ROOT, 'reports');
const LOG_FILE = join(REPORT_DIR, 'learn-log.md');
const WEIGHTS_FILE = join(REPO_ROOT, 'packages', 'ai', 'src', 'weights.ts');
const TOOLS = {
  balance: join(REPO_ROOT, 'packages', 'ai', 'tools', 'balance.ts'),
  importReports: join(REPO_ROOT, 'packages', 'server', 'tools', 'import-reports.ts'),
  tune: join(REPO_ROOT, 'packages', 'ai', 'tools', 'tune.ts'),
  gate: join(REPO_ROOT, 'packages', 'ai', 'tools', 'gate.ts'),
};

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
const numberArg = (name: string, fallback: number) => {
  const raw = argValue(name);
  const value = Number(raw);
  return raw !== undefined && Number.isFinite(value) ? value : fallback;
};

const settings = {
  games: numberArg('games', 2),
  cycles: numberArg('cycles', Infinity),
  cpu: numberArg('cpu', 50),
  depth: numberArg('depth', 2),
  minVersion: numberArg('min-version', BALANCE_VERSION),
  epochs: numberArg('epochs', 300),
  minGames: numberArg('min-games', 1500),
  abilityL2: argValue('ability-l2'),
  gateGames: numberArg('gate-games', 200),
  gateMs: numberArg('gate-ms', 200),
  gateMin: argValue('gate-min') ?? '0.5',
};

/** 같은 tsx 로더로 하위 도구를 실행한다 (진행 표시는 그대로 콘솔에 보인다) */
function runTool(script: string, args: readonly string[]): void {
  const status = runToolStatus(script, args);
  if (status !== 0) throw new Error(`${relative(REPO_ROOT, script)} 실패 (종료 코드 ${status})`);
}

/** 종료 코드를 그대로 돌려준다. 판정 탈락(2)은 오류가 아니라 정상적인 결과다 */
function runToolStatus(script: string, args: readonly string[]): number {
  const result = spawnSync(process.execPath, ['--import', 'tsx', script, ...args], { cwd: REPO_ROOT, stdio: 'inherit' });
  return result.status ?? 1;
}

function latestReport(prefix: string): string | null {
  if (!existsSync(REPORT_DIR)) return null;
  const files = readdirSync(REPORT_DIR)
    .filter((name) => name.startsWith(prefix) && name.endsWith('.json'))
    .map((name) => join(REPORT_DIR, name));
  if (files.length === 0) return null;
  return files.reduce((a, b) => (statSync(a).mtimeMs >= statSync(b).mtimeMs ? a : b));
}

interface TuneSummary {
  readonly games: { readonly used: number };
  readonly before: { readonly valid: number };
  readonly after: { readonly valid: number };
}

function appendLog(line: string): void {
  if (!existsSync(LOG_FILE)) {
    appendFileSync(
      LOG_FILE,
      [
        '# 능력별 학습 기록',
        '',
        '사이클마다 새로 둔 대국을 더해 학습하고, 검증 오차가 줄었을 때만 가중치를 적용한다.',
        '',
        '| 시각 | 사이클 | 새 대국 | 학습 기록(판) | 검증 오차 | 적용 | 튜닝 보고서 |',
        '|---|---|---|---|---|---|---|',
        '',
      ].join('\n'),
    );
  }
  appendFileSync(LOG_FILE, `${line}\n`);
}

async function main() {
  // 실행마다 시드 라운드를 바꿔 이전 세션과 같은 대국이 나오지 않게 한다
  const seedBase = Math.floor(Date.now() / 1000) % 1_000_000;
  console.log(`능력별 학습 루프 · 사이클당 대진 120개 × ${settings.games}판 · 학습 기록 v${settings.minVersion} 이상 · 기록: ${relative(REPO_ROOT, LOG_FILE)}`);

  for (let cycle = 1; cycle <= settings.cycles; cycle++) {
    const startedAt = Date.now();
    console.log(`\n===== 사이클 ${cycle} =====\n`);

    console.log('[1/4] 대국 수집');
    runTool(TOOLS.balance, [
      '--mode', 'league', '--abilities', 'all', '--games', String(settings.games),
      '--depth', String(settings.depth), '--cpu', String(settings.cpu),
      '--seed-round', String(seedBase + cycle * 1000), '--yes',
    ]);

    console.log('\n[2/4] 기록 반영');
    runTool(TOOLS.importReports, []);

    console.log('\n[3/4] 학습');
    const weightsBefore = readFileSync(WEIGHTS_FILE, 'utf8');
    // 바로 적용하지 않고 후보만 낸다 (--yes = 보고서만 쓰고 적용하지 않음)
    runTool(TOOLS.tune, [
      '--yes', '--min-version', String(settings.minVersion), '--epochs', String(settings.epochs), '--min-games', String(settings.minGames),
      ...(settings.abilityL2 ? ['--ability-l2', settings.abilityL2] : []),
    ]);
    const tunePath = latestReport('tune-');

    console.log(`\n[4/4] 후보 판정 (동족전)`);
    if (tunePath && statSync(tunePath).mtimeMs >= startedAt) {
      // 판정에서 떨어지면 gate가 가중치를 되돌린다. 탈락은 오류가 아니라 정상적인 결과다
      runToolStatus(TOOLS.gate, [tunePath, '--games', String(settings.gateGames), '--ms', String(settings.gateMs), '--min', settings.gateMin]);
    } else {
      console.log('  새 후보가 없어 건너뜁니다');
    }
    const applied = readFileSync(WEIGHTS_FILE, 'utf8') !== weightsBefore;
    const tune = tunePath && statSync(tunePath).mtimeMs >= startedAt ? (JSON.parse(readFileSync(tunePath, 'utf8')) as TuneSummary) : null;
    const time = new Date().toLocaleString('ko-KR');
    const error = tune ? `${tune.before.valid.toFixed(5)} → ${tune.after.valid.toFixed(5)}` : `기록 ${settings.minGames}판 미만, 수집만`;
    const report = tunePath && tune ? relative(REPO_ROOT, tunePath).split('\\').join('/').replace(/\.json$/, '.md') : '-';
    appendLog(`| ${time} | ${cycle} | ${120 * settings.games} | ${tune?.games.used ?? '-'} | ${error} | ${applied ? '적용' : '-'} | ${report} |`);
    console.log(`\n사이클 ${cycle} 완료 · ${Math.round((Date.now() - startedAt) / 60000)}분 · 가중치 ${applied ? '적용됨' : '변경 없음'}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
