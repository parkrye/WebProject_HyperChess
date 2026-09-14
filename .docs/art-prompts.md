# HyperChess 아트 소스 생성 프롬프트

AI 이미지 생성용 프롬프트 모음. 각 프롬프트는 **단독으로 복사해 써도** 스타일·컨셉·투명 여부·규격이 모두 들어가도록 작성했다.

## 공통 원칙

- **아트 컨셉**: 2D 도트(픽셀 아트) 서브컬처 스타일 · 풍성하고 귀족스러운 색감 · 아기자기한(치비풍) 디자인
- **공통 팔레트**: 로열 퍼플, 딥 크림슨/버건디, 골드 필리그리, 아이보리, 사파이어·로즈골드 포인트
- **진영 색**: 백 = 아이보리 + 골드, 흑 = 딥 플럼(검보라) + 실버/로즈골드 (순수 흑백 대신 귀족풍 대비)
- **프롬프트 언어**: 대부분의 이미지 모델이 영어 프롬프트에서 규격·투명 배경 지시를 더 잘 따르므로 본문은 영어로 작성했다. 각 프롬프트 위에 한국어로 용도·셀 배치를 적었다.
- **길이 제한**: 모든 프롬프트 문단은 1000자 이하 (문단 끝에 글자 수 표기)

## 후처리·연동 체크리스트

1. 투명 배경 요청이 무시되면 배경 제거 후 **알파 채널 PNG**로 저장한다.
2. 픽셀 아트 확대·축소는 **최근접 이웃(nearest neighbor)** 만 사용한다 (보간 금지).
3. 그리드 시트는 셀 크기로 정확히 잘라 `assets/<시트>/<행>-<열>.png` 또는 아래 파일명 표대로 저장한다.
4. 같은 시트 안에서 색·외곽선 두께·조명 방향(좌상단 광원)이 일관적인지 확인한다. 어긋나면 해당 셀만 재생성한다.
5. 보드 좌표·말 배치는 게임이 그린다. 소스에 글자·숫자·워터마크가 들어가면 재생성한다.

---

## 1. 체스 말

### 1-1. 기본 말 + 왕족 상태 (4×4)

| 행 \ 열 | 1 | 2 | 3 | 4 |
|---|---|---|---|---|
| 1 | 백 킹 | 백 퀸 | 백 룩 | 백 비숍 |
| 2 | 백 나이트 | 백 폰 | 흑 킹 | 흑 퀸 |
| 3 | 흑 룩 | 흑 비숍 | 흑 나이트 | 흑 폰 |
| 4 | 백 선왕 | 흑 선왕 | 백 승급 킹 | 흑 승급 킹 |

```text
Pixel art sprite sheet of cute chibi chess pieces, 2D subculture game style, rich noble palette. Transparent background (alpha PNG), no floor, no scene. Canvas 1024x1024, exact 4x4 grid of 256x256 cells, one piece per cell, centered, bottom-aligned on a shared baseline, 10% padding, no grid lines, no text. Each piece drawn on a 64x64 pixel grid and upscaled 4x nearest neighbor, crisp 1px dark outline, soft 2-tone shading, top-left light. White side: ivory body with gold filigree and sapphire gems. Black side: deep plum body with silver and rose-gold trim. Round, stubby, adorable proportions with tiny royal details. Row 1: white king, white queen, white rook, white bishop. Row 2: white knight (cute horse), white pawn, black king, black queen. Row 3: black rook, black bishop, black knight, black pawn. Row 4: white old king (faded, gray-silver crown), black old king (faded), white promoted king (small king with shield emblem, no cross), black promoted king.
```
(968자)

### 1-2. 변종(강화) 말 (4×4)

| 행 \ 열 | 1 | 2 | 3 | 4 |
|---|---|---|---|---|
| 1 | 백 중보병(강화 폰) | 백 창기병(강화 나이트) | 백 전차(강화 룩) | 백 팔라딘(강화 비숍) |
| 2 | 백 계승자(왕관 폰) | 백 여제 퀸 | 백 여제 킹 | (빈 칸) |
| 3 | 흑 중보병 | 흑 창기병 | 흑 전차 | 흑 팔라딘 |
| 4 | 흑 계승자 | 흑 여제 퀸 | 흑 여제 킹 | (빈 칸) |

```text
Pixel art sprite sheet of cute chibi variant chess pieces for a superpower chess game, 2D subculture style, rich noble palette. Transparent background (alpha PNG). Canvas 1024x1024, exact 4x4 grid of 256x256 cells, centered, shared baseline, 10% padding, no grid lines, no text. 64x64 pixel grid upscaled 4x nearest neighbor, 1px dark outline, top-left light. White: ivory and gold. Black: deep plum with silver and rose-gold. Each variant keeps its base piece silhouette plus a clear upgrade and a soft aura. Row 1 (white): heavy infantry pawn with round shield and helmet (orange aura), lancer knight holding a long lance (red aura), chariot rook on small wheels (bronze aura), paladin bishop with holy cross cape (pale gold aura). Row 2 (white): heir pawn wearing a tiny gold crown, empress queen with tall pink crown and cape, empress king with matching pink crown, last cell fully empty. Rows 3 and 4: the same seven pieces in the black style, last cell fully empty.
```
(971자)

---

## 2. 체스 판

### 2-1. 보드 (8×8 칸, 불투명)

게임이 좌표·말·하이라이트를 위에 그리므로 **칸만** 있는 순수 보드. 칸 경계가 픽셀 단위로 정확해야 한다.

```text
Top-down pixel art chessboard texture for a cute noble fantasy chess game, 2D subculture style. Opaque image, no transparency. Canvas exactly 1024x1024, the 8x8 checkerboard fills the whole canvas edge to edge, each square exactly 128x128 pixels, no frame, no border, no pieces, no letters or numbers, no perspective. Drawn on a 256x256 pixel grid (32x32 per square) and upscaled 4x nearest neighbor. Light squares: soft ivory-lavender marble with faint pearl speckles. Dark squares: royal purple velvet with a thin gold inlay line along the inner edge. Low-contrast inner patterns so pieces stay readable, gentle dithering, consistent top-left lighting, seamless and uniform across all squares, luxurious but calm palace atmosphere.
```
(733자)

### 2-2. 보드 테두리 (투명 중앙)

```text
Pixel art ornate frame for a chessboard, cute noble fantasy style, 2D subculture game art. Transparent PNG: the center area is fully transparent, only the frame is drawn. Canvas 1152x1152, frame thickness exactly 64 pixels on every side, leaving an exact transparent 1024x1024 square in the middle. Drawn on a 288x288 pixel grid upscaled 4x nearest neighbor, 1px dark outline, top-left light. Gilded gold frame with royal purple enamel panels, tiny rubies and sapphires, small cute crown ornaments at the four corners and a heart-shaped jewel at the middle of each side. Symmetric, clean, no text, no shadow outside the canvas, rich and adorable royal look.
```
(657자)

---

## 3. 배경 (불투명)

### 3-1. 타이틀·메뉴 배경 (가로)

```text
Pixel art background for the title and menu screen of a cute noble superpower chess game, 2D subculture style. Opaque, no transparency. Size 1920x1080 landscape, drawn on a 480x270 pixel grid and upscaled 4x nearest neighbor. A grand fantasy palace throne hall at twilight: royal purple and crimson curtains, gold pillars, a checkerboard marble floor fading into the distance, floating magical sparkles, stained glass windows with chess piece motifs, soft pink and gold light rays. Leave the center third calmer and slightly darker for the logo and buttons. Rich but soft palette, gentle dithering, cozy adorable mood, no characters, no text, no UI elements.
```
(658자)

### 3-2. 대국 화면 배경 (가로)

```text
Pixel art in-game background for a cute noble chess game, 2D subculture style. Opaque, no transparency. Size 1920x1080 landscape, drawn on a 480x270 pixel grid upscaled 4x nearest neighbor. A quiet royal study at night: deep plum walls with faint gold damask pattern, velvet drapes at both sides, candle chandeliers glowing softly, shelves of tiny books and crowns. The central area (about 1100x1000) must be low contrast, darker and nearly empty because a chessboard is placed on top; keep detail only near the edges with a soft vignette. Calm, elegant, cute mood, subtle dithering, no characters, no text, no UI.
```
(614자)

### 3-3. 모바일 세로 배경

```text
Pixel art vertical background for a mobile version of a cute noble chess game, 2D subculture style. Opaque, no transparency. Size 1080x1920 portrait, drawn on a 270x480 pixel grid upscaled 4x nearest neighbor. Royal palace balcony at dusk: purple and rose-gold sky with stars, gold railings at the bottom, hanging crimson banners with chess crown emblems at the top corners, floating sparkles. Keep the middle area from 20% to 75% height dark, soft and low contrast because the board and panels sit there. Rich noble palette, adorable details at the edges only, gentle dithering, no characters, no text, no UI.
```
(610자)

---

## 4. UI 소스 (투명, 그리드)

### 4-1. 능력 아이콘 (4×4)

| 행 \ 열 | 1 | 2 | 3 | 4 |
|---|---|---|---|---|
| 1 | 염동력 | 가속 | 순간 이동 | 부활 |
| 2 | 시간 역행 | 중보병 | 창기병 | 전차 |
| 3 | 팔라딘 | 여제 | 계승자 | 능력 없음 |
| 4 | 무작위 | 설정 | 보드 뒤집기 | 나가기 |

```text
Pixel art icon sheet for a cute noble superpower chess game UI, 2D subculture style. Transparent background (alpha PNG). Canvas 1024x1024, exact 4x4 grid of 256x256 cells, one icon per cell, centered, 12% padding, no grid lines, no text. Each icon drawn on a 32x32 pixel grid upscaled 8x nearest neighbor, bold readable silhouette, 1px dark outline, inside a small round gold-rimmed badge with a colored gem background. Row 1: telekinesis (glowing violet eye with waves), haste (cyan lightning bolt), teleport (blue swap arrows with sparkles), revive (golden ankh with light). Row 2: rewind (pale cyan clock turning backward), heavy infantry (orange round shield), lancer (red lance tip), chariot (bronze wheel). Row 3: paladin (pale gold holy cross), empress (pink crown), heir (small gold crown with arrow), no ability (empty gray gem). Row 4: random (cute dice), settings (gear), flip board (two arrows), exit (door).
```
(920자)

### 4-2. 버튼·패널·게이지 (4×4)

| 행 \ 열 | 1 | 2 | 3 | 4 |
|---|---|---|---|---|
| 1 | 기본 버튼 | 눌린 버튼 | 비활성 버튼 | 투명(고스트) 버튼 |
| 2 | 패널 프레임 | 능력 카드 | 선택된 능력 카드 | 대화상자 프레임 |
| 3 | 자원 보석(빈) | 자원 보석(찬) | 쿨다운 모래시계 | 차례 표시 왕관 |
| 4 | 세로 플레이어 띠 | 이름 리본 | 방 코드 명판 | 연결 상태 램프(켜짐/꺼짐) |

```text
Pixel art UI kit sheet for a cute noble chess game, 2D subculture style, rich royal palette. Transparent background (alpha PNG). Canvas 1024x1024, exact 4x4 grid of 256x256 cells, each element centered with 8% padding, no grid lines, no text or letters. Drawn on a 64x64 pixel grid per cell upscaled 4x nearest neighbor, 1px dark outline, top-left light. Frames and buttons must have plain flat centers and even borders so they can be 9-sliced. Row 1: wide purple button with gold trim (normal), same pressed and darker, same gray disabled, outline-only ghost button. Row 2: square panel frame with gold corners, tall ability card frame, the card frame glowing and selected, ornate dialog frame. Row 3: empty diamond gem slot, filled glowing violet gem, small gold hourglass, tiny floating crown. Row 4: tall narrow player strip frame, crimson name ribbon, gold room-code plate, two small lamps (green on, gray off).
```
(916자)

### 4-3. 보드 표식·말 배지 (4×4)

| 행 \ 열 | 1 | 2 | 3 | 4 |
|---|---|---|---|---|
| 1 | 이동 가능 점 | 잡기 가능 링 | 선택 칸 강조 | 직전 수 칸 틴트 |
| 2 | 체크 경고 오라 | 능력 대상 칸 테두리 | 능력 선택 완료 칸 | 가속 보드 모서리 장식 |
| 3 | 방패 배지(중보병) | 창 배지(창기병) | 바퀴 배지(전차) | 십자 배지(팔라딘) |
| 4 | 분홍 왕관 배지(여제) | 금 왕관 배지(계승자) | 회색 왕관 배지(선왕) | 방패 왕관 배지(승급 킹) |

```text
Pixel art board marker and badge sheet for a cute noble chess game, 2D subculture style. Transparent background (alpha PNG), semi-transparent glows allowed. Canvas 1024x1024, exact 4x4 grid of 256x256 cells, no grid lines, no text. Drawn on 64x64 pixel grid per cell upscaled 4x nearest neighbor. Rows 1-2 are square overlays filling the whole cell edge to edge: soft dark round move dot, crimson capture ring, cyan selected-square glow, pale gold last-move tint, red pulsing check aura, dashed violet ability target border, solid violet picked border, cyan speed-line corner ornament. Rows 3-4 are small round badges (about 40% of the cell, centered) with gold rim and 1px outline: orange shield, red lance, bronze wheel, pale gold cross, pink crown, gold crown, gray-silver crown, pink shield with small crown.
```
(812자)

### 4-4. 능력 이펙트 스프라이트 (4×4, 행마다 4프레임)

| 행 | 애니메이션 (1→4 프레임) |
|---|---|
| 1 | 잡기 파편 폭발 |
| 2 | 보라색 마법 링(염동력·강화) |
| 3 | 빛기둥(부활·순간 이동) |
| 4 | 왕관 도장 반짝임(여제·종료) |

```text
Pixel art effect sprite sheet for a cute noble superpower chess game, 2D subculture style. Transparent background (alpha PNG), additive glow look, no black background. Canvas 1024x1024, exact 4x4 grid of 256x256 cells; each row is one 4-frame animation read left to right, effect centered in every frame, no grid lines, no text. Drawn on a 64x64 pixel grid per cell upscaled 4x nearest neighbor, limited palette, crisp pixels, no blur. Row 1: capture burst, small spark forming, star-shaped pop, flying shards and gold dust, fading dots. Row 2: violet magic ring appearing, expanding with runes, bright, fading. Row 3: golden light pillar rising from the bottom, full height beam, sparkles floating up, fading. Row 4: pink crown stamp dropping in, impact with sparkles, crown shining, fading glitter. Keep size and center consistent between frames.
```
(848자)

---

## 5. 로고

```text
Pixel art game logo reading "HYPERCHESS" for a cute noble superpower chess game, 2D subculture style. Transparent background (alpha PNG). Canvas 1536x512, logo centered with 8% margin, drawn on a 384x128 pixel grid upscaled 4x nearest neighbor. Chunky rounded pixel letters in ivory with a thick gold outline and royal purple drop shadow, "HYPER" in violet-to-cyan gradient and "CHESS" in gold, a small cute crown on the letter C, tiny chess piece silhouettes and sparkles around the text. Spell the text exactly HYPERCHESS, no other words, no background shapes except a soft glow, crisp pixels, rich and adorable royal look.
```
(625자)

---

## 파일명 규칙 (연동 예정)

| 시트 | 파일 | 셀 이름 예 |
|---|---|---|
| 1-1 기본 말 | `assets/pieces/standard.png` | `w-k`, `w-q`, `b-p`, `w-oldking`, `b-promotedking` |
| 1-2 변종 말 | `assets/pieces/variants.png` | `w-heavyInfantry`, `b-lancer`, `w-heir`, `b-empress-q` |
| 2-1 보드 | `assets/board/board.png` | — |
| 2-2 테두리 | `assets/board/frame.png` | — |
| 3 배경 | `assets/bg/title.png`, `game.png`, `mobile.png` | — |
| 4-1 아이콘 | `assets/ui/ability-icons.png` | 능력 id (`telekinesis` 등) |
| 4-2 UI 킷 | `assets/ui/kit.png` | `button`, `panel`, `gem-full` 등 |
| 4-3 표식 | `assets/ui/markers.png` | `move-dot`, `badge-shield` 등 |
| 4-4 이펙트 | `assets/fx/effects.png` | `burst-1`~`burst-4` 등 |
| 5 로고 | `assets/ui/logo.png` | — |

능력 id는 엔진 기준(`packages/engine/src/abilities/registry.ts`)을 따른다.
