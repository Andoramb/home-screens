import type { DefaultSubject } from './types';

// ---------------------------------------------------------------------------
// Built-in subject catalogue - es-ES (Spain, primaria and ESO)
// ---------------------------------------------------------------------------

export const ES_ES_SUBJECTS: DefaultSubject[] = [
  { id: 'len', code: 'Len', name: 'Lengua Castellana y Literatura', color: '#f26363', icon: 'book' },
  { id: 'mat', code: 'Mat', name: 'Matemáticas', color: '#4f8ef7', icon: 'triangle' },
  { id: 'ing', code: 'Ing', name: 'Inglés', color: '#f2c94c', icon: 'speech' },
  { id: 'fra', code: 'Fra', name: 'Francés', color: '#f58b3c', icon: 'speech' },
  { id: 'lat', code: 'Lat', name: 'Latín', color: '#b08968', icon: 'scroll' },
  { id: 'ccnn', code: 'CCNN', name: 'Ciencias de la Naturaleza', color: '#2fc48d', icon: 'magnifier' },
  { id: 'bg', code: 'BG', name: 'Biología y Geología', color: '#43c07e', icon: 'leaf' },
  { id: 'fq', code: 'FQ', name: 'Física y Química', color: '#26b5a8', icon: 'flask' },
  { id: 'gh', code: 'GH', name: 'Geografía e Historia', color: '#e0a86e', icon: 'castle' },
  { id: 'val', code: 'Val', name: 'Valores Cívicos y Éticos', color: '#7c8cf8', icon: 'people' },
  { id: 'rel', code: 'Rel', name: 'Religión', color: '#c084fc', icon: 'star' },
  { id: 'epv', code: 'EPV', name: 'Educación Plástica y Visual', color: '#ee6fd8', icon: 'palette', bring: 'Material de dibujo' },
  { id: 'mus', code: 'Mús', name: 'Música', color: '#fb6f92', icon: 'music' },
  { id: 'ef', code: 'EF', name: 'Educación Física', color: '#8fdc4e', icon: 'ball', bring: 'Ropa de deporte' },
  { id: 'tec', code: 'Tec', name: 'Tecnología y Digitalización', color: '#8ea3c0', icon: 'chip' },
  { id: 'tut', code: 'Tut', name: 'Tutoría', color: '#cbd5e1', icon: 'chat' },
  { id: 'ref', code: 'Ref', name: 'Refuerzo', color: '#a1a1aa', icon: 'heart' },
  { id: 'com', code: 'Com', name: 'Comedor', color: '#a1a1aa', icon: 'people' },
];
