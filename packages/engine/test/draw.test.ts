import { describe, expect, it } from 'vitest';
import {
  DRAW_OFFER_QUIET_PLIES,
  DRAW_OFFER_RETRY_PLIES,
  IllegalActionError,
  applyAction,
  checkTimeout,
  clockView,
  createGame,
  drawByAgreement,
  drawOfferDue,
  fromAlgebraic as sq,
  materialScores,
  openDrawOffer,
  voteDraw,
  type GameState,
} from '../src';
import { game, move } from './helpers';

const CONTROL = { turnLimitMs: 120_000, totalLimitMs: 600_000 };

/** 말 변동 없이 임계값까지 지난 상태 (한 수 한 수 두는 대신 계측값만 맞춘다) */
const quiet = (state: GameState, plies = DRAW_OFFER_QUIET_PLIES): GameState => ({
  ...state,
  draw: { ...state.draw, quietPlies: plies },
});

describe('무승부 제안', () => {
  it('말 변동이 없으면 수를 셋다가, 말이 잡히면 0으로 돌아간다', () => {
    let state = createGame();
    expect(state.draw.quietPlies).toBe(0);

    state = move(state, 'e2', 'e4');
    state = move(state, 'd7', 'd5');
    expect(state.draw.quietPlies).toBe(2);

    state = move(state, 'e4', 'd5'); // 폰을 잡는다
    expect(state.draw.quietPlies).toBe(0);
    expect(state.draw.offerAt).toBe(DRAW_OFFER_QUIET_PLIES);
  });

  it('임계값에 닿으면 제안할 때가 되고, 그 전에는 아니다', () => {
    const state = createGame();
    expect(drawOfferDue(quiet(state, DRAW_OFFER_QUIET_PLIES - 1))).toBe(false);
    expect(drawOfferDue(quiet(state))).toBe(true);
  });

  it('양쪽이 승낙하면 무승부로 끝난다', () => {
    const offered = openDrawOffer(quiet(createGame()));
    expect(offered.draw.offer?.votes).toEqual({});

    const half = voteDraw(offered, 'w', 'accept');
    expect(half.result.kind).toBe('ongoing');
    expect(half.draw.offer?.votes).toEqual({ w: 'accept' });

    const done = voteDraw(half, 'b', 'accept');
    expect(done.result).toEqual({ kind: 'draw', reason: 'agreement' });
    expect(done.draw.offer).toBeNull();
  });

  it('양쪽이 가치 판정을 고르면 남은 말 가치로 승패가 갈린다', () => {
    const ahead = openDrawOffer(quiet(game('4k3/8/8/8/8/8/8/R3K3 w - - 0 1')));
    expect(materialScores(ahead)).toEqual({ w: 5, b: 0 });
    const judged = voteDraw(voteDraw(ahead, 'w', 'judge'), 'b', 'judge');
    expect(judged.result).toEqual({ kind: 'win', winner: 'w', reason: 'materialJudge' });

    const even = openDrawOffer(quiet(game('4k2r/8/8/8/8/8/8/R3K3 w - - 0 1')));
    const drawn = voteDraw(voteDraw(even, 'w', 'judge'), 'b', 'judge');
    expect(drawn.result).toEqual({ kind: 'draw', reason: 'materialJudge' });
  });

  it('답이 엇갈리면 결정되지 않고 대국이 이어진다', () => {
    const offered = openDrawOffer(quiet(createGame()));
    const mixed = voteDraw(voteDraw(offered, 'w', 'accept'), 'b', 'judge');
    expect(mixed.result.kind).toBe('ongoing');
    expect(mixed.draw.offer).toBeNull();
  });

  it('거절하면 계속 두고, 일정 수가 더 지나면 다시 제안한다', () => {
    const offered = openDrawOffer(quiet(createGame()));
    const declined = voteDraw(voteDraw(offered, 'w', 'decline'), 'b', 'decline');
    expect(declined.result.kind).toBe('ongoing');
    expect(declined.draw.offerAt).toBe(DRAW_OFFER_QUIET_PLIES + DRAW_OFFER_RETRY_PLIES);
    expect(drawOfferDue(declined)).toBe(false);

    const later = quiet(declined, DRAW_OFFER_QUIET_PLIES + DRAW_OFFER_RETRY_PLIES);
    expect(drawOfferDue(later)).toBe(true);
  });

  it('한 색이 두 번 답할 수는 없다', () => {
    const half = voteDraw(openDrawOffer(quiet(createGame())), 'w', 'accept');
    expect(() => voteDraw(half, 'w', 'decline')).toThrow(IllegalActionError);
  });

  it('제안에 답하기 전에는 수를 둘 수 없다', () => {
    const offered = openDrawOffer(quiet(createGame()));
    expect(() => applyAction(offered, { type: 'move', move: { from: sq('e2'), to: sq('e4') } })).toThrow(IllegalActionError);
  });

  it('답을 기다리는 동안 시계가 멈추고, 계속 두게 되면 이어서 간다', () => {
    const state = quiet(createGame({ timeControl: CONTROL, now: 0 }));
    const offered = openDrawOffer(state, 30_000);

    // 30초를 쓴 채로 멈춰 있다: 한참 지나도 시간 초과가 아니고 남은 시간도 그대로다
    expect(checkTimeout(offered, 500_000).result.kind).toBe('ongoing');
    expect(clockView(offered, 500_000)?.turnRemainingMs).toBe(90_000);

    const resumed = voteDraw(voteDraw(offered, 'w', 'decline', 500_000), 'b', 'decline', 500_000);
    expect(clockView(resumed, 500_000)?.turnRemainingMs).toBe(90_000);
    expect(checkTimeout(resumed, 589_999).result.kind).toBe('ongoing');
    expect(checkTimeout(resumed, 590_000).result).toEqual({ kind: 'win', winner: 'b', reason: 'timeout' });
  });

  it('AI 내전: 제안할 때가 되면 바로 합의 무승부로 끝낼 수 있다', () => {
    const done = drawByAgreement(quiet(createGame()));
    expect(done.result).toEqual({ kind: 'draw', reason: 'agreement' });
    expect(() => drawByAgreement(createGame())).toThrow(IllegalActionError);
  });
});
