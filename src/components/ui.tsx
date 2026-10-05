import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { fmtDb, parseDb } from '../util';

export function Btn({ on, kind, children, onClick, disabled, title, className = '' }: {
  on?: boolean;
  kind?: 'mute' | 'solo' | 'cyan' | 'plain';
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  title?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`btn ${kind ?? 'plain'}${on ? ' on' : ''} ${className}`}
      aria-pressed={on}
      disabled={disabled}
      title={title}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function Panel({ title, right, children, className = '' }: { title: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`panel ${className}`}>
      <header className="panel-h">
        <h3>{title}</h3>
        {right}
      </header>
      <div className="panel-b">{children}</div>
    </section>
  );
}

/** Lectura de dB que también se puede escribir (Enter o salir del campo para aplicar). */
export function DbField({ value, onChange, label, disabled }: { value: number; onChange: (v: number) => void; label: string; disabled?: boolean }) {
  const [draft, setDraft] = useState<string | null>(null);
  useEffect(() => setDraft(null), [value]);
  const commit = () => {
    if (draft !== null) {
      const v = parseDb(draft);
      if (v !== null) onChange(v);
    }
    setDraft(null);
  };
  return (
    <input
      className="dbfield"
      aria-label={label}
      disabled={disabled}
      inputMode="decimal"
      value={draft ?? (disabled ? '—' : fmtDb(value))}
      onFocus={(e) => e.currentTarget.select()}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          setDraft(null);
          e.currentTarget.blur();
        }
      }}
    />
  );
}
