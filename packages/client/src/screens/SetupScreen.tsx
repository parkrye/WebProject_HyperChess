import { listAbilities, type Color } from '@hyperchess/engine';
import { useState, type CSSProperties } from 'react';
import { abilityUi } from '../abilityUi/specs';
import { COLOR_NAME, costLabel, recoveryLabel, TIMING_LABEL } from '../abilityUi/text';
import { AbilityIconView } from '../components/AbilityIconView';

export type AbilityChoice = Record<Color, string>;

interface SetupScreenProps {
  readonly initial: AbilityChoice;
  readonly onStart: (choice: AbilityChoice) => void;
}

const MODES = [
  { id: 'local', label: '로컬 2인', enabled: true },
  { id: 'ai', label: 'AI 대전', enabled: false },
  { id: 'online', label: '온라인', enabled: false },
] as const;

export function SetupScreen({ initial, onStart }: SetupScreenProps) {
  const abilities = listAbilities();
  const [choice, setChoice] = useState<AbilityChoice>(initial);
  const [editing, setEditing] = useState<Color>('w');

  const choose = (abilityId: string) => setChoice((prev) => ({ ...prev, [editing]: abilityId }));
  const randomize = () => {
    const pick = () => abilities[Math.floor(Math.random() * abilities.length)].id;
    setChoice({ w: pick(), b: pick() });
  };

  return (
    <main className="setup">
      <header className="setup-hero">
        <h1>
          HYPER<span>CHESS</span>
        </h1>
        <p>초능력을 하나 골라 체스판을 뒤흔드세요</p>
      </header>

      <nav className="mode-tabs" aria-label="게임 모드">
        {MODES.map((mode) => (
          <button key={mode.id} type="button" className={`mode-tab ${mode.id === 'local' ? 'active' : ''}`} disabled={!mode.enabled}>
            {mode.label}
            {!mode.enabled && <small>준비 중</small>}
          </button>
        ))}
      </nav>

      <div className="player-picks">
        {(['w', 'b'] as const).map((color) => {
          const spec = abilityUi(choice[color]);
          const name = abilities.find((a) => a.id === choice[color])?.name;
          return (
            <button
              key={color}
              type="button"
              className={`player-pick ${editing === color ? 'active' : ''}`}
              style={{ '--ability-color': spec.color } as CSSProperties}
              onClick={() => setEditing(color)}
            >
              <span className={`player-dot dot-${color}`} />
              <span className="player-pick-label">{COLOR_NAME[color]}</span>
              <AbilityIconView icon={spec.icon} size={18} />
              <strong>{name}</strong>
            </button>
          );
        })}
        <button type="button" className="btn btn-ghost" onClick={randomize}>
          무작위
        </button>
      </div>

      <section className="ability-grid" aria-label={`${COLOR_NAME[editing]} 능력 선택`}>
        {abilities.map((ability) => {
          const spec = abilityUi(ability.id);
          const selected = choice[editing] === ability.id;
          return (
            <button
              key={ability.id}
              type="button"
              className={`ability-card ${selected ? 'selected' : ''}`}
              style={{ '--ability-color': spec.color } as CSSProperties}
              aria-pressed={selected}
              onClick={() => choose(ability.id)}
            >
              <div className="ability-card-head">
                <span className="ability-icon">
                  <AbilityIconView icon={spec.icon} size={22} />
                </span>
                <div>
                  <strong>{ability.name}</strong>
                  <small>{TIMING_LABEL[ability.timing]}</small>
                </div>
              </div>
              <p>{ability.description}</p>
              <dl className="ability-stats">
                <div>
                  <dt>자원</dt>
                  <dd>
                    {ability.balance.startResource}/{ability.balance.maxResource}
                  </dd>
                </div>
                <div>
                  <dt>비용</dt>
                  <dd>{costLabel(ability.id)}</dd>
                </div>
                <div>
                  <dt>회복</dt>
                  <dd>{recoveryLabel(ability)}</dd>
                </div>
                {ability.balance.cooldownTurns > 0 && (
                  <div>
                    <dt>대기</dt>
                    <dd>{ability.balance.cooldownTurns}턴</dd>
                  </div>
                )}
              </dl>
            </button>
          );
        })}
      </section>

      <div className="setup-footer">
        <button type="button" className="btn btn-primary btn-large" onClick={() => onStart(choice)}>
          게임 시작
        </button>
      </div>
    </main>
  );
}
