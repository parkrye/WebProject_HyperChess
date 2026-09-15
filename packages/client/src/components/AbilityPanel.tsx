import { getAbility, type Color, type GameState } from '@hyperchess/engine';
import type { CSSProperties, ReactNode } from 'react';
import { abilityUi } from '../abilityUi/specs';
import { abilityBlockReason, costLabel, COLOR_NAME, TIMING_LABEL } from '../abilityUi/text';
import type { InteractionController } from '../game/useInteraction';
import { AbilityIconView } from './AbilityIconView';

interface AbilityPanelProps {
  readonly state: GameState;
  /** 패널에 표시할 플레이어 (핫시트: 현재 차례, 온라인: 나) */
  readonly color: Color;
  readonly interaction: InteractionController;
  readonly busy: boolean;
}

/** 크기 측정용 선택지 값 (시간 역행 1~3턴) */
const SIZER_CHOICES: readonly number[] = [1, 2, 3];

/**
 * 능력 패널. 차례·대상 선택·게임 종료에 따라 내용이 바뀌어도 높이가 변하지 않도록
 * 양쪽 플레이어의 가능한 모든 모양을 보이지 않게 같은 칸에 겹쳐 두고, 가장 큰 크기를 차지한다.
 */
export function AbilityPanel({ state, color, interaction, busy }: AbilityPanelProps) {
  const abilities = [...new Set([state.players.w.abilityId, state.players.b.abilityId])];
  if (abilities.every((id) => id === null)) return null;

  const { abilityId } = state.players[color];
  const spec = abilityUi(abilityId ?? '');

  return (
    <section className="ability-panel" style={{ '--ability-color': spec.color } as CSSProperties}>
      <div className="ability-stack">
        {abilities.map((id) => (
          <AbilitySizers key={id ?? 'none'} abilityId={id} />
        ))}
        <div className="ability-live">
          <LiveContent state={state} color={color} interaction={interaction} busy={busy} />
        </div>
      </div>
    </section>
  );
}

function LiveContent({ state, color, interaction, busy }: AbilityPanelProps) {
  const { abilityId } = state.players[color];
  const head = <PanelHead color={color} abilityId={abilityId} />;

  if (!abilityId) {
    return (
      <>
        {head}
        <p className="ability-desc">능력 없이 두는 플레이어입니다.</p>
      </>
    );
  }
  if (state.result.kind !== 'ongoing') {
    return (
      <>
        {head}
        <ActionsView abilityId={abilityId} label="게임 종료" ready={false} disabled />
      </>
    );
  }

  const usable = state.turn === color ? interaction.abilityOptions.length : 0;
  const blockReason = abilityBlockReason(state, color, usable);
  const { step } = interaction;

  if (interaction.targeting) {
    const choices =
      step?.kind === 'choice'
        ? interaction.stepChoices.map((value) => (
            <button key={String(value)} type="button" className="btn btn-ability" onClick={() => interaction.pick(step.key, value)}>
              {step.label ? step.label(value) : String(value)}
            </button>
          ))
        : null;
    return (
      <>
        {head}
        <TargetingView prompt={step?.prompt ?? ''} choices={choices} onCancel={interaction.cancelAbility} />
      </>
    );
  }

  return (
    <>
      {head}
      <ActionsView
        abilityId={abilityId}
        label={blockReason ?? '능력 사용'}
        ready={!busy && !blockReason}
        disabled={busy || !!blockReason}
        onUse={interaction.startAbility}
      />
    </>
  );
}

/** 한 능력이 가질 수 있는 모양들(사용 대기 · 대상 선택)을 보이지 않게 렌더링해 자리를 잡는다 */
function AbilitySizers({ abilityId }: { abilityId: string | null }) {
  const head = <PanelHead color="w" abilityId={abilityId} />;
  if (!abilityId) {
    return (
      <div className="ability-sizer" aria-hidden inert>
        {head}
        <p className="ability-desc">능력 없이 두는 플레이어입니다.</p>
      </div>
    );
  }

  const steps = abilityUi(abilityId).steps;
  const longestPrompt = steps.reduce((longest, s) => (s.prompt.length > longest.length ? s.prompt : longest), '');
  const choiceStep = steps.find((s) => s.kind === 'choice');
  const choices = choiceStep
    ? (choiceStep.samples ?? SIZER_CHOICES).map((value) => (
        <button key={String(value)} type="button" className="btn btn-ability">
          {choiceStep.label ? choiceStep.label(value) : String(value)}
        </button>
      ))
    : null;

  return (
    <>
      <div className="ability-sizer" aria-hidden inert>
        {head}
        <ActionsView abilityId={abilityId} label="능력 사용" ready={false} disabled />
      </div>
      <div className="ability-sizer" aria-hidden inert>
        {head}
        <TargetingView prompt={longestPrompt} choices={choices} onCancel={() => {}} />
      </div>
    </>
  );
}

function PanelHead({ color, abilityId }: { color: Color; abilityId: string | null }) {
  if (!abilityId) {
    return (
      <header className="ability-head">
        <div className="ability-name">{COLOR_NAME[color]} · 능력 없음</div>
      </header>
    );
  }
  const definition = getAbility(abilityId);
  return (
    <header className="ability-head">
      <span className="ability-icon">
        <AbilityIconView icon={abilityUi(abilityId).icon} size={22} />
      </span>
      <div>
        <div className="ability-name">
          {COLOR_NAME[color]} · {definition.name}
        </div>
        <div className="ability-meta">
          {TIMING_LABEL[definition.timing]} · 비용 {costLabel(abilityId)}
        </div>
      </div>
    </header>
  );
}

interface ActionsViewProps {
  readonly abilityId: string;
  readonly label: string;
  readonly ready: boolean;
  readonly disabled: boolean;
  readonly onUse?: () => void;
}

function ActionsView({ abilityId, label, ready, disabled, onUse }: ActionsViewProps) {
  return (
    <div className="ability-actions">
      <p className="ability-desc">{getAbility(abilityId).description}</p>
      <button type="button" className={`btn btn-ability ${ready ? 'is-ready' : ''}`} disabled={disabled} onClick={onUse}>
        {label}
      </button>
    </div>
  );
}

function TargetingView({ prompt, choices, onCancel }: { prompt: string; choices: ReactNode; onCancel: () => void }) {
  return (
    <div className="ability-targeting">
      <p className="ability-prompt">{prompt}</p>
      {choices && <div className="choice-row">{choices}</div>}
      <button type="button" className="btn btn-ghost" onClick={onCancel}>
        취소
      </button>
    </div>
  );
}
