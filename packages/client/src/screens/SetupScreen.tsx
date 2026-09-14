import type { Difficulty } from '@hyperchess/ai';
import { getAbility, opposite, type Color } from '@hyperchess/engine';
import { useState, type CSSProperties } from 'react';
import { abilityUi } from '../abilityUi/specs';
import { COLOR_NAME } from '../abilityUi/text';
import type { AiConfig } from '../ai/useAiOpponent';
import { AbilityGrid, randomAbilityId } from '../components/AbilityGrid';
import { AbilityIconView } from '../components/AbilityIconView';
import { Hero, ModeTabs, type GameMode } from '../components/ModeTabs';

export type AbilityChoice = Record<Color, string>;

export interface LocalGameConfig {
  readonly abilities: AbilityChoice;
  readonly ai: AiConfig | null;
}

/** 설정 화면에서 기억해 두는 선택값 */
export interface SetupPrefs {
  readonly local: AbilityChoice;
  readonly ai: { readonly me: string; readonly ai: string; readonly color: Color | 'random'; readonly difficulty: Difficulty };
}

export const DEFAULT_SETUP_PREFS: SetupPrefs = {
  local: { w: 'telekinesis', b: 'rewind' },
  ai: { me: 'telekinesis', ai: 'haste', color: 'w', difficulty: 'normal' },
};

interface SetupScreenProps {
  readonly mode: Extract<GameMode, 'local' | 'ai'>;
  readonly prefs: SetupPrefs;
  readonly onStart: (config: LocalGameConfig, prefs: SetupPrefs) => void;
  readonly onModeChange: (mode: GameMode) => void;
}

type Slot = 'w' | 'b' | 'me' | 'ai';

const DIFFICULTIES: readonly { id: Difficulty; label: string }[] = [
  { id: 'easy', label: '쉬움' },
  { id: 'normal', label: '보통' },
  { id: 'hard', label: '어려움' },
];

export function SetupScreen({ mode, prefs: initialPrefs, onStart, onModeChange }: SetupScreenProps) {
  const [prefs, setPrefs] = useState<SetupPrefs>(initialPrefs);
  const [editing, setEditing] = useState<Slot>(mode === 'ai' ? 'me' : 'w');
  const isAi = mode === 'ai';

  const slots: readonly { key: Slot; label: string }[] = isAi
    ? [{ key: 'me', label: '나' }, { key: 'ai', label: 'AI' }]
    : [{ key: 'w', label: COLOR_NAME.w }, { key: 'b', label: COLOR_NAME.b }];

  const abilityOf = (slot: Slot) => (slot === 'me' || slot === 'ai' ? prefs.ai[slot] : prefs.local[slot]);
  const setAbility = (slot: Slot, abilityId: string) =>
    setPrefs((prev) =>
      slot === 'me' || slot === 'ai'
        ? { ...prev, ai: { ...prev.ai, [slot]: abilityId } }
        : { ...prev, local: { ...prev.local, [slot]: abilityId } },
    );
  const randomize = () => slots.forEach(({ key }) => setAbility(key, randomAbilityId()));

  const start = () => {
    if (!isAi) {
      onStart({ abilities: prefs.local, ai: null }, prefs);
      return;
    }
    const { me, ai, color, difficulty } = prefs.ai;
    const myColor: Color = color === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : color;
    const aiColor = opposite(myColor);
    onStart({ abilities: { [myColor]: me, [aiColor]: ai } as AbilityChoice, ai: { color: aiColor, difficulty } }, prefs);
  };

  return (
    <main className="setup">
      <Hero />
      <ModeTabs active={mode} onChange={onModeChange} />

      {isAi && (
        <div className="ai-options">
          <div className="segmented" role="radiogroup" aria-label="내 색">
            {(['w', 'random', 'b'] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={prefs.ai.color === value}
                className={prefs.ai.color === value ? 'active' : ''}
                onClick={() => setPrefs((prev) => ({ ...prev, ai: { ...prev.ai, color: value } }))}
              >
                {value === 'random' ? '무작위' : `${COLOR_NAME[value]}으로`}
              </button>
            ))}
          </div>
          <div className="segmented" role="radiogroup" aria-label="난이도">
            {DIFFICULTIES.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={prefs.ai.difficulty === id}
                className={prefs.ai.difficulty === id ? 'active' : ''}
                onClick={() => setPrefs((prev) => ({ ...prev, ai: { ...prev.ai, difficulty: id } }))}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="player-picks">
        {slots.map(({ key, label }) => {
          const abilityId = abilityOf(key);
          const spec = abilityUi(abilityId);
          return (
            <button
              key={key}
              type="button"
              className={`player-pick ${editing === key ? 'active' : ''}`}
              style={{ '--ability-color': spec.color } as CSSProperties}
              onClick={() => setEditing(key)}
            >
              {!isAi && <span className={`player-dot dot-${key}`} />}
              <span className="player-pick-label">{label}</span>
              <AbilityIconView icon={spec.icon} size={18} />
              <strong>{getAbility(abilityId).name}</strong>
            </button>
          );
        })}
        <button type="button" className="btn btn-ghost" onClick={randomize}>
          무작위
        </button>
      </div>

      <AbilityGrid
        label={`${slots.find((s) => s.key === editing)?.label ?? ''} 능력 선택`}
        selected={abilityOf(editing)}
        onSelect={(abilityId) => setAbility(editing, abilityId)}
      />

      <div className="setup-footer">
        <button type="button" className="btn btn-primary btn-large" onClick={start}>
          게임 시작
        </button>
      </div>
    </main>
  );
}
