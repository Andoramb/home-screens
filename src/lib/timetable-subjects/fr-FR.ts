import type { DefaultSubject } from './types';

// ---------------------------------------------------------------------------
// Built-in subject catalogue - fr-FR (France, école and collège)
// ---------------------------------------------------------------------------

export const FR_FR_SUBJECTS: DefaultSubject[] = [
  { id: 'fr', code: 'Fr', name: 'Français', color: '#f26363', icon: 'book' },
  { id: 'maths', code: 'Maths', name: 'Mathématiques', color: '#4f8ef7', icon: 'triangle' },
  { id: 'angl', code: 'Angl', name: 'Anglais', color: '#f2c94c', icon: 'speech' },
  { id: 'esp', code: 'Esp', name: 'Espagnol', color: '#f58b3c', icon: 'speech' },
  { id: 'all', code: 'All', name: 'Allemand', color: '#f58b3c', icon: 'speech' },
  { id: 'latin', code: 'Latin', name: 'Latin', color: '#b08968', icon: 'scroll' },
  { id: 'svt', code: 'SVT', name: 'Sciences de la vie et de la Terre', color: '#43c07e', icon: 'leaf' },
  { id: 'pc', code: 'PC', name: 'Physique-chimie', color: '#26b5a8', icon: 'flask' },
  { id: 'hg', code: 'HG', name: 'Histoire-Géographie', color: '#e0a86e', icon: 'castle' },
  { id: 'emc', code: 'EMC', name: 'Enseignement moral et civique', color: '#7c8cf8', icon: 'people' },
  { id: 'techno', code: 'Techno', name: 'Technologie', color: '#8ea3c0', icon: 'chip' },
  { id: 'arts', code: 'Arts', name: 'Arts plastiques', color: '#ee6fd8', icon: 'palette', bring: 'Matériel de dessin' },
  { id: 'mus', code: 'Mus', name: 'Éducation musicale', color: '#fb6f92', icon: 'music' },
  { id: 'eps', code: 'EPS', name: 'Éducation physique et sportive', color: '#8fdc4e', icon: 'ball', bring: 'Tenue de sport' },
  { id: 'viecl', code: 'VieCl', name: 'Vie de classe', color: '#cbd5e1', icon: 'chat' },
  { id: 'sout', code: 'Sout', name: 'Soutien', color: '#a1a1aa', icon: 'heart' },
  { id: 'cant', code: 'Cant', name: 'Cantine', color: '#a1a1aa', icon: 'people' },
];
