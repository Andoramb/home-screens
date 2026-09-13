import type { DefaultSubject } from './types';

// ---------------------------------------------------------------------------
// Built-in subject catalogue - pt-BR (Brazil, ensino fundamental and médio)
// ---------------------------------------------------------------------------

export const PT_BR_SUBJECTS: DefaultSubject[] = [
  { id: 'port', code: 'Port', name: 'Português', color: '#f26363', icon: 'book' },
  { id: 'red', code: 'Red', name: 'Redação', color: '#f26363', icon: 'book' },
  { id: 'mat', code: 'Mat', name: 'Matemática', color: '#4f8ef7', icon: 'triangle' },
  { id: 'ing', code: 'Ing', name: 'Inglês', color: '#f2c94c', icon: 'speech' },
  { id: 'esp', code: 'Esp', name: 'Espanhol', color: '#f58b3c', icon: 'speech' },
  { id: 'cie', code: 'Ciê', name: 'Ciências', color: '#2fc48d', icon: 'magnifier' },
  { id: 'bio', code: 'Bio', name: 'Biologia', color: '#43c07e', icon: 'leaf' },
  { id: 'qui', code: 'Quí', name: 'Química', color: '#26b5a8', icon: 'flask' },
  { id: 'fis', code: 'Fís', name: 'Física', color: '#3ab7f0', icon: 'atom' },
  { id: 'geo', code: 'Geo', name: 'Geografia', color: '#b5c23a', icon: 'globe', bring: 'Atlas' },
  { id: 'hist', code: 'Hist', name: 'História', color: '#e0a86e', icon: 'castle' },
  { id: 'soc', code: 'Soc', name: 'Sociologia', color: '#7c8cf8', icon: 'people' },
  { id: 'filo', code: 'Filo', name: 'Filosofia', color: '#b59cf0', icon: 'scroll' },
  { id: 'rel', code: 'Rel', name: 'Ensino Religioso', color: '#c084fc', icon: 'star' },
  { id: 'arte', code: 'Arte', name: 'Arte', color: '#ee6fd8', icon: 'palette', bring: 'Material de desenho' },
  { id: 'mus', code: 'Mús', name: 'Música', color: '#fb6f92', icon: 'music' },
  { id: 'edfis', code: 'EdFís', name: 'Educação Física', color: '#8fdc4e', icon: 'ball', bring: 'Roupa de educação física' },
  { id: 'info', code: 'Info', name: 'Informática', color: '#8ea3c0', icon: 'chip' },
  { id: 'ref', code: 'Ref', name: 'Reforço', color: '#a1a1aa', icon: 'heart' },
  { id: 'almoco', code: 'Almoço', name: 'Almoço', color: '#a1a1aa', icon: 'people' },
];
