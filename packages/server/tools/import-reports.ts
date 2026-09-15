/**
 * 밸런스 측정 보고서(reports/*.json)를 대국 기록(data/simulation.jsonl)으로 변환한다.
 * 실행할 때마다 파일을 새로 만들기 때문에 여러 번 실행해도 중복되지 않는다.
 *
 *   npm run import-reports
 */
import { listAbilities } from '@hyperchess/engine';
import type { GameRecord } from '@hyperchess/protocol';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const REPORTS_DIR = join(REPO_ROOT, 'reports');
const DATA_DIR = process.env.HYPERCHESS_DATA ?? fileURLToPath(new URL('../data', import.meta.url));
const OUTPUT = join(DATA_DIR, 'simulation.jsonl');

/**
 * balanceVersion이 기록되기 전 보고서의 버전 (.docs/balance.md 기준).
 * v1~v4는 원본 대국 데이터가 남아 있지 않다.
 */
const LEGACY_VERSIONS: Readonly<Record<string, number>> = {
  'balance-20260914-144709.json': 5,
  'balance-opponent-20260914-145737.json': 6,
  'balance-opponent-20260914-150100.json': 7,
  'balance-opponent-20260914-150721.json': 8,
  'balance-league-20260914-154554.json': 8,
  'balance-league-20260914-161948.json': 9,
  'balance-league-20260914-164101.json': 10,
  'balance-league-20260914-174354.json': 11,
  'balance-league-20260914-183607.json': 12,
  'balance-league-20260914-191116.json': 13,
  'balance-league-20260914-193227.json': 14,
};

interface ReportResult {
  readonly spec: { readonly white: string | null; readonly black: string | null };
  readonly winner: 'w' | 'b' | null;
  readonly reason: string;
  readonly plies: number;
}

interface Report {
  readonly balanceVersion?: number;
  readonly settings: { readonly focus?: readonly string[]; readonly basePath?: string | null };
  readonly results: readonly ReportResult[];
}

const knownAbilities = new Set(listAbilities().map((a) => a.id));
const toAbility = (id: string | null) => (id && knownAbilities.has(id) ? id : null);

/** 파일 이름의 yyyymmdd-hhmmss를 기록 시각으로 쓴다 */
function playedAtOf(file: string): number {
  const match = /(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/.exec(file);
  if (!match) return 0;
  const [, y, mo, d, h, mi, s] = match.map(Number);
  return new Date(y, mo - 1, d, h, mi, s).getTime();
}

function convert(file: string, report: Report, version: number): GameRecord[] {
  const focus = new Set(report.settings.focus ?? []);
  // 부분 재측정 보고서는 focus 능력이 없는 대진을 이전 결과에서 복사해 온 것이라 제외한다
  const partial = !!report.settings.basePath && focus.size > 0;
  const playedAt = playedAtOf(file);

  return report.results
    .filter((r) => !partial || focus.has(r.spec.white ?? '') || focus.has(r.spec.black ?? ''))
    .map((r) => ({
      source: 'simulation',
      balanceVersion: version,
      abilities: { w: toAbility(r.spec.white), b: toAbility(r.spec.black) },
      winner: r.winner,
      reason: r.reason,
      plies: r.plies,
      playedAt,
    }));
}

function main() {
  if (!existsSync(REPORTS_DIR)) {
    console.log(`보고서 폴더가 없습니다: ${REPORTS_DIR}`);
    return;
  }

  const records: GameRecord[] = [];
  for (const file of readdirSync(REPORTS_DIR).filter((name) => name.endsWith('.json')).sort()) {
    const report = JSON.parse(readFileSync(join(REPORTS_DIR, file), 'utf8')) as Report;
    const version = report.balanceVersion ?? LEGACY_VERSIONS[file];
    if (!version) {
      console.log(`  건너뜀 (버전 불명): ${file}`);
      continue;
    }
    const converted = convert(file, report, version);
    records.push(...converted);
    console.log(`  v${version}  ${String(converted.length).padStart(4)}판  ${file}`);
  }

  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(OUTPUT, records.map((r) => JSON.stringify(r)).join('\n') + '\n');
  console.log(`\n총 ${records.length}판 → ${OUTPUT}`);
}

main();
