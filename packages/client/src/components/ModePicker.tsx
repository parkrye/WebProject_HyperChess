import type { Deployment, GameMode } from '@hyperchess/engine';
import { DEPLOYMENT_DESCRIPTION, DEPLOYMENT_LABEL, FOG_DESCRIPTION, SECRET_DESCRIPTION, THRONE_DESCRIPTION } from '../abilityUi/text';

const DEPLOYMENTS: readonly Deployment[] = ['standard', 'draft', 'chaos'];

type RuleKey = 'fog' | 'secret' | 'throne';
const RULES: readonly { key: RuleKey; label: string; description: string }[] = [
  { key: 'fog', label: '안개', description: FOG_DESCRIPTION },
  { key: 'secret', label: '비밀 능력', description: SECRET_DESCRIPTION },
  { key: 'throne', label: '왕좌 점령', description: THRONE_DESCRIPTION },
];

interface ModePickerProps {
  readonly mode: GameMode;
  readonly onChange: (mode: GameMode) => void;
  readonly disabled?: boolean;
}

/** 게임 모드 선택: 시작 배치 하나 + 규칙(안개·비밀 능력·왕좌 점령) 켜기/끄기 */
export function ModePicker({ mode, onChange, disabled = false }: ModePickerProps) {
  return (
    <div className="mode-picker">
      <div className="mode-row">
        <div className="segmented" role="radiogroup" aria-label="시작 배치">
          {DEPLOYMENTS.map((deployment) => (
            <button
              key={deployment}
              type="button"
              role="radio"
              aria-checked={mode.deployment === deployment}
              className={mode.deployment === deployment ? 'active' : ''}
              disabled={disabled}
              onClick={() => onChange({ ...mode, deployment })}
            >
              {DEPLOYMENT_LABEL[deployment]}
            </button>
          ))}
        </div>
        <div className="segmented mode-rules" role="group" aria-label="규칙">
          {RULES.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              aria-pressed={mode[key]}
              className={mode[key] ? 'active' : ''}
              disabled={disabled}
              onClick={() => onChange({ ...mode, [key]: !mode[key] })}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <p className="mode-description">
        {[DEPLOYMENT_DESCRIPTION[mode.deployment], ...RULES.filter(({ key }) => mode[key]).map(({ description }) => description)].join(' ')}
      </p>
    </div>
  );
}
