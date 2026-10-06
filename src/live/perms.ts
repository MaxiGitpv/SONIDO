import table from '../../shared/permissions.json';

export type Role = 'all' | 'mixer' | 'director' | 'musico';
export type Area = 'music' | 'midi' | 'console' | 'buses' | 'master' | 'fx' | 'inputs' | 'outputs' | 'mixscenes' | 'transport' | 'admin';

const AREAS = table.areas as Record<string, Area>;
const ROLES = table.roles as Record<Role, string[]>;
export const ROLE_LABEL = table.labels as Record<Role, string>;

/** Área de una acción; las acciones de interfaz local (pestañas, selección…) no tienen área. */
export const areaOf = (type: string): Area | null => AREAS[type] ?? null;

export function can(role: Role, area: Area): boolean {
  return ROLES[role]?.includes(area) ?? false;
}

/** ¿Puede este rol ejecutar esta acción? `bus` limita al músico a su propia mezcla de monitor. */
export function allowed(role: Role, action: { type: string; bus?: string; patch?: Record<string, unknown> }, ownBus?: string): boolean {
  const area = areaOf(action.type);
  if (!area) return true;
  if (role === 'musico') return action.type === 'aux' && !!ownBus && action.bus === ownBus;
  // El órgano (rotary) es parte del sonido: el director puede cambiarlo aunque los demás efectos sean del sonidista.
  if (action.type === 'fx' && action.patch && Object.keys(action.patch).every((k) => k === 'rotary')) return can(role, 'music') || can(role, 'fx');
  return can(role, area);
}
