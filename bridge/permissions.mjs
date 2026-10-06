// Validación de permisos en el servicio: la misma tabla que usa la app (shared/permissions.json).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const table = JSON.parse(readFileSync(join(here, '..', 'shared', 'permissions.json'), 'utf8'));

export const ROLE_LABEL = table.labels;
export const areaOf = (type) => table.areas[type] ?? null;
export const can = (role, area) => (table.roles[role] ?? []).includes(area);

/** Igual que src/live/perms.ts: cualquier cambio de reglas se hace en shared/permissions.json. */
export function allowed(role, action, ownBus) {
  const area = areaOf(action?.type);
  if (!area) return !!action?.type;
  if (role === 'musico') return action.type === 'aux' && !!ownBus && action.bus === ownBus;
  if (action.type === 'fx' && action.patch && Object.keys(action.patch).every((k) => k === 'rotary')) return can(role, 'music') || can(role, 'fx');
  return can(role, area);
}
