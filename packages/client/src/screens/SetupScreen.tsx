import type { Difficulty } from '@hyperchess/ai';
import { opposite, STANDARD_MODE, type Color, type GameMode } from '@hyperchess/engine';
import { RANDOM_ABILITY, resolveAbilityChoice } from '@hyperchess/protocol';
import { useState, type CSSProperties } from 'react';
import { abilityUi } from '../abilityUi/specs';
import { abilityName, COLOR_NAME } from '../abilityUi/text';
import type { AiConfig } from '../ai/useAiOpponent';
import { useBgm } from '../audio/bgm';
import { AbilityIconView } from '../components/AbilityIconView';
import { AbilityPicker } from '../components/AbilityPicker';
import { ModePicker } from '../components/ModePicker';
import { Page } from '../components/Page';
import type { ArenaConfig } from './ArenaScreen';
import { SETUP_TITLE } from './SingleMenuScreen';

export type AbilityChoice = Record<Color, string>;

export interface LocalGameConfig {
  /** 게임에 쓰일 실제 능력 (무작위는 이미 결정됨) */
  readonly abilities: AbilityChoice;
  /** 무작위로 결정된 색 */
  readonly randomized: Partial<Record<Color, boolean>>;
  readonly ai: AiConfig | null;
  readonly mode: GameMode;
}

/** 선택값(무작위 포함)을 실제 능력으로 결정한다 */
function resolveChoices(choices: AbilityChoice): Pick<LocalGameConfig, 'abilities' | 'randomized'> {
  return {
    abilities: { w: resolveAbilityChoice(choices.w), b: resolveAbilityChoice(choices.b) },
    randomized: { w: choices.w === RANDOM_ABILITY, b: choices.b === RANDOM_ABILITY },
  };
}

/** 설정 화면에서 기억해 두는 선택값 */
export interface SetupPrefs {
  readonly local: AbilityChoice;
  readonly ai: { readonly me: string; readonly ai: string; readonly color: Color | 'random'; readonly difficulty: Difficulty };
  readonly arena: ArenaConfig;
  /** 로컬 2인·AI 대전 공통 게임 모드 */
  readonly mode: GameMode;
}

export const DEFAULT_SETUP_PREFS: SetupPrefs = {
  local: { w: 'telekinesis', b: 'rewind' },
  ai: { me: 'telekinesis', ai: 'haste', color: 'w', difficulty: 'normal' },
  arena: { choices: { w: RANDOM_ABILITY, b: RANDOM_ABILITY }, difficulty: { w: 'normal', b: 'normal' } },
  mode: STANDARD_MODE,
};

export type SetupMode = 'local' | 'ai' | 'arena';

interface SetupScreenProps {
  readonly mode: SetupMode;
  readonly prefs: SetupPrefs;
  readonly onStart: (config: LocalGameConfig, prefs: SetupPrefs) => void;
  readonly onStartArena: (config: ArenaConfig, prefs: SetupPrefs) => void;
  readonly onBack: () => void;
}

type Slot = 'w' | 'b' | 'me' | 'ai' | 'arenaW' | 'arenaB';

const ARENA_SLOT_COLOR = { arenaW: 'w', arenaB: 'b' } as const;

const DIFFICULTIES: readonly { id: Difficulty; label: string }[] = [
  { id: 'easy', label: '쉬움' },
  { id: 'normal', label: '보통' },
  { id: 'hard', label: '어려움' },
];

export function SetupScreen({ mode, prefs: initialPrefs, onStart, onStartArena, onBack }: SetupScreenProps) {
  const [prefs, setPrefs] = useState<SetupPrefs>(initialPrefs);
  const [editing, setEditing] = useState<Slot>(mode === 'ai' ? 'me' : mode === 'arena' ? 'arenaW' : 'w');
  const isAi = mode === 'ai';
  const isArena = mode === 'arena';
  useBgm('title');

  const slots: readonly { key: Slot; label: string }[] = isAi
    ? [{ key: 'me', label: '나' }, { key: 'ai', label: 'AI' }]
    : isArena
      ? [{ key: 'arenaW', label: `${COLOR_NAME.w} AI` }, { key: 'arenaB', label: `${COLOR_NAME.b} AI` }]
      : [{ key: 'w', label: COLOR_NAME.w }, { key: 'b', label: COLOR_NAME.b }];

  const abilityOf = (slot: Slot) => {
    if (slot === 'me' || slot === 'ai') return prefs.ai[slot];
    if (slot === 'arenaW' || slot === 'arenaB') return prefs.arena.choices[ARENA_SLOT_COLOR[slot]];
    return prefs.local[slot];
  };
  const setAbility = (slot: Slot, abilityId: string) =>
    setPrefs((prev) => {
      if (slot === 'me' || slot === 'ai') return { ...prev, ai: { ...prev.ai, [slot]: abilityId } };
      if (slot === 'arenaW' || slot === 'arenaB') {
        const choices = { ...prev.arena.choices, [ARENA_SLOT_COLOR[slot]]: abilityId };
        return { ...prev, arena: { ...prev.arena, choices } };
      }
      return { ...prev, local: { ...prev.local, [slot]: abilityId } };
    });
  const setArenaDifficulty = (color: Color, difficulty: Difficulty) =>
    setPrefs((prev) => ({ ...prev, arena: { ...prev.arena, difficulty: { ...prev.arena.difficulty, [color]: difficulty } } }));

  const start = () => {
    if (isArena) {
      onStartArena(prefs.arena, prefs);
      return;
    }
    if (!isAi) {
      onStart({ ...resolveChoices(prefs.local), ai: null, mode: prefs.mode }, prefs);
      return;
    }
    const { me, ai, color, difficulty } = prefs.ai;
    const myColor: Color = color === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : color;
    const aiColor = opposite(myColor);
    const choices = { [myColor]: me, [aiColor]: ai } as AbilityChoice;
    onStart({ ...resolveChoices(choices), ai: { color: aiColor, difficulty }, mode: prefs.mode }, prefs);
  };

  return (
    <Page title={SETUP_TITLE[mode]} onBack={onBack}>

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

      {isArena && (
        <div className="ai-options">
          {(['w', 'b'] as const).map((color) => (
            <div key={color} className="segmented" role="radiogroup" aria-label={`${COLOR_NAME[color]} AI 난이도`}>
              <span className="segmented-label">{COLOR_NAME[color]}</span>
              {DIFFICULTIES.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  role="radio"
                  aria-checked={prefs.arena.difficulty[color] === id}
                  className={prefs.arena.difficulty[color] === id ? 'active' : ''}
                  onClick={() => setArenaDifficulty(color, id)}
                >
                  {label}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      {!isArena && <ModePicker mode={prefs.mode} onChange={(mode) => setPrefs((prev) => ({ ...prev, mode }))} />}

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
              {!isAi && !isArena && <span className={`player-dot dot-${key}`} />}
              <span className="player-pick-label">{label}</span>
              <AbilityIconView icon={spec.icon} size={18} />
              <strong>{abilityName(abilityId)}</strong>
            </button>
          );
        })}
      </div>

      <AbilityPicker
        label={`${slots.find((s) => s.key === editing)?.label ?? ''} 능력 선택`}
        selected={abilityOf(editing)}
        onSelect={(abilityId) => setAbility(editing, abilityId)}
      />

      <div className="page-actions">
        <button type="button" className="btn btn-primary btn-large" onClick={start}>
          시작
        </button>
      </div>
    </Page>
  );
}
