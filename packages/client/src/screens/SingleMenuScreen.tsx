import { useBgm } from '../audio/bgm';
import { MenuCard, type MenuCardArt } from '../components/MenuCard';
import { Page } from '../components/Page';
import type { SetupMode } from './SetupScreen';

export const SETUP_TITLE: Readonly<Record<SetupMode, string>> = {
  local: '로컬 플레이',
  ai: 'AI 대전',
  arena: 'AI 내전',
};

const SETUP_HINT: Readonly<Record<SetupMode, string>> = {
  local: '한 기기에서 번갈아 둔다',
  ai: 'AI와 한 판 둔다',
  arena: 'AI끼리 두는 것을 지켜본다',
};

const SETUP_ART: Readonly<Record<SetupMode, readonly MenuCardArt[]>> = {
  local: [
    { type: 'q', color: 'w' },
    { type: 'q', color: 'b' },
  ],
  ai: [
    { type: 'k', color: 'w' },
    { type: 'n', color: 'b' },
  ],
  arena: [
    { type: 'n', color: 'w' },
    { type: 'n', color: 'b' },
  ],
};

interface SingleMenuScreenProps {
  readonly onSelect: (mode: SetupMode) => void;
  readonly onBack: () => void;
}

export function SingleMenuScreen({ onSelect, onBack }: SingleMenuScreenProps) {
  useBgm('title');
  return (
    <Page title="싱글" onBack={onBack}>
      <nav className="menu-cards menu-cards-3" aria-label="싱글 메뉴">
        {(Object.keys(SETUP_TITLE) as SetupMode[]).map((mode) => (
          <MenuCard key={mode} label={SETUP_TITLE[mode]} hint={SETUP_HINT[mode]} art={SETUP_ART[mode]} onClick={() => onSelect(mode)} />
        ))}
      </nav>
    </Page>
  );
}
