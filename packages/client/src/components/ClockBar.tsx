import { clockView, opposite, type Color, type GameState } from '@hyperchess/engine';
import { useEffect, useState } from 'react';
import { COLOR_NAME } from '../abilityUi/text';
import { uiSprite } from '../assets/sprites';
import type { SeatLabel } from './PlayerBar';

const TURN_WARNING_MS = 15_000;
const TOTAL_WARNING_MS = 60_000;

/** 250ms마다 현재 시각을 갱신한다 (offsetMs: 서버 시각 보정) */
function useNow(offsetMs: number, active: boolean): number {
  const [now, setNow] = useState(() => Date.now() + offsetMs);
  useEffect(() => {
    setNow(Date.now() + offsetMs);
    if (!active) return;
    const timer = window.setInterval(() => setNow(Date.now() + offsetMs), 250);
    return () => window.clearInterval(timer);
  }, [offsetMs, active]);
  return now;
}

export function formatClock(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  return `${minutes}:${String(totalSeconds % 60).padStart(2, '0')}`;
}

interface ClockBarProps {
  readonly state: GameState;
  readonly leftColor: Color;
  readonly seats?: Readonly<Record<Color, SeatLabel>>;
  readonly offsetMs?: number;
}

/** 게임 상단 시계: 좌우 플레이어의 전체 남은 시간 + 현재 차례의 남은 시간 */
export function ClockBar({ state, leftColor, seats, offsetMs = 0 }: ClockBarProps) {
  const ongoing = state.result.kind === 'ongoing';
  const now = useNow(offsetMs, ongoing && state.clock !== null);
  const view = clockView(state, now);
  if (!view || !state.clock) return null;

  const turnLimit = state.clock.control.turnLimitMs;

  const chip = (color: Color, side: 'left' | 'right') => {
    const name = seats?.[color]?.name ?? COLOR_NAME[color];
    const active = ongoing && view.turn === color;
    const total = view.totalRemainingMs[color];
    const turnLeft = active ? view.turnRemainingMs : turnLimit;
    const warn = active && (view.turnRemainingMs <= TURN_WARNING_MS || total <= TOTAL_WARNING_MS);
    const classes = [
      'clock-chip',
      `clock-${side}`,
      active ? 'is-active' : '',
      warn ? 'is-warning' : '',
      total <= TOTAL_WARNING_MS ? 'is-low' : '',
    ];

    return (
      <div className={classes.join(' ')} aria-label={`${name} 남은 시간`}>
        <span className="clock-name">
          {active ? <img className="clock-hourglass" src={uiSprite.hourglass} alt="" draggable={false} /> : <span className={`player-dot dot-${color}`} />}
          {name}
        </span>
        <span className="clock-turn">{active ? formatClock(turnLeft) : '—'}</span>
        <span className="clock-total">전체 {formatClock(total)}</span>
        <span className="clock-progress" style={{ transform: `scaleX(${active ? turnLeft / turnLimit : 0})` }} />
      </div>
    );
  };

  return (
    <div className="clock-bar" role="timer">
      {chip(leftColor, 'left')}
      {chip(opposite(leftColor), 'right')}
    </div>
  );
}
