/**
 * AI로 생성한 아트·BGM 원본을 게임용 에셋으로 가공한다.
 *
 * 사용: npm run import-assets -w @hyperchess/client -- --src "C:/Users/me/Downloads" [--only extra]
 *   --src 폴더 아래 sprites/ (png), bgms/ (mp3) 를 읽어 public/assets/ 에 쓴다.
 *   --only extra: 추가 능력 시트(아이콘·성벽·이펙트)만 가공한다
 *
 * 처리 내용
 *   - 그리드 시트: 셀마다 실제 그림 영역을 찾아 잘라내고 같은 배율로 맞춘다
 *   - 배경 제거 흔적: 반투명 후광을 걷어내고(알파 이진화), 본체와 떨어진 작은 노이즈 조각을 지운다
 *   - 보드 테두리: 안쪽 투명 구멍의 위치를 측정해 frame.json 으로 저장한다
 */
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const CLIENT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(CLIENT_ROOT, 'public', 'assets');

const argIndex = process.argv.indexOf('--src');
const SRC = argIndex >= 0 ? process.argv[argIndex + 1] : join(process.env.USERPROFILE ?? '', 'Downloads');
const SPRITES = join(SRC, 'sprites');
const BGMS = join(SRC, 'bgms');
const onlyIndex = process.argv.indexOf('--only');
const ONLY = onlyIndex >= 0 ? process.argv[onlyIndex + 1] : null;

/* ---------- 원시 이미지 도우미 ---------- */

async function load(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

function crop(img, x, y, w, h) {
  const data = Buffer.alloc(w * h * 4);
  for (let row = 0; row < h; row++) {
    const from = ((y + row) * img.width + x) * 4;
    img.data.copy(data, row * w * 4, from, from + w * 4);
  }
  return { data, width: w, height: h };
}

/** 반투명 픽셀 제거: threshold 미만은 완전 투명, 이상은 불투명 */
function binarizeAlpha(img, threshold = 150) {
  for (let i = 3; i < img.data.length; i += 4) img.data[i] = img.data[i] >= threshold ? 255 : 0;
  return img;
}

/** 불투명 영역을 연결 요소로 나눠, 가장 큰 조각 대비 minRatio 미만인 조각을 지운다 */
function removeSpecks(img, minRatio) {
  const { width, height, data } = img;
  const label = new Int32Array(width * height).fill(-1);
  const sizes = [];
  const stack = [];
  for (let start = 0; start < width * height; start++) {
    if (label[start] !== -1 || data[start * 4 + 3] === 0) continue;
    const id = sizes.length;
    let size = 0;
    label[start] = id;
    stack.push(start);
    while (stack.length) {
      const p = stack.pop();
      size++;
      const x = p % width;
      const y = (p - x) / width;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const q = ny * width + nx;
        if (label[q] === -1 && data[q * 4 + 3] !== 0) {
          label[q] = id;
          stack.push(q);
        }
      }
    }
    sizes.push(size);
  }
  const largest = Math.max(0, ...sizes);
  for (let p = 0; p < width * height; p++) {
    if (label[p] >= 0 && sizes[label[p]] < largest * minRatio) data[p * 4 + 3] = 0;
  }
  return img;
}

function opaqueBounds(img) {
  let minX = img.width, minY = img.height, maxX = -1, maxY = -1;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (img.data[(y * img.width + x) * 4 + 3] === 0) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return maxX < 0 ? null : { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

const toSharp = (img) => sharp(img.data, { raw: { width: img.width, height: img.height, channels: 4 } });

/**
 * 그리드 시트를 셀 단위로 가공한다.
 * 모든 셀에 같은 배율을 적용해 그림 크기 비율을 유지하고, size×size 캔버스에 배치한다.
 */
async function sliceSheet({ file, cols, rows, names, size, padding = 0.06, align = 'bottom', minSpeckRatio = 0.05, alphaThreshold = 150, byContent = false }) {
  const sheet = await load(join(SPRITES, file));
  const rects = byContent ? contentGrid(sheet, cols, rows, alphaThreshold) : uniformGrid(sheet, cols, rows);
  const cells = [];

  for (let index = 0; index < cols * rows; index++) {
    const name = names[index];
    if (!name) continue;
    const { x, y, w, h } = rects[index];
    const cell = crop(sheet, x, y, w, h);
    removeSpecks(binarizeAlpha(cell, alphaThreshold), minSpeckRatio);
    const bounds = opaqueBounds(cell);
    if (!bounds) throw new Error(`${file} ${name}: 빈 셀`);
    cells.push({ name, img: crop(cell, bounds.x, bounds.y, bounds.w, bounds.h) });
  }

  const maxSide = Math.max(...cells.map(({ img }) => Math.max(img.width, img.height)));
  const scale = (size * (1 - padding * 2)) / maxSide;

  for (const { name, img } of cells) {
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const resized = await toSharp(img).resize(w, h, { kernel: 'lanczos3' }).raw().toBuffer();
    const piece = binarizeAlpha({ data: resized, width: w, height: h }, 128);
    const left = Math.round((size - w) / 2);
    const top = align === 'bottom' ? Math.round(size * (1 - padding) - h) : Math.round((size - h) / 2);
    await sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: piece.data, raw: { width: w, height: h, channels: 4 }, left, top }])
      .png({ compressionLevel: 9 })
      .toFile(join(OUT, `${name}.png`));
  }
  console.log(`  ${file}: ${cells.length}개`);
}

function uniformGrid(sheet, cols, rows) {
  const cellW = sheet.width / cols;
  const cellH = sheet.height / rows;
  return Array.from({ length: cols * rows }, (_, index) => ({
    x: Math.round((index % cols) * cellW),
    y: Math.round(Math.floor(index / cols) * cellH),
    w: Math.floor(cellW),
    h: Math.floor(cellH),
  }));
}

/** 그림이 있는 줄·칸 구간. 빈 틈이 가장 좁은 곳부터 합쳐 count개로 맞춘다 */
function contentRuns(counts, count) {
  const runs = [];
  counts.forEach((value, i) => {
    const last = runs[runs.length - 1];
    if (value === 0) return;
    if (last && last.end === i - 1) last.end = i;
    else runs.push({ start: i, end: i });
  });
  while (runs.length > count) {
    let merge = 0;
    for (let i = 1; i < runs.length - 1; i++) {
      if (runs[i + 1].start - runs[i].end < runs[merge + 1].start - runs[merge].end) merge = i;
    }
    runs.splice(merge, 2, { start: runs[merge].start, end: runs[merge + 1].end });
  }
  if (runs.length !== count) throw new Error(`그림 구간이 ${runs.length}개라 ${count}개로 나눌 수 없음`);
  return runs;
}

/**
 * 셀 간격이 고르지 않거나 그림이 셀 경계를 넘는 시트: 실제 그림 구간을 찾아
 * 구간 사이 빈 틈의 가운데를 경계로 삼는다
 */
function contentGrid(sheet, cols, rows, alphaThreshold) {
  const colCounts = new Array(sheet.width).fill(0);
  const rowCounts = new Array(sheet.height).fill(0);
  for (let y = 0; y < sheet.height; y++) {
    for (let x = 0; x < sheet.width; x++) {
      if (sheet.data[(y * sheet.width + x) * 4 + 3] < alphaThreshold) continue;
      colCounts[x]++;
      rowCounts[y]++;
    }
  }
  const edges = (runs, length) =>
    runs.map((run, i) => ({
      start: i === 0 ? 0 : Math.floor((runs[i - 1].end + run.start) / 2),
      end: i === runs.length - 1 ? length : Math.floor((run.end + runs[i + 1].start) / 2),
    }));
  const xs = edges(contentRuns(colCounts, cols), sheet.width);
  const ys = edges(contentRuns(rowCounts, rows), sheet.height);
  return Array.from({ length: cols * rows }, (_, index) => {
    const cx = xs[index % cols];
    const cy = ys[Math.floor(index / cols)];
    return { x: cx.start, y: cy.start, w: cx.end - cx.start, h: cy.end - cy.start };
  });
}

/** 가로 스트립(프레임 애니메이션): 행마다 frames개의 셀을 frameSize 정사각형으로 이어 붙인다 */
/** 그림 영역 중심에 맞춘 정사각형으로 자른다 (넘치는 곳은 투명) */
function squareAroundContent(img) {
  const bounds = opaqueBounds(img) ?? { x: 0, y: 0, w: img.width, h: img.height };
  const side = Math.max(bounds.w, bounds.h);
  const left = Math.round(bounds.x + bounds.w / 2 - side / 2);
  const top = Math.round(bounds.y + bounds.h / 2 - side / 2);
  const data = Buffer.alloc(side * side * 4);
  for (let y = 0; y < side; y++) {
    const sy = top + y;
    if (sy < 0 || sy >= img.height) continue;
    for (let x = 0; x < side; x++) {
      const sx = left + x;
      if (sx < 0 || sx >= img.width) continue;
      img.data.copy(data, (y * side + x) * 4, (sy * img.width + sx) * 4, (sy * img.width + sx) * 4 + 4);
    }
  }
  return { data, width: side, height: side };
}

/**
 * order: 행마다 원본 칸 순서를 재배치 (생성 모델이 완성 컷을 첫 칸에 두는 경우)
 * byContent면 행 안의 모든 프레임을 같은 크기 정사각형으로 맞춰 크기 변화가 유지되게 한다
 */
async function sliceStrips({ file, cols, rows, names, frameSize, alphaThreshold = 160, minSpeckRatio = 0.08, byContent = false, order = null }) {
  const sheet = await load(join(SPRITES, file));
  const rects = byContent ? contentGrid(sheet, cols, rows, alphaThreshold) : uniformGrid(sheet, cols, rows);
  for (let row = 0; row < rows; row++) {
    const frames = [];
    for (let col = 0; col < cols; col++) {
      const { x, y, w, h } = rects[row * cols + (order ? order[row][col] : col)];
      const cell = crop(sheet, x, y, w, h);
      removeSpecks(binarizeAlpha(cell, alphaThreshold), minSpeckRatio);
      const square = byContent
        ? squareAroundContent(cell)
        : crop(cell, Math.floor((cell.width - Math.min(cell.width, cell.height)) / 2), Math.floor((cell.height - Math.min(cell.width, cell.height)) / 2), Math.min(cell.width, cell.height), Math.min(cell.width, cell.height));
      frames.push(square);
    }
    // 한 행의 프레임은 가장 큰 프레임 기준 같은 배율로 줄인다 (작은 프레임은 가운데 배치)
    const maxSide = Math.max(...frames.map((f) => f.width));
    const buffers = [];
    for (const frame of frames) {
      const scaled = Math.max(1, Math.round((frame.width / maxSide) * frameSize));
      const resized = await toSharp(frame).resize(scaled, scaled, { kernel: 'lanczos3' }).png().toBuffer();
      const offset = Math.floor((frameSize - scaled) / 2);
      buffers.push(await sharp({ create: { width: frameSize, height: frameSize, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([{ input: resized, left: offset, top: offset }]).png().toBuffer());
    }
    await sharp({ create: { width: frameSize * cols, height: frameSize, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite(buffers.map((input, col) => ({ input, left: col * frameSize, top: 0 })))
      .png({ compressionLevel: 9 })
      .toFile(join(OUT, `${names[row]}.png`));
  }
  console.log(`  ${file}: 스트립 ${rows}개`);
}

/**
 * 보드 테두리의 안쪽 투명 구멍을 측정한다.
 * 변 가운데의 장식(하트)을 피하려고 여러 줄을 훑어 가장 얇은 두께를 쓴다.
 */
function measureFrameHole(img) {
  const alphaAt = (x, y) => img.data[(y * img.width + x) * 4 + 3];
  const scan = (length, at) => {
    let i = 0;
    while (i < length && at(i) === 0) i++; // 바깥 투명
    while (i < length && at(i) !== 0) i++; // 테두리
    return i;
  };
  const positions = [0.3, 0.38, 0.62, 0.7];
  const thinnest = (measure) => Math.min(...positions.map(measure));
  const left = thinnest((p) => scan(img.width, (x) => alphaAt(x, Math.floor(img.height * p))));
  const right = thinnest((p) => scan(img.width, (x) => alphaAt(img.width - 1 - x, Math.floor(img.height * p))));
  const top = thinnest((p) => scan(img.height, (y) => alphaAt(Math.floor(img.width * p), y)));
  const bottom = thinnest((p) => scan(img.height, (y) => alphaAt(Math.floor(img.width * p), img.height - 1 - y)));
  return { left: left / img.width, right: right / img.width, top: top / img.height, bottom: bottom / img.height };
}

/* ---------- 실행 ---------- */

/** 추가 능력(연금술·세뇌·성벽·총진군·저격) 시트. 셀 간격이 고르지 않아 그림 구간 기준으로 자른다 */
async function importExtraAbilities() {
  await sliceSheet({
    file: '추가 능력 아이콘.png', cols: 5, rows: 1, size: 128, padding: 0.03, align: 'center', byContent: true,
    names: ['alchemy', 'brainwash', 'wall', 'march', 'snipe'].map((n) => `icons/${n}`),
  });
  await sliceSheet({
    file: '성벽 오브젝트.png', cols: 4, rows: 1, size: 256, byContent: true, minSpeckRatio: 0.002,
    names: ['wall', 'wall-cracked', 'wall-collapse', 'wall-rubble'].map((n) => `board/${n}`),
  });
  await sliceStrips({
    file: '추가 능력 이펙트 스프라이트.png', cols: 5, rows: 4, frameSize: 192, alphaThreshold: 110, minSpeckRatio: 0.01, byContent: true,
    names: ['fx/sigil', 'fx/hypnosis', 'fx/crosshair', 'fx/dust'],
    // 첫 칸이 완성 컷이라 등장 → 절정 → 소멸 순으로 재배치
    order: [[1, 2, 0, 3, 4], [1, 2, 3, 0, 4], [1, 0, 2, 3, 4], [1, 0, 2, 3, 4]],
  });
}

async function main() {
  if (!existsSync(SPRITES)) throw new Error(`스프라이트 폴더가 없습니다: ${SPRITES}`);
  for (const dir of ['', 'pieces', 'icons', 'badges', 'ui', 'fx', 'board', 'bg', 'bgm']) mkdirSync(join(OUT, dir), { recursive: true });
  console.log(`원본: ${SRC}`);
  if (ONLY === 'extra') {
    await importExtraAbilities();
    return;
  }

  await sliceSheet({
    file: '기본 말 + 왕족 상태.png', cols: 4, rows: 4, size: 256,
    names: ['w-k', 'w-q', 'w-r', 'w-b', 'w-n', 'w-p', 'b-k', 'b-q', 'b-r', 'b-b', 'b-n', 'b-p', 'w-oldking', 'b-oldking', 'w-promoted', 'b-promoted'].map((n) => `pieces/${n}`),
  });
  await sliceSheet({
    file: '변종(강화) 말.png', cols: 4, rows: 4, size: 256, alphaThreshold: 200, minSpeckRatio: 0.12,
    names: ['w-heavyInfantry', 'w-lancer', 'w-chariot', 'w-paladin', 'w-heir', 'w-empress-q', 'w-empress-k', null, 'b-heavyInfantry', 'b-lancer', 'b-chariot', 'b-paladin', 'b-heir', 'b-empress-q', 'b-empress-k', null].map((n) => n && `pieces/${n}`),
  });
  await sliceSheet({
    file: '능력 아이콘.png', cols: 4, rows: 4, size: 128, padding: 0.03, align: 'center',
    names: ['telekinesis', 'haste', 'teleport', 'revive', 'rewind', 'heavyInfantry', 'lancer', 'chariot', 'paladin', 'empress', 'heir', 'none', 'random', 'settings', 'flip', 'exit'].map((n) => `icons/${n}`),
  });
  await sliceSheet({
    file: '보드 표식·말 배지.png', cols: 4, rows: 4, size: 96, padding: 0.03, align: 'center',
    names: [null, null, null, null, null, null, null, null, 'shield', 'lance', 'wheel', 'cross', 'empress', 'heir', 'oldking', 'promoted'].map((n) => n && `badges/${n}`),
  });
  await sliceSheet({
    file: '버튼·패널·게이지.png', cols: 4, rows: 4, size: 64, padding: 0.04, align: 'center',
    names: [null, null, null, null, null, null, null, null, 'gem-empty', 'gem-full', null, null, null, null, null, null].map((n) => n && `ui/${n}`),
  });
  await sliceSheet({
    file: '플레이 타이머 UI.png', cols: 4, rows: 4, size: 96, padding: 0.04, align: 'center',
    names: [null, null, null, null, null, null, null, null, null, null, null, 'hourglass', null, null, null, null].map((n) => n && `ui/${n}`),
  });
  await sliceStrips({
    file: '능력 이펙트 스프라이트.png', cols: 5, rows: 4, frameSize: 192,
    names: ['fx/burst', 'fx/ring', 'fx/pillar', 'fx/crown'],
  });
  await importExtraAbilities();

  // 로고: 후광 제거, 떨어진 반짝이는 유지
  const logo = removeSpecks(binarizeAlpha(await load(join(SPRITES, '로고.png')), 170), 0.0004);
  const logoBounds = opaqueBounds(logo);
  await toSharp(crop(logo, logoBounds.x, logoBounds.y, logoBounds.w, logoBounds.h)).resize({ width: 1200 }).png({ compressionLevel: 9 }).toFile(join(OUT, 'ui/logo.png'));
  console.log('  로고');

  // 보드·테두리
  await sharp(join(SPRITES, '보드.png')).resize(1024, 1024, { kernel: 'lanczos3' }).webp({ quality: 90 }).toFile(join(OUT, 'board/board.webp'));
  const frame = binarizeAlpha(await load(join(SPRITES, '보드 테두리.png')), 140);
  const hole = measureFrameHole(frame);
  await toSharp(frame).resize(1024, 1024, { kernel: 'lanczos3' }).png({ compressionLevel: 9 }).toFile(join(OUT, 'board/frame.png'));
  writeFileSync(join(OUT, 'board/frame.json'), JSON.stringify(hole, null, 2));
  console.log('  보드·테두리 (구멍 비율)', hole);

  // 배경
  const backgrounds = [['타이틀·메뉴 배경.png', 'title'], ['대국 화면 배경.png', 'game'], ['모바일 세로 배경.png', 'mobile']];
  for (const [file, name] of backgrounds) {
    await sharp(join(SPRITES, file)).webp({ quality: 82 }).toFile(join(OUT, `bg/${name}.webp`));
  }
  console.log('  배경 3종');

  // BGM
  const tracks = [['타이틀 테마.mp3', 'title'], ['로비·대기실 테마.mp3', 'lobby'], ['대국 기본 테마.mp3', 'battle'], ['긴장 테마.mp3', 'tension'], ['승리 테마.mp3', 'victory'], ['패배·무승부 테마.mp3', 'defeat']];
  for (const [file, name] of tracks) {
    if (existsSync(join(BGMS, file))) copyFileSync(join(BGMS, file), join(OUT, `bgm/${name}.mp3`));
    else console.warn(`  BGM 없음: ${file}`);
  }
  console.log('  BGM');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
