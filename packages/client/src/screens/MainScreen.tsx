import { useBgm } from '../audio/bgm';
import { uiSprite } from '../assets/sprites';
import { MenuCard } from '../components/MenuCard';
import { Page } from '../components/Page';

export type MenuTarget = 'single' | 'online';

interface MainScreenProps {
  readonly onSelect: (target: MenuTarget) => void;
  readonly onBack: () => void;
}

export function MainScreen({ onSelect, onBack }: MainScreenProps) {
  useBgm('title');

  return (
    <Page onBack={onBack} backLabel="타이틀">
      <h1 className="logo logo-small">
        <img src={uiSprite.logo} alt="HyperChess" draggable={false} />
      </h1>
      <nav className="menu-cards" aria-label="메인 메뉴">
        <MenuCard label="싱글" art={[{ type: 'k', color: 'w' }]} onClick={() => onSelect('single')} />
        <MenuCard
          label="멀티"
          art={[
            { type: 'k', color: 'w' },
            { type: 'k', color: 'b' },
          ]}
          onClick={() => onSelect('online')}
        />
      </nav>
    </Page>
  );
}
