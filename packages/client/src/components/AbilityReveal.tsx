import { listAbilities, type Color } from '@hyperchess/engine';
import { RANDOM_ABILITY } from '@hyperchess/protocol';
import { useEffect, useState, type CSSProperties } from 'react';
import { abilityUi } from '../abilityUi/specs';
import { abilityName, COLOR_NAME, SECRET_ABILITY_NAME } from '../abilityUi/text';
import { AbilityIconView } from './AbilityIconView';

const SPIN_MS = 1800;
const HOLD_MS = 1100;
const TICK_MS = 90;

interface AbilityRevealProps {
  readonly abilities: Readonly<Record<Color, string>>;
  readonly randomized: Readonly<Partial<Record<Color, boolean>>>;
  readonly names?: Readonly<Partial<Record<Color, string>>>;
  /** 비밀 능력: 이 화면에서 보여 주지 않는 색 */
  readonly hidden?: Readonly<Partial<Record<Color, boolean>>>;
  readonly onDone: () => void;
}

/** 무작위로 정해진 능력을 슬롯머신처럼 돌리다가 공개한다 */
export function AbilityReveal({ abilities, randomized, names, hidden = {}, onDone }: AbilityRevealProps) {
  const pool = listAbilities().map((a) => a.id);
  const [tick, setTick] = useState(0);
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    const spin = window.setInterval(() => setTick((t) => t + 1), TICK_MS);
    const stop = window.setTimeout(() => {
      window.clearInterval(spin);
      setSettled(true);
    }, SPIN_MS);
    const done = window.setTimeout(onDone, SPIN_MS + HOLD_MS);
    return () => {
      window.clearInterval(spin);
      window.clearTimeout(stop);
      window.clearTimeout(done);
    };
  }, [onDone]);

  const card = (color: Color, offset: number) => {
    const secret = !!hidden[color];
    const spinning = randomized[color] && !settled && !secret;
    const shown = secret ? RANDOM_ABILITY : spinning ? pool[(tick + offset) % pool.length] : abilities[color];
    const spec = abilityUi(shown);
    return (
      <div
        key={color}
        className={`reveal-card ${spinning ? 'is-spinning' : ''} ${randomized[color] && settled ? 'is-landed' : ''}`}
        style={{ '--ability-color': spec.color } as CSSProperties}
      >
        <span className="reveal-player">
          <span className={`player-dot dot-${color}`} />
          {names?.[color] ?? COLOR_NAME[color]}
          {randomized[color] && !secret && <span className="reveal-tag">무작위</span>}
        </span>
        <AbilityIconView icon={spec.icon} size={96} className="reveal-icon" />
        <strong className="reveal-name">{secret ? SECRET_ABILITY_NAME : abilityName(shown)}</strong>
      </div>
    );
  };

  return (
    <div className="reveal-backdrop" role="dialog" aria-label="능력 공개" onClick={onDone}>
      <div className="reveal-row">
        {card('w', 0)}
        <span className="reveal-vs">VS</span>
        {card('b', 5)}
      </div>
    </div>
  );
}
