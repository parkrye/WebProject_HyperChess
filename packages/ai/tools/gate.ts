/**
 * 가중치 후보 판정: 후보를 적용해 동족전을 두고, 기준 점수율에 못 미치면 되돌린다.
 *
 * 검증 오차(MSE)가 줄었다는 것은 기력이 올랐다는 뜻이 아니다. 목적함수가 "기록된 대국의 승패를
 * 맞히는 것"이라 잘 두는 것과 갈라지고, 실제로 오차가 줄어 자동 적용된 가중치가 전반적으로
 * 약해진 적이 있다. 그래서 적용 여부는 대국으로 판정한다.
 *
 * 사용: npx tsx tools/gate.ts reports/tune-....json [--games 200] [--ms 200] [--min 0.5]
 */
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderWeights, type WeightModel } from './weightsFile';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const AI_ROOT = join(REPO_ROOT, 'packages', 'ai');
const WEIGHTS_FILE = join(AI_ROOT, 'src', 'weights.ts');
const BASELINE_DIR = join(AI_ROOT, 'tools', 'baseline');
const VERSUS = join(AI_ROOT, 'tools', 'versus.ts');
/** 기준본이 스스로 돌아가는 데 필요한 파일들 (src와 같은 상대 경로로 서로를 import 한다) */
const BASELINE_FILES = ['search.ts', 'evaluate.ts', 'features.ts', 'abilityFeatures.ts'] as const;

const numberArg = (name: string, fallback: number) => {
  const index = process.argv.indexOf(`--${name}`);
  const value = Number(process.argv[index + 1]);
  return index >= 0 && Number.isFinite(value) ? value : fallback;
};

const reportPath = process.argv[2];
if (!reportPath || !existsSync(reportPath)) {
  console.error('튜닝 보고서 JSON 경로가 필요합니다: npx tsx tools/gate.ts reports/tune-....json');
  process.exit(1);
}

const settings = {
  games: numberArg('games', 200),
  ms: numberArg('ms', 200),
  min: numberArg('min', 0.5),
};

const report = JSON.parse(readFileSync(reportPath, 'utf8')) as { tuned: WeightModel };
const candidate = renderWeights(report.tuned, relative(REPO_ROOT, reportPath).split('\\').join('/').replace(/\.json$/, '.md'));
const current = readFileSync(WEIGHTS_FILE, 'utf8');

if (candidate.split('\r\n').join('\n') === current.split('\r\n').join('\n')) {
  console.log('후보가 현재 가중치와 같습니다. 판정할 것이 없습니다.');
  process.exit(0);
}

if (settings.games <= 0) {
  writeFileSync(WEIGHTS_FILE, candidate);
  console.log('--games 0 이라 판정 없이 적용했습니다.');
  process.exit(0);
}

// 기준본 = 지금 가중치. 현재 코드로 맞춰 두어야 가중치 말고는 차이가 없다
mkdirSync(BASELINE_DIR, { recursive: true });
for (const name of BASELINE_FILES) copyFileSync(join(AI_ROOT, 'src', name), join(BASELINE_DIR, name));
writeFileSync(join(BASELINE_DIR, 'weights.ts'), current);

writeFileSync(WEIGHTS_FILE, candidate);
console.log(`후보 적용 후 동족전 ${settings.games}판 (수당 ${settings.ms}ms) · 기준 점수율 ${(settings.min * 100).toFixed(0)}%\n`);

const summaryPath = join(REPO_ROOT, 'reports', `gate-${Date.now()}.json`);
const result = spawnSync(
  process.execPath,
  ['--import', 'tsx', VERSUS, '--games', String(settings.games), '--ms', String(settings.ms), '--mirror', '--json', summaryPath],
  { cwd: AI_ROOT, stdio: 'inherit' },
);

const rollback = (reason: string) => {
  writeFileSync(WEIGHTS_FILE, current);
  console.log(`\n${reason} · 가중치를 되돌렸습니다.`);
};

if (result.status !== 0 || !existsSync(summaryPath)) {
  rollback('대국 실행 실패');
  process.exit(1);
}

const summary = JSON.parse(readFileSync(summaryPath, 'utf8')) as { scoreRate: number };
unlinkSync(summaryPath);

if (summary.scoreRate >= settings.min) {
  console.log(`\n점수율 ${(summary.scoreRate * 100).toFixed(1)}% ≥ 기준 ${(settings.min * 100).toFixed(0)}% · 후보를 적용했습니다.`);
  process.exit(0);
}
rollback(`점수율 ${(summary.scoreRate * 100).toFixed(1)}% < 기준 ${(settings.min * 100).toFixed(0)}%`);
process.exit(2);
