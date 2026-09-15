import type { AbilityIcon } from '../abilityUi/specs';
import { abilityIconSprite } from '../assets/sprites';

export function AbilityIconView({ icon, size = 20, className }: { icon: AbilityIcon; size?: number; className?: string }) {
  return <img className={`icon-img ${className ?? ''}`} src={abilityIconSprite(icon)} width={size} height={size} alt="" draggable={false} />;
}
