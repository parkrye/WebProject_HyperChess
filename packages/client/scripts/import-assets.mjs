/**
 * AI로 생성한 아트·BGM 원본을 게임용 에셋으로 가공한다.
 *
 * 사용: npm run import-assets -w @hyperchess/client -- --src "C:/Users/me/Downloads"
 *   --src 폴더 아래 sprites/ (png), bgms/ (mp3) 를 읽어 public/assets/ 에 쓴다.
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
async function sliceSheet({ file, cols, rows, names, size, padding = 0.06, align = 'bottom', minSpeckRatio = 0.05, alphaThreshold = 150 }) {
  const sheet = await load(join(SPRITES, file));
  const cellW = sheet.width / cols;
  const cellH = sheet.height / rows;
  const cells = [];

  for (let index = 0; index < cols * rows; index++) {
    const name = names[index];
    if (!name) continue;
    const col = index % cols;
    const row = Math.floor(index / cols);
    const cell = crop(sheet, Math.round(col * cellW), Math.round(row * cellH), Math.floor(cellW), Math.floor(cellH));
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

/** 가로 스트립(프레임 애니메이션): 행마다 frames개의 셀을 frameSize 정사각형으로 이어 붙인다 */
async function sliceStrips({ file, cols, rows, names, frameSize, alphaThreshold = 160, minSpeckRatio = 0.08 }) {
  const sheet = await load(join(SPRITES, file));
  const cellW = sheet.width / cols;
  const cellH = sheet.height / rows;
  for (let row = 0; row < rows; row++) {
    const frames = [];
    for (let col = 0; col < cols; col++) {
      const cell = crop(sheet, Math.round(col * cellW), Math.round(row * cellH), Math.floor(cellW), Math.floor(cellH));
      removeSpecks(binarizeAlpha(cell, alphaThreshold), minSpeckRatio);
      const side = Math.min(cell.width, cell.height);
      const square = crop(cell, Math.floor((cell.width - side) / 2), Math.floor((cell.height - side) / 2), side, side);
      frames.push(await toSharp(square).resize(frameSize, frameSize, { kernel: 'lanczos3' }).png().toBuffer());
    }
    await sharp({ create: { width: frameSize * cols, height: frameSize, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite(frames.map((input, col) => ({ input, left: col * frameSize, top: 0 })))
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

async function main() {
  if (!existsSync(SPRITES)) throw new Error(`스프라이트 폴더가 없습니다: ${SPRITES}`);
  for (const dir of ['', 'pieces', 'icons', 'badges', 'ui', 'fx', 'board', 'bg', 'bgm']) mkdirSync(join(OUT, dir), { recursive: true });
  console.log(`원본: ${SRC}`);

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
