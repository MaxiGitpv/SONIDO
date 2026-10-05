import { useEffect, useMemo, useReducer, useState } from 'react';
import { PerfCtx, blend } from './ctx';
import type { PerfCtxValue } from './ctx';
import { perfInit, perfReducer, perfSave } from './store';
import { SONGS } from './data';
import { Keyboard } from './Keyboard';
import { EditView } from './Edit';
import { FaderRow, MacroPanel, Repertoire, SceneBar, SoundPanel, TestPanel, Transport } from './Panels';
import { useMedia } from '../ctx';

export function PerfApp() {
  const [s, d] = useReducer(perfReducer, undefined, perfInit);
  const wide = useMedia('(min-width: 1280px)');
  const tablet = !wide;
  const [songOpen, setSongOpen] = useState(false);

  const mixes = s.mix[s.songId];
  const view = s.test.on ? blend(mixes.verso, mixes.coro, s.test.t) : mixes[s.sceneId];
  const song = SONGS.find((x) => x.id === s.songId)!;

  useEffect(() => perfSave(s), [s.songId, s.sceneId, s.mix, s.inst, s.fx, s.master, s.midi]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!s.toast) return;
    const t = window.setTimeout(() => d({ type: 'toast', text: '' }), 2800);
    return () => window.clearTimeout(t);
  }, [s.toast?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const ctx = useMemo<PerfCtxValue>(() => ({ s, d, view, tablet }), [s, view, tablet]);
  const inlineEdit = s.edit && !tablet;

  return (
    <PerfCtx.Provider value={ctx}>
      <div className={`perf ${tablet ? 'tab' : 'desk'}${inlineEdit ? ' editmode' : ''}${s.test.on ? ' testing' : ''}`}>
        {tablet && (
          <div className="songbar">
            <button className="songpick" aria-expanded={songOpen} onClick={() => setSongOpen((o) => !o)}>
              <span className="eyebrow">Canción</span>
              <b>{song.title}</b>
              <span className="song-k">{song.key}</span>
              <span className="song-b">{song.bpm}<small>BPM</small></span>
              <span aria-hidden="true">▾</span>
            </button>
            {songOpen && (
              <div className="song-pop">
                <Repertoire onPick={() => setSongOpen(false)} />
              </div>
            )}
          </div>
        )}

        <div className="topscenes">
          <SceneBar />
          <div className="tools">
            <button className={`tbtn tool${s.test.on ? ' on' : ''}`} aria-pressed={s.test.on} onClick={() => d({ type: 'test', patch: { on: !s.test.on, t: 0, auto: false } })}>
              {tablet ? 'Prueba' : 'Modo prueba'}
            </button>
            <button className={`tbtn tool${s.edit ? ' on' : ''}`} aria-pressed={s.edit} onClick={() => d({ type: 'edit', on: !s.edit })}>
              {tablet ? 'Ajustes' : 'Edición'}
            </button>
          </div>
        </div>

        {!tablet && (
          <aside className="repcol">
            <h3 className="eyebrow">Repertorio</h3>
            <Repertoire />
            <div className="rep-foot">
              <b>{song.title}</b>
              <span>Tonalidad {song.key} · {song.bpm} BPM</span>
              <button className="linkbtn" onClick={() => d({ type: 'resetSong' })}>Restablecer escenas de esta canción</button>
            </div>
          </aside>
        )}

        <div className="center">
          {!inlineEdit && (
            <>
              <SoundPanel />
              {s.test.on && <TestPanel />}
              <section className="kbsec">
                <Keyboard setup={s.inst} mix={view} held={s.held} onNote={(n, down) => d({ type: 'note', note: n, down })} compact={tablet} />
                <p className="kb-note">Motor de audio pendiente · las teclas solo se iluminan</p>
              </section>
            </>
          )}
        </div>
        {!inlineEdit && <MacroPanel />}
        {inlineEdit && <div className="editarea"><EditView /></div>}

        <FaderRow />
        <Transport />

        {tablet && s.edit && (
          <>
            <div className="scrim" onClick={() => d({ type: 'edit', on: false })} />
            <EditView drawer />
          </>
        )}
        <div className="toast" role="status" aria-live="polite">{s.toast?.text}</div>
      </div>
    </PerfCtx.Provider>
  );
}
