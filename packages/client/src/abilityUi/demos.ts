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
  /** 무엇을 보여 주는지 한 줄 */
  readonly caption: string;
}

export interface AbilityDemo {
  readonly start: GameState;
  /** 차례로 연출할 행동. 첫 번째가 능력 사용이다 */
  readonly actions: readonly Action[];
  readonly caption: string;
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
    caption: '사방이 트인 적 나이트를 손대지 않고 한 칸 밀어낸다.',
  },
  haste: {
    fen: '4k3/7p/8/8/8/8/3PP2P/4K3 w - - 0 1',
    after: [move('e2', 'e4'), move('d2', 'd4')],
    caption: '가속을 켜고 한 턴에 두 수를 둔다.',
  },
  teleport: {
    fen: '4k3/7p/8/8/8/2N5/7P/R3K3 w - - 0 1',
    choose: (p) => p.a === sq('a1') && p.b === sq('c3'),
    caption: '멀리 있는 내 룩과 나이트의 자리를 맞바꾼다.',
  },
  revive: {
    fen: 'q3k3/7p/8/R7/8/8/7P/4K3 b - - 0 1',
    setup: [move('a8', 'a5')],
    choose: at('to', 'd2'),
    caption: '퀸에게 잡힌 룩을 되살려 그 체크를 막는다.',
  },
  rewind: {
    fen: START_FEN,
    setup: [move('b1', 'c3'), move('g8', 'f6')],
    choose: (p) => p.steps === 1,
    caption: '내 직전 턴으로 시간을 되돌린다. 그동안의 수가 거꾸로 재생된다.',
  },
  heavyInfantry: {
    fen: '4k3/7p/8/8/8/8/4P2P/4K3 w - - 0 1',
    choose: at('square', 'e2'),
    after: enhanceAfter('e2', 'd3'),
    caption: '강화된 폰은 킹처럼 옆으로도 비스듬히도 걷는다.',
  },
  lancer: {
    fen: '4k3/7p/8/8/8/2N5/7P/4K3 w - - 0 1',
    choose: at('square', 'c3'),
    after: enhanceAfter('c3', 'c7'),
    caption: '강화된 나이트는 룩처럼 줄을 타고 달린다.',
  },
  chariot: {
    fen: '4k3/7p/8/8/8/8/P6P/R3K3 w - - 0 1',
    choose: at('square', 'a1'),
    after: enhanceAfter('a1', 'a4'),
    caption: '강화된 룩은 앞을 막은 아군을 뛰어넘는다.',
  },
  paladin: {
    fen: '4k3/7p/8/8/8/2B5/7P/4K3 w - - 0 1',
    choose: at('square', 'c3'),
    after: enhanceAfter('c3', 'c4'),
    caption: '강화된 비숍은 옆으로 한 칸 걸어 칸 색을 바꾼다.',
  },
  empress: {
    fen: '4k3/7p/8/8/3Q4/8/7P/4K3 w - - 0 1',
    caption: '퀸이 왕족이 되고 킹은 싸울 수 있게 풀려난다.',
  },
  heir: {
    fen: '4k3/7p/8/8/8/8/4P2P/4K3 w - - 0 1',
    choose: at('square', 'e2'),
    caption: '폰을 계승자로 세워 왕을 둘로 나눈다.',
  },
  alchemy: {
    fen: 'R7/7p/8/4k3/8/8/7P/4K3 w - - 0 1',
    choose: (p) => p.square === sq('a8') && p.type === 'p' && p.promotion === 'q',
    caption: '마지막 랭크의 룩을 폰으로 바꾸면 그 자리에서 퀸으로 승급한다.',
  },
  brainwash: {
    fen: '4k3/7p/8/8/3n4/2PPP3/7P/4K3 w - - 0 1',
    choose: at('square', 'd4'),
    caption: '아군에 둘러싸인 적 나이트를 영구히 빼앗는다.',
  },
  wall: {
    fen: '4k3/7p/8/8/8/8/7P/4K3 w - - 0 1',
    choose: at('square', 'e4'),
    after: [move('e1', 'e2')],
    caption: '빈칸에 성벽을 세워 길을 끊고, 그 턴에 수를 둔다.',
  },
  march: {
    fen: '4k3/7p/8/8/8/8/PPP2PPP/4K3 w - - 0 1',
    caption: '앞이 트인 내 폰이 모두 한 칸씩 전진한다.',
  },
  snipe: {
    fen: '4k3/7p/8/3n4/8/8/3R3P/4K3 w - - 0 1',
    choose: (p) => p.from === sq('d2') && p.to === sq('d5'),
    caption: '룩이 자리를 지킨 채 조준선 위의 나이트를 잡는다.',
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

  return { start, actions: [{ type: 'ability', params }, ...(spec.after ?? [])], caption: spec.caption };
}

/** 데모가 있는 능력 (등록 순서) */
export const demoAbilities = () => listAbilities().filter((ability) => ability.id in DEMOS);
