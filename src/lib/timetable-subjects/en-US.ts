import type { DefaultSubject } from './types';

// ---------------------------------------------------------------------------
// Built-in subject catalogue - en-US (United States, elementary and middle)
// ---------------------------------------------------------------------------

export const EN_US_SUBJECTS: DefaultSubject[] = [
  { id: 'ela', code: 'ELA', name: 'English Language Arts', color: '#f26363', icon: 'book' },
  { id: 'math', code: 'Math', name: 'Math', color: '#4f8ef7', icon: 'triangle' },
  { id: 'sci', code: 'Sci', name: 'Science', color: '#2fc48d', icon: 'magnifier' },
  { id: 'bio', code: 'Bio', name: 'Biology', color: '#43c07e', icon: 'leaf' },
  { id: 'chem', code: 'Chem', name: 'Chemistry', color: '#26b5a8', icon: 'flask' },
  { id: 'phys', code: 'Phys', name: 'Physics', color: '#3ab7f0', icon: 'atom' },
  { id: 'geo', code: 'Geo', name: 'Geography', color: '#b5c23a', icon: 'globe', bring: 'Atlas' },
  { id: 'hist', code: 'Hist', name: 'History', color: '#e0a86e', icon: 'castle' },
  { id: 'ss', code: 'SS', name: 'Social Studies', color: '#7c8cf8', icon: 'people' },
  { id: 'span', code: 'Span', name: 'Spanish', color: '#f2c94c', icon: 'speech' },
  { id: 'art', code: 'Art', name: 'Art', color: '#ee6fd8', icon: 'palette', bring: 'Art supplies' },
  { id: 'music', code: 'Music', name: 'Music', color: '#fb6f92', icon: 'music' },
  { id: 'pe', code: 'PE', name: 'Physical Education', color: '#8fdc4e', icon: 'ball', bring: 'Gym clothes' },
  { id: 'cs', code: 'CS', name: 'Computer Science', color: '#8ea3c0', icon: 'chip' },
  { id: 'hr', code: 'HR', name: 'Homeroom', color: '#cbd5e1', icon: 'chat' },
  { id: 'recess', code: 'Recess', name: 'Recess', color: '#cbd5e1', icon: 'ball' },
  { id: 'lunch', code: 'Lunch', name: 'Lunch', color: '#a1a1aa', icon: 'people' },
];
