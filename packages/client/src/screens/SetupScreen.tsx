import { getAbility, type Color } from '@hyperchess/engine';
import { useState, type CSSProperties } from 'react';
import { abilityUi } from '../abilityUi/specs';
import { COLOR_NAME } from '../abilityUi/text';
import { AbilityGrid, randomAbilityId } from '../components/AbilityGrid';
import { AbilityIconView } from '../components/AbilityIconView';
import { Hero, ModeTabs, type GameMode } from '../components/ModeTabs';

export type AbilityChoice = Record<Color, string>;

interface SetupScreenProps {
  readonly initial: AbilityChoice;
  readonly onStart: (choice: AbilityChoice) => void;
  readonly onModeChange: (mode: GameMode) => void;
}

export function SetupScreen({ initial, onStart, onModeChange }: SetupScreenProps) {
  const [choice, setChoice] = useState<AbilityChoice>(initial);
  const [editing, setEditing] = useState<Color>('w');

  return (
    <main className="setup">
      <Hero />
      <ModeTabs active="local" onChange={onModeChange} />

      <div className="player-picks">
        {(['w', 'b'] as const).map((color) => {
          const spec = abilityUi(choice[color]);
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
              <strong>{getAbility(choice[color]).name}</strong>
            </button>
          );
        })}
        <button type="button" className="btn btn-ghost" onClick={() => setChoice({ w: randomAbilityId(), b: randomAbilityId() })}>
          무작위
        </button>
      </div>

      <AbilityGrid
        label={`${COLOR_NAME[editing]} 능력 선택`}
        selected={choice[editing]}
        onSelect={(abilityId) => setChoice((prev) => ({ ...prev, [editing]: abilityId }))}
      />

      <div className="setup-footer">
        <button type="button" className="btn btn-primary btn-large" onClick={() => onStart(choice)}>
          게임 시작
        </button>
      </div>
    </main>
  );
}
