import type { Deployment, GameMode } from '@hyperchess/engine';
import { DEPLOYMENT_DESCRIPTION, DEPLOYMENT_LABEL, FOG_DESCRIPTION } from '../abilityUi/text';

const DEPLOYMENTS: readonly Deployment[] = ['standard', 'draft', 'chaos'];

interface ModePickerProps {
  readonly mode: GameMode;
  readonly onChange: (mode: GameMode) => void;
  readonly disabled?: boolean;
}

/** 게임 모드 선택: 시작 배치 하나 + 안개전 켜기/끄기 */
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
        <div className="segmented mode-fog" role="group" aria-label="안개전">
          <button
            type="button"
            aria-pressed={mode.fog}
            className={mode.fog ? 'active' : ''}
            disabled={disabled}
            onClick={() => onChange({ ...mode, fog: !mode.fog })}
          >
            안개 {mode.fog ? '켜짐' : '꺼짐'}
          </button>
        </div>
      </div>
      <p className="mode-description">
        {DEPLOYMENT_DESCRIPTION[mode.deployment]}
        {mode.fog && ` ${FOG_DESCRIPTION}`}
      </p>
    </div>
  );
}
