import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useLive, Icon, Art } from './ctx';
import { CATS, SOUNDS, soundById } from './data';
import { engine } from './engine';
import { Expand } from './nav';

// La lista se desmonta al cambiar de módulo: su posición se recuerda aquí para volver al mismo punto.
let repScroll = 0;
const readFold = () => {
  try {
    return localStorage.getItem('sonido.ui.bankFolded') === '1';
  } catch {
    return false;
  }
};

export function Repertoire() {
  const { s, d } = useLive();
  const list = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = list.current;
    if (!el) return;
    el.scrollTop = repScroll;
    const cur = el.querySelector<HTMLElement>('.songrow.on');
    // Si la canción activa quedó fuera de la vista, se acerca sin saltar al principio.
    if (cur && (cur.offsetTop < el.scrollTop || cur.offsetTop + cur.offsetHeight > el.scrollTop + el.clientHeight)) cur.scrollIntoView({ block: 'nearest' });
  }, []);
  useEffect(() => {
    list.current?.querySelector<HTMLElement>('.songrow.on')?.scrollIntoView({ block: 'nearest' });
  }, [s.songId]);
  return (
    <section className="lpanel rep-panel">
      <header className="ph">
        <Icon name="list" />
        <h3>Repertorio</h3>
        <button className="iconbtn" aria-label="Añadir canción" title="Añadir canción" onClick={() => d({ type: 'songAdd' })}>
          <Icon name="plus" />
        </button>
        <Expand tab="scenes" label="Escenas y repertorio" />
      </header>
      <p className="setlist">Domingo · Adoración <small>· {s.songs.length} canciones</small></p>
      <div ref={list} className="rep-list" tabIndex={0} role="region" aria-label="Lista de canciones (desplazable)" onScroll={(e) => (repScroll = e.currentTarget.scrollTop)}>
      <ol className="songs">
        {s.songs.map((song, i) => (
          <li key={song.id}>
            <button className={`songrow${song.id === s.songId ? ' on' : ''}`} aria-current={song.id === s.songId} onClick={() => d({ type: 'song', id: song.id })}>
              <span className="num">{String(i + 1).padStart(2, '0')}</span>
              <span className="st">
                <b>{song.title}</b>
                <small>{song.bpm} BPM · {song.key} mayor</small>
              </span>
            </button>
          </li>
        ))}
      </ol>
      </div>
    </section>
  );
}

export function SoundBank() {
  const { s, d, mix } = useLive();
  const list = SOUNDS.filter((x) => x.cat === s.soundCat);
  const [folded, setFolded] = useState(readFold);
  const fold = () => {
    setFolded(!folded);
    try {
      localStorage.setItem('sonido.ui.bankFolded', folded ? '0' : '1');
    } catch {
      /* sin almacenamiento: solo dura esta sesión */
    }
  };
  return (
    <section className={`lpanel bank-panel${folded ? ' folded' : ''}`}>
      <header className="ph">
        <Icon name="layers" />
        <h3>Banco de sonidos</h3>
        <button className="iconbtn" aria-expanded={!folded} aria-label={folded ? 'Mostrar banco de sonidos' : 'Plegar banco de sonidos'} title={folded ? 'Mostrar' : 'Plegar'} onClick={fold}>
          <Icon name={folded ? 'plus' : 'x'} size={14} />
        </button>
        <Expand tab="sounds" label="Sonidos" />
      </header>
      {folded ? (
        <p className="bank-foot">Activo: <b>{soundById(mix.sound).name}</b></p>
      ) : (
      <>
      <div className="cats" role="tablist">
        {CATS.map((c) => (
          <button key={c} role="tab" aria-selected={c === s.soundCat} className={`cat${c === s.soundCat ? ' on' : ''}`} onClick={() => d({ type: 'cat', cat: c })}>
            {c}
          </button>
        ))}
      </div>
      <div className="bank">
        {list.map((x) => (
          <button key={x.id} className={`bankcard${x.id === mix.sound ? ' on' : ''}`} aria-pressed={x.id === mix.sound}
            onClick={() => {
              engine.ensure();
              d({ type: 'sound', id: x.id });
              d({ type: 'toast', text: `«${x.name}» asignado a ${s.songs.find((x) => x.id === s.songId)?.sections.find((x) => x.id === s.sceneId)?.label ?? 'la sección actual'}` });
            }}>
            <Art ch={x.layers[0].ch} />
            <span className="bc-t">
              <b>{x.name}</b>
              <small>{x.desc}</small>
            </span>
          </button>
        ))}
      </div>
      <p className="bank-foot">Activo: <b>{soundById(mix.sound).name}</b></p>
      </>
      )}
    </section>
  );
}
