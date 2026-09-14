import type { AbilityIcon } from '../abilityUi/specs';

const PATHS: Record<AbilityIcon, { d: string; fill?: boolean }[]> = {
  telekinesis: [{ d: 'M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6' }, { d: 'M4 12a8 8 0 0 1 16 0M6.5 16a8 8 0 0 0 11 0' }],
  haste: [{ d: 'M13 2L4 14h7l-1 8 9-12h-7z', fill: true }],
  teleport: [{ d: 'M4 8h14l-3.5-3.5M20 16H6l3.5 3.5' }],
  revive: [{ d: 'M12 21V11M7.5 14.5h9' }, { d: 'M12 3.5a3.5 3.5 0 1 0 0.01 0' }],
  rewind: [{ d: 'M4.5 12a7.5 7.5 0 1 0 2.2-5.3' }, { d: 'M4 3.5v4.5h4.5M12 8v4.5l3 2' }],
  shield: [{ d: 'M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z' }],
  lance: [{ d: 'M4 20L15 9' }, { d: 'M13 5l6-1-1 6z', fill: true }],
  wheel: [{ d: 'M12 4a8 8 0 1 0 0.01 0' }, { d: 'M12 4v16M4 12h16M6.3 6.3l11.4 11.4M17.7 6.3L6.3 17.7' }],
  cross: [{ d: 'M10 3h4v6h6v4h-6v8h-4v-8H4V9h6z', fill: true }],
  crown: [{ d: 'M3 18h18l-1.5-10-4.5 4-3-7-3 7-4.5-4z', fill: true }],
  heir: [{ d: 'M6 16h12l1-7-3.5 3L12 7l-3.5 5L5 9z', fill: true }, { d: 'M5 20h14' }],
};

export function AbilityIconView({ icon, size = 20, className }: { icon: AbilityIcon; size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      {PATHS[icon].map(({ d, fill }) => (
        <path
          key={d}
          d={d}
          fill={fill ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth={fill ? 1 : 2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}
