import { alchemy } from './alchemy';
import { brainwash } from './brainwash';
import { empress } from './empress';
import { chariot, heavyInfantry, lancer, paladin } from './enhancements';
import { haste } from './haste';
import { heir } from './heir';
import { march } from './march';
import { revive } from './revive';
import { rewind } from './rewind';
import { snipe } from './snipe';
import { telekinesis } from './telekinesis';
import { teleport } from './teleport';
import type { AbilityDefinition } from './types';
import { wall } from './wall';

const registry = new Map<string, AbilityDefinition>();

/** 새 능력은 정의를 만들고 여기에 등록만 하면 엔진에 연결된다 */
export function registerAbility(definition: AbilityDefinition): void {
  if (registry.has(definition.id)) throw new Error(`Ability already registered: ${definition.id}`);
  registry.set(definition.id, definition);
}

export function getAbility(id: string): AbilityDefinition {
  const definition = registry.get(id);
  if (!definition) throw new Error(`Unknown ability: ${id}`);
  return definition;
}

export function listAbilities(): AbilityDefinition[] {
  return [...registry.values()];
}

[
  telekinesis, haste, teleport, revive, rewind, heavyInfantry, lancer, chariot, paladin, empress, heir,
  alchemy, brainwash, wall, march, snipe,
].forEach(registerAbility);
