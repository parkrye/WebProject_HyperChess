import { useBgm } from '../audio/bgm';
import { Page } from '../components/Page';
import type { SetupMode } from './SetupScreen';

export const SETUP_TITLE: Readonly<Record<SetupMode, string>> = {
  local: '로컬 플레이',
  ai: 'AI 대전',
  arena: 'AI 내전',
};

interface SingleMenuScreenProps {
  readonly onSelect: (mode: SetupMode) => void;
  readonly onBack: () => void;
}

export function SingleMenuScreen({ onSelect, onBack }: SingleMenuScreenProps) {
  useBgm('title');
  return (
    <Page title="싱글" onBack={onBack}>
      <nav className="menu-list" aria-label="싱글 메뉴">
        {(Object.keys(SETUP_TITLE) as SetupMode[]).map((mode) => (
          <button key={mode} type="button" className="btn menu-button" onClick={() => onSelect(mode)}>
            {SETUP_TITLE[mode]}
          </button>
        ))}
      </nav>
    </Page>
  );
}
