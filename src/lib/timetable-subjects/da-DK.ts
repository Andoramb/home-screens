import type { DefaultSubject } from './types';

// ---------------------------------------------------------------------------
// Built-in subject catalogue - da-DK (Denmark, folkeskole)
// ---------------------------------------------------------------------------

export const DA_DK_SUBJECTS: DefaultSubject[] = [
  { id: 'da', code: 'Da', name: 'Dansk', color: '#f26363', icon: 'book' },
  { id: 'ma', code: 'Ma', name: 'Matematik', color: '#4f8ef7', icon: 'triangle' },
  { id: 'en', code: 'En', name: 'Engelsk', color: '#f2c94c', icon: 'speech' },
  { id: 'ty', code: 'Ty', name: 'Tysk', color: '#f58b3c', icon: 'speech' },
  { id: 'fr', code: 'Fr', name: 'Fransk', color: '#f58b3c', icon: 'speech' },
  { id: 'bio', code: 'Bio', name: 'Biologi', color: '#43c07e', icon: 'leaf' },
  { id: 'fyke', code: 'Fy/ke', name: 'Fysik/kemi', color: '#26b5a8', icon: 'flask' },
  { id: 'geo', code: 'Geo', name: 'Geografi', color: '#b5c23a', icon: 'globe', bring: 'Atlas' },
  { id: 'his', code: 'His', name: 'Historie', color: '#e0a86e', icon: 'castle' },
  { id: 'sam', code: 'Sam', name: 'Samfundsfag', color: '#7c8cf8', icon: 'people' },
  { id: 'kri', code: 'Kri', name: 'Kristendomskundskab', color: '#c084fc', icon: 'star' },
  { id: 'bil', code: 'Bil', name: 'Billedkunst', color: '#ee6fd8', icon: 'palette', bring: 'Tegnesager' },
  { id: 'hd', code: 'HD', name: 'Håndværk og design', color: '#ee6fd8', icon: 'palette' },
  { id: 'mus', code: 'Mus', name: 'Musik', color: '#fb6f92', icon: 'music' },
  { id: 'idr', code: 'Idr', name: 'Idræt', color: '#8fdc4e', icon: 'ball', bring: 'Idrætstøj' },
  { id: 'nat', code: 'Nat', name: 'Natur/teknologi', color: '#2fc48d', icon: 'magnifier' },
  { id: 'klt', code: 'Klt', name: 'Klassens tid', color: '#cbd5e1', icon: 'chat' },
  { id: 'sto', code: 'Stø', name: 'Støtteundervisning', color: '#a1a1aa', icon: 'heart' },
  { id: 'fro', code: 'Fro', name: 'Frokost', color: '#a1a1aa', icon: 'people' },
];

// ---------------------------------------------------------------------------
// Where a long name may break across two lines
// ---------------------------------------------------------------------------

/**
 * Each entry is one subject name split into the parts it may break between,
 * so a compound breaks at its seam ("Samfunds-fag") rather than wherever
 * automatic hyphenation happens to fill the line best. The parts are joined
 * back into the name itself, so an entry can never disagree with the subject
 * it belongs to.
 */
export const DA_DK_NAME_SEAMS: string[][] = [
  ['Kristendoms', 'kundskab'],
  ['Støtte', 'undervisning'],
  ['Samfunds', 'fag'],
  ['Billed', 'kunst'],
  ['Mate', 'matik'],
];
