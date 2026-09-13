import {
  Atom, BookOpen, Castle, Cpu, FlaskConical, Globe, Heart, Leaf, MessageSquare,
  MessagesSquare, Music, Palette, Scroll, Search, Star, Triangle, Users, Volleyball,
  type LucideIcon,
} from 'lucide-react';
import type { TimetableSubjectIcon } from '@/lib/timetable-subjects/types';

/** One icon vocabulary for the subject picker, paint grid and wall. */
const SUBJECT_ICONS: Record<TimetableSubjectIcon, LucideIcon> = {
  book: BookOpen,
  triangle: Triangle,
  speech: MessageSquare,
  scroll: Scroll,
  leaf: Leaf,
  flask: FlaskConical,
  atom: Atom,
  globe: Globe,
  castle: Castle,
  people: Users,
  star: Star,
  palette: Palette,
  music: Music,
  ball: Volleyball,
  chip: Cpu,
  magnifier: Search,
  heart: Heart,
  chat: MessagesSquare,
};

export function subjectIcon(name: string): LucideIcon {
  return Object.hasOwn(SUBJECT_ICONS, name)
    ? SUBJECT_ICONS[name as TimetableSubjectIcon]
    : SUBJECT_ICONS.book;
}
