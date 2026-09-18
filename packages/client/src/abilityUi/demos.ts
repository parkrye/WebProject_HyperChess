import {
  applyAction,
  createGame,
  fromAlgebraic,
  getAbility,
  legalAbilityOptions,
  listAbilities,
  START_FEN,
  type AbilityParams,
  type Action,
  type GameState,
} from '@hyperchess/engine';

/**
 * 능력 설명 페이지의 연출 예시.
 *
 * 능력마다 국면을 짜 두고 실제 엔진으로 능력을 쓴다. 대국과 같은 이벤트가 나오므로 연출도
 * 그대로 재생된다. 어느 선택지를 보여 줄지는 `choose`로 고르는데, 후보를 직접 적지 않고
 * `legalAbilityOptions`가 낸 것 중에서 고르므로 규칙이 바뀌면 데모가 깨져 바로 드러난다.
 *
 * 모든 국면에 양쪽 폰을 하나씩 남겨 둔다. 말이 너무 적으면 기물 부족 무승부로 시작해
 * 능력을 쓸 수 없다.
 */
interface DemoSpec {
  readonly fen: string;
  /** 연출 없이 미리 두는 수 (잡힌 말·직전 수 같은 문맥 만들기) */
  readonly setup?: readonly Action[];
  /** 여러 선택지 중 보여 줄 하나 */
  readonly choose?: (params: AbilityParams) => boolean;
  /** 능력 뒤에 이어서 보여 줄 수 (강화된 말의 움직임 등) */
  readonly after?: readonly Action[];
  /** 컷마다 한 줄. 첫 줄은 시작 국면이라 (행동 수 + 1)개여야 한다 */
  readonly cuts: readonly string[];
}

export interface AbilityDemo {
  readonly start: GameState;
  /** 차례로 연출할 행동. 첫 번째가 능력 사용이다 */
  readonly actions: readonly Action[];
  /** 컷 설명. cuts[0]은 시작 국면, cuts[i]는 i번째 행동을 마친 뒤 */
  readonly cuts: readonly string[];
}

const sq = fromAlgebraic;
const move = (from: string, to: string): Action => ({ type: 'move', move: { from: sq(from), to: sq(to) } });
const at = (key: string, name: string) => (params: AbilityParams) => params[key] === sq(name);

/** 능력을 쓴 뒤 상대가 한 수 둬야 강화된 말을 움직여 보일 수 있다 */
const enhanceAfter = (from: string, to: string): readonly Action[] => [move('e8', 'f8'), move(from, to)];

const DEMOS: Readonly<Record<string, DemoSpec>> = {
  telekinesis: {
    fen: '4k3/7p/8/3n4/8/8/7P/4K3 w - - 0 1',
    choose: (p) => p.from === sq('d5') && p.to === sq('d4'),
    cuts: [
      '적 나이트가 사방이 트인 곳에 홀로 서 있다.',
      '손대지 않고 한 칸 밀어냈다.',
    ],
  },
  haste: {
    fen: '4k3/7p/8/8/8/8/3PP2P/4K3 w - - 0 1',
    after: [move('e2', 'e4'), move('d2', 'd4')],
    cuts: [
      '폰 두 개가 나설 준비를 한다.',
      '가속을 켠다. 이번 턴에 수를 두 번 둘 수 있다.',
      '첫 수로 e폰이 나선다.',
      '같은 턴에 두 번째 수로 d폰이 나선다.',
    ],
  },
  teleport: {
    fen: '4k3/7p/8/8/8/2N5/7P/R3K3 w - - 0 1',
    choose: (p) => p.a === sq('a1') && p.b === sq('c3'),
    cuts: [
      '룩은 구석에, 나이트는 한가운데에 있다.',
      '둘의 자리를 통째로 맞바꿨다.',
    ],
  },
  revive: {
    fen: 'q3k3/7p/8/R7/8/8/7P/4K3 b - - 0 1',
    setup: [move('a8', 'a5')],
    choose: at('to', 'd2'),
    cuts: [
      '퀸이 내 룩을 잡고 그대로 내 킹을 겨눈다.',
      '잡힌 룩을 되살려 그 길을 막았다.',
    ],
  },
  rewind: {
    fen: START_FEN,
    setup: [move('b1', 'c3'), move('g8', 'f6')],
    choose: (p) => p.steps === 1,
    cuts: [
      '나이트를 내보냈고 상대도 나이트로 받았다.',
      '시간을 되돌려 내가 나이트를 내보내기 전으로 돌아간다.',
    ],
  },
  heavyInfantry: {
    fen: '4k3/7p/8/8/8/8/4P2P/4K3 w - - 0 1',
    choose: at('square', 'e2'),
    after: enhanceAfter('e2', 'd3'),
    cuts: [
      '폰 하나가 앞에 나와 있다.',
      '그 폰을 중보병으로 강화했다.',
      '상대가 한 수 둔다.',
      '강화된 폰이 킹처럼 비스듬히 걷는다.',
    ],
  },
  lancer: {
    fen: '4k3/7p/8/8/8/2N5/7P/4K3 w - - 0 1',
    choose: at('square', 'c3'),
    after: enhanceAfter('c3', 'c7'),
    cuts: [
      '나이트가 한 마리 있다.',
      '그 나이트를 창기병으로 강화했다.',
      '상대가 한 수 둔다.',
      '강화된 나이트가 룩처럼 줄을 타고 달린다.',
    ],
  },
  chariot: {
    fen: '4k3/7p/8/8/8/8/P6P/R3K3 w - - 0 1',
    choose: at('square', 'a1'),
    after: enhanceAfter('a1', 'a4'),
    cuts: [
      '룩 바로 앞을 아군 폰이 막고 있다.',
      '그 룩을 전차로 강화했다.',
      '상대가 한 수 둔다.',
      '막은 아군을 뛰어넘어 나아간다.',
    ],
  },
  paladin: {
    fen: '4k3/7p/8/8/8/2B5/7P/4K3 w - - 0 1',
    choose: at('square', 'c3'),
    after: enhanceAfter('c3', 'c4'),
    cuts: [
      '비숍이 검은 칸에 서 있다.',
      '그 비숍을 팔라딘으로 강화했다.',
      '상대가 한 수 둔다.',
      '옆으로 한 칸 걸어 흰 칸으로 건너갔다.',
    ],
  },
  empress: {
    fen: '4k3/7p/8/8/3Q4/8/7P/4K3 w - - 0 1',
    cuts: [
      '퀸이 하나뿐이다.',
      '퀸이 왕족이 되고 킹은 싸울 수 있게 풀려났다.',
    ],
  },
  heir: {
    fen: '4k3/7p/8/8/8/8/4P2P/4K3 w - - 0 1',
    choose: at('square', 'e2'),
    cuts: [
      '왕이 하나, 폰이 하나 있다.',
      '폰을 계승자로 세웠다. 이제 둘 다 잡혀야 진다.',
    ],
  },
  alchemy: {
    fen: '4k3/7p/8/8/8/8/P6P/RB2K3 w - - 0 1',
    choose: (p) => p.square === sq('a1') && p.type === 'n',
    after: enhanceAfter('a1', 'b3'),
    cuts: [
      '룩이 아군에 막혀 나가지 못한다.',
      '그 룩을 나이트로 바꿨다.',
      '상대가 한 수 둔다.',
      '나이트가 되어 막힌 자리를 뛰어넘는다.',
    ],
  },
  brainwash: {
    fen: '4k3/7p/8/8/3n4/2PPP3/7P/4K3 w - - 0 1',
    choose: at('square', 'd4'),
    cuts: [
      '적 나이트가 내 폰 셋에 둘러싸였다.',
      '세뇌해 영구히 내 말로 만들었다.',
    ],
  },
  wall: {
    fen: '4k3/7p/8/8/8/8/7P/4K3 w - - 0 1',
    choose: at('square', 'e4'),
    after: [move('e1', 'e2')],
    cuts: [
      '빈 판에 내 킹만 있다.',
      '빈칸에 성벽을 세웠다.',
      '성벽은 수 전에 세우므로 이 턴에 수도 둔다.',
    ],
  },
  march: {
    fen: '4k3/7p/8/8/8/8/PPP2PPP/4K3 w - - 0 1',
    cuts: [
      '폰들이 한 줄로 서 있다.',
      '앞이 트인 폰이 모두 한 칸씩 나아갔다.',
    ],
  },
  snipe: {
    fen: '4k3/7p/8/3n4/8/8/3R3P/4K3 w - - 0 1',
    choose: (p) => p.from === sq('d2') && p.to === sq('d5'),
    cuts: [
      '룩의 조준선 위에 적 나이트가 있다.',
      '자리를 지킨 채 그 자리에서 잡았다.',
    ],
  },
};

export class DemoError extends Error {}

/** 데모 국면을 만들고 보여 줄 행동을 정한다. 능력 선택지가 없으면 던진다 */
export function buildDemo(abilityId: string): AbilityDemo {
  const spec = DEMOS[abilityId];
  if (!spec) throw new DemoError(`${abilityId}: 데모가 없다`);

  const { balance } = getAbility(abilityId);
  let start = createGame({
    fen: spec.fen,
    abilities: { w: abilityId, b: null },
    // 자원 때문에 못 쓰는 일이 없도록 가득 채운다 (최대치라 회복으로 깎이지 않는다)
    resources: { w: balance.maxResource },
    timeControl: null,
  });
  for (const action of spec.setup ?? []) start = applyAction(start, action, 0);

  const options = legalAbilityOptions(start, 'w');
  const params = spec.choose ? options.find(spec.choose) : options[0];
  if (!params) throw new DemoError(`${abilityId}: 보여 줄 선택지가 없다 (후보 ${options.length}개)`);

  const actions: Action[] = [{ type: 'ability', params }, ...(spec.after ?? [])];
  if (spec.cuts.length !== actions.length + 1) throw new DemoError(`${abilityId}: 컷 설명 수가 맞지 않는다`);
  return { start, actions, cuts: spec.cuts };
}

/** 데모가 있는 능력 (등록 순서) */
export const demoAbilities = () => listAbilities().filter((ability) => ability.id in DEMOS);
