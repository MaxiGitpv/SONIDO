import type { ReactNode } from 'react';
import { useLive, Icon } from './ctx';
import type { Tab } from './types';

/** Cabecera común de cada módulo ampliado, con regreso al inicio. */
export function ModuleHead({ title, desc, children }: { title: string; desc?: string; children?: ReactNode }) {
  const { d } = useLive();
  return (
    <header className="mhead">
      <button className="backbtn" onClick={() => d({ type: 'tab', tab: 'live' })}>
        <Icon name="prev" size={18} /> Inicio
      </button>
      <div className="mhead-t">
        <h2>{title}</h2>
        {desc && <p>{desc}</p>}
      </div>
      {children && <div className="mhead-x">{children}</div>}
    </header>
  );
}

/** Botón para abrir un panel del inicio en su propia pestaña amplia. */
export function Expand({ tab, label }: { tab: Tab; label: string }) {
  const { d } = useLive();
  return (
    <button className="xpand" title={`Abrir ${label} en pantalla amplia`} aria-label={`Abrir ${label} en pantalla amplia`} onClick={() => d({ type: 'tab', tab })}>
      <Icon name="expand" size={14} />
    </button>
  );
}

