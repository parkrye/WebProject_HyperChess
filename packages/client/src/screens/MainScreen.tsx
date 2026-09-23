import { useBgm } from '../audio/bgm';
import { uiSprite } from '../assets/sprites';
import { MenuCard } from '../components/MenuCard';
import { Page } from '../components/Page';

export type MenuTarget = 'single' | 'online' | 'guide' | 'replays';

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
        <MenuCard label="싱글" hint="AI와 겨루거나 한 기기에서 둘이" art={[{ type: 'k', color: 'w' }]} onClick={() => onSelect('single')} />
        <MenuCard
          label="멀티"
          hint="방을 만들거나 빠른 매칭으로"
          art={[
            { type: 'k', color: 'w' },
            { type: 'k', color: 'b' },
          ]}
          onClick={() => onSelect('online')}
        />
        <MenuCard label="능력 설명" hint="16가지 능력의 효과를 예시로 본다" art={[{ type: 'q', color: 'w' }]} onClick={() => onSelect('guide')} />
        <MenuCard label="리플레이" hint="저장한 대국을 다시 본다" art={[{ type: 'r', color: 'b' }]} onClick={() => onSelect('replays')} />
      </nav>
    </Page>
  );
}
