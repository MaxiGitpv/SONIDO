import type { Style } from './types';

/*
 * Patrones por estilo en semicorcheas. Cada cadena tiene 16 pasos (un compás) o 32 (dos compases).
 * Batería: 'x' golpe fuerte, 'o' suave, '.' silencio.
 * Bajo: R raíz, 5 quinta, 8 octava, 3 tercera, a anticipa la raíz del acorde siguiente.
 * Comp: 'x' acorde corto del piano o la guitarra (si falta, se usan los patrones de cada escena).
 */

export type Hit = 'kick' | 'snare' | 'clap' | 'hat' | 'ohat' | 'crash' | 'tomH' | 'tomL' | 'rim' | 'conga' | 'congaLo' | 'bongo' | 'cowbell' | 'guira' | 'shaker' | 'clave' | 'tambora' | 'surdo' | 'tamborim';
export const PERC_HITS: Hit[] = ['conga', 'congaLo', 'bongo', 'cowbell', 'guira', 'shaker', 'clave', 'tambora', 'surdo', 'tamborim'];

export interface Groove {
  drums: Partial<Record<Hit, string>>;
  bass: string;
  comp?: string;
  fills: boolean;
}

export const GROOVES: Record<Style, Groove> = {
  worship: {
    drums: { kick: 'x.......x.x.....', snare: '....x.......x...', hat: 'x.o.x.o.x.o.x.o.' },
    bass: 'R.....R.R.......',
    fills: true,
  },
  balada: {
    drums: { kick: 'x.........x.....', rim: '....x.......x...', hat: 'x...o...x...o...' },
    bass: 'R.......5.......',
    fills: true,
  },
  jubilo: {
    drums: { kick: 'x...x...x...x...', snare: '....x.......x...', clap: '....x.......x...', ohat: '..x...x...x...x.' },
    bass: 'R.5.R.5.R.5.8.5.',
    comp: '..x...x...x...x.',
    fills: true,
  },
  funk: {
    drums: { kick: 'x..x..x...x..x..', snare: '....x..o.o..x...', hat: 'xoxoxoxoxoxoxoxo' },
    bass: 'R..8..R...5.R.8.',
    comp: '..x..x....x..x..',
    fills: true,
  },
  salsa: {
    drums: { kick: '...........o...................o' },
    bass: '......5.....a...',
    comp: 'x..x..x...x..x..',
    fills: false,
  },
  tumbao: {
    drums: {},
    bass: '......5.....a...',
    comp: '...x..x....x..x.',
    fills: false,
  },
  merengue: {
    drums: { kick: 'x...x...x...x...' },
    bass: 'R...5...R...5.R.',
    comp: '..x...x...x...x.',
    fills: false,
  },
  samba: {
    drums: { kick: 'x.....x.x.....x.', rim: 'x..x..x.x..x..x.' },
    bass: 'R.....R.5.....5.',
    comp: '..x..x....x..x..',
    fills: false,
  },
};

export const PERC: Record<Style, Partial<Record<Hit, string>>> = {
  worship: { shaker: 'o.x.o.x.o.x.o.x.' },
  balada: { shaker: 'o...o...o...o...' },
  jubilo: { shaker: 'xoxoxoxoxoxoxoxo', tamborim: '....x.......x...' },
  funk: { shaker: 'oxoxoxoxoxoxoxox', conga: '......o.......x.' },
  // Clave de son 3-2 en dos compases, campana a negras, tumbao de conga.
  salsa: { clave: 'x.....x.....x.......x...x.......', cowbell: 'x...x...x...x...', conga: '....o.......x.x.', congaLo: '..............x.', bongo: 'x.oox.oox.oox.oo' },
  tumbao: { clave: '..x...x.....x...x.....x.........', conga: '....o.......x.x.', congaLo: '..x...........x.', bongo: 'x.oox.oox.oox.oo' },
  merengue: { guira: 'x.xxx.xxx.xxx.xx', tambora: 'x...x..xx...x..x' },
  samba: { surdo: 'o...x...o...x...', tamborim: 'x.xx.x.xx.x.x.x.', shaker: 'xoooxoooxoooxooo' },
};

export const at = (pattern: string | undefined, step: number): '' | 'x' | 'o' => {
  if (!pattern) return '';
  const c = pattern[step % pattern.length];
  return c === 'x' ? 'x' : c === 'o' ? 'o' : '';
};
