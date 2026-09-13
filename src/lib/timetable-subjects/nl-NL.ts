import type { DefaultSubject } from './types';

// ---------------------------------------------------------------------------
// Built-in subject catalogue - nl-NL (Netherlands, basisschool and voortgezet)
// ---------------------------------------------------------------------------

export const NL_NL_SUBJECTS: DefaultSubject[] = [
  { id: 'ne', code: 'Ne', name: 'Nederlands', color: '#f26363', icon: 'book' },
  { id: 'wi', code: 'Wi', name: 'Wiskunde', color: '#4f8ef7', icon: 'triangle' },
  { id: 'en', code: 'En', name: 'Engels', color: '#f2c94c', icon: 'speech' },
  { id: 'fa', code: 'Fa', name: 'Frans', color: '#f58b3c', icon: 'speech' },
  { id: 'du', code: 'Du', name: 'Duits', color: '#f58b3c', icon: 'speech' },
  { id: 'bi', code: 'Bi', name: 'Biologie', color: '#43c07e', icon: 'leaf' },
  { id: 'sk', code: 'Sk', name: 'Scheikunde', color: '#26b5a8', icon: 'flask' },
  { id: 'na', code: 'Na', name: 'Natuurkunde', color: '#3ab7f0', icon: 'atom' },
  { id: 'ak', code: 'Ak', name: 'Aardrijkskunde', color: '#b5c23a', icon: 'globe', bring: 'Atlas' },
  { id: 'gs', code: 'Gs', name: 'Geschiedenis', color: '#e0a86e', icon: 'castle' },
  { id: 'ma', code: 'Ma', name: 'Maatschappijleer', color: '#7c8cf8', icon: 'people' },
  { id: 'ec', code: 'Ec', name: 'Economie', color: '#b59cf0', icon: 'people' },
  { id: 'gd', code: 'Gd', name: 'Godsdienst', color: '#c084fc', icon: 'star' },
  { id: 'te', code: 'Te', name: 'Tekenen', color: '#ee6fd8', icon: 'palette', bring: 'Tekenspullen' },
  { id: 'mu', code: 'Mu', name: 'Muziek', color: '#fb6f92', icon: 'music' },
  { id: 'lo', code: 'LO', name: 'Lichamelijke opvoeding', color: '#8fdc4e', icon: 'ball', bring: 'Gymspullen' },
  { id: 'in', code: 'In', name: 'Informatica', color: '#8ea3c0', icon: 'chip' },
  { id: 'wo', code: 'Wo', name: 'Wereldoriëntatie', color: '#2fc48d', icon: 'magnifier' },
  { id: 'me', code: 'Me', name: 'Mentoruur', color: '#cbd5e1', icon: 'chat' },
  { id: 'st', code: 'St', name: 'Steunles', color: '#a1a1aa', icon: 'heart' },
  { id: 'lu', code: 'Lu', name: 'Lunchpauze', color: '#a1a1aa', icon: 'people' },
];

// ---------------------------------------------------------------------------
// Where a long name may break across two lines
// ---------------------------------------------------------------------------

/**
 * Each entry is one subject name split into the parts it may break between,
 * so a compound breaks at its seam ("Aardrijks-kunde") rather than wherever
 * automatic hyphenation happens to fill the line best. The parts are joined
 * back into the name itself, so an entry can never disagree with the subject
 * it belongs to.
 */
export const NL_NL_NAME_SEAMS: string[][] = [
  ['Aardrijks', 'kunde'],
  ['Natuur', 'kunde'],
  ['Schei', 'kunde'],
  ['Maatschappij', 'leer'],
  ['Wereld', 'oriëntatie'],
  ['Gods', 'dienst'],
  ['Lunch', 'pauze'],
  ['Steun', 'les'],
  ['Mentor', 'uur'],
  ['Neder', 'lands'],
  ['Ge', 'schiedenis'],
  ['Bio', 'logie'],
  ['Infor', 'matica'],
];
