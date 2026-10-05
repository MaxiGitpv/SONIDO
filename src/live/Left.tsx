import { useLive, Icon, Art } from './ctx';
import { CATS, SOUNDS, soundById } from './data';
import { engine } from './engine';

export function Repertoire() {
  const { s, d } = useLive();
  return (
    <section className="lpanel rep-panel">
      <header className="ph">
        <Icon name="list" />
        <h3>Repertorio</h3>
        <button className="iconbtn" aria-label="Añadir canción" title="Añadir canción" onClick={() => d({ type: 'songAdd' })}>
          <Icon name="plus" />
        </button>
      </header>
      <p className="setlist">Domingo · Adoración</p>
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
    </section>
  );
}

export function SoundBank() {
  const { s, d, mix } = useLive();
  const list = SOUNDS.filter((x) => x.cat === s.soundCat);
  return (
    <section className="lpanel bank-panel">
      <header className="ph">
        <Icon name="layers" />
        <h3>Banco de sonidos</h3>
      </header>
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
              d({ type: 'toast', text: `«${x.name}» asignado a ${soundLabel(s.sceneId)}` });
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
    </section>
  );
}

const soundLabel = (id: string) => ({ intro: 'Intro', verso: 'Verso', coro: 'Coro', puente: 'Puente', final: 'Final' } as Record<string, string>)[id];
