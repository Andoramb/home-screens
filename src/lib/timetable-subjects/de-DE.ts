import type { DefaultSubject } from './types';

// ---------------------------------------------------------------------------
// Built-in subject catalogue - de-DE (Germany, Grundschule and Gymnasium)
// ---------------------------------------------------------------------------

export const DE_DE_SUBJECTS: DefaultSubject[] = [
  { id: 'deu', code: 'Deu', name: 'Deutsch', color: '#f26363', icon: 'book' },
  { id: 'ma', code: 'Ma', name: 'Mathe', color: '#4f8ef7', icon: 'triangle' },
  { id: 'eng', code: 'Eng', name: 'Englisch', color: '#f2c94c', icon: 'speech' },
  { id: 'frz', code: 'Frz', name: 'Französisch', color: '#f58b3c', icon: 'speech' },
  { id: 'lat', code: 'Lat', name: 'Latein', color: '#b08968', icon: 'scroll' },
  { id: 'bio', code: 'Bio', name: 'Biologie', color: '#43c07e', icon: 'leaf' },
  { id: 'ch', code: 'Ch', name: 'Chemie', color: '#26b5a8', icon: 'flask' },
  { id: 'ph', code: 'Ph', name: 'Physik', color: '#3ab7f0', icon: 'atom' },
  { id: 'ek', code: 'Ek', name: 'Erdkunde', color: '#b5c23a', icon: 'globe', bring: 'Atlas' },
  { id: 'ge', code: 'Ge', name: 'Geschichte', color: '#e0a86e', icon: 'castle' },
  { id: 'wipo', code: 'WiPo', name: 'Wirtschaft-Politik', color: '#7c8cf8', icon: 'people' },
  { id: 'sowi', code: 'Sowi', name: 'Sozialwissenschaften', color: '#7c8cf8', icon: 'people' },
  { id: 'paed', code: 'Päd', name: 'Pädagogik', color: '#b59cf0', icon: 'people' },
  { id: 'rel', code: 'Rel', name: 'Religion', color: '#c084fc', icon: 'star' },
  { id: 'ku', code: 'Ku', name: 'Kunst', color: '#ee6fd8', icon: 'palette', bring: 'Malsachen' },
  { id: 'mu', code: 'Mu', name: 'Musik', color: '#fb6f92', icon: 'music' },
  { id: 'sp', code: 'Sp', name: 'Sport', color: '#8fdc4e', icon: 'ball', bring: 'Sportzeug' },
  { id: 'if', code: 'If', name: 'Informatik', color: '#8ea3c0', icon: 'chip' },
  { id: 'su', code: 'SU', name: 'Sachunterricht', color: '#2fc48d', icon: 'magnifier' },
  { id: 'foe', code: 'Fö', name: 'Förderunterricht', color: '#a1a1aa', icon: 'heart' },
  { id: 'kr', code: 'KR', name: 'Klassenrat', color: '#cbd5e1', icon: 'chat' },
];

// ---------------------------------------------------------------------------
// Where a long name may break across two lines
// ---------------------------------------------------------------------------

/**
 * Each entry is one subject name split into the parts it may break between.
 *
 * A German compound broken in the middle of its second half ("Sachunter-
 * richt") is noticeably harder to read across a room than one broken at its
 * seam ("Sach-unterricht"), and automatic hyphenation picks whichever point
 * fills the line best rather than the one that reads best. The parts are
 * joined back into the name itself, so an entry can never disagree with the
 * subject it belongs to.
 *
 * Wirtschaft-Politik keeps the hyphen it already has: the break falls there
 * and prints no second one. It also lists a break inside its first half, for
 * a cell too narrow to hold that half on one line. Extra places to break
 * belong before the seam and never after it, because a line takes the last
 * break that fits and one further along would be chosen over the seam.
 */
export const DE_DE_NAME_SEAMS: string[][] = [
  ['Sach', 'unterricht'],
  ['Förder', 'unterricht'],
  ['Klassen', 'rat'],
  ['Sozial', 'wissen', 'schaften'],
  ['Wirt', 'schaft-', 'Politik'],
  ['Franzö', 'sisch'],
  ['Eng', 'lisch'],
  ['Ge', 'schichte'],
  ['Erd', 'kunde'],
  ['Infor', 'matik'],
  ['Reli', 'gion'],
  ['Bio', 'logie'],
  ['Päda', 'gogik'],
  ['Phy', 'sik'],
  ['Che', 'mie'],
];
