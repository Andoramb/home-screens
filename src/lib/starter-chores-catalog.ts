/**
 * The ready-made chores a household can pick from instead of typing each one.
 *
 * Everything but the name is the same in every language: the icon (a name
 * from the chore icon set, so a starter looks like a hand-made chore), the
 * tickets it pays, and when it happens. The names live in
 * `starter-chores-names/<locale>.ts`, one record per locale keyed by the id
 * here, so a missing translation is a type error rather than a blank row.
 *
 * Tickets follow the scale the chore form suggests: 1 for a two-minute habit,
 * 2 for a real job, 3 for a weekly one.
 */

export type StarterChoreSection = 'morning' | 'afternoon' | 'evening' | 'weekly';

/** The order the picker lists the sections in: the day first, then the week. */
export const STARTER_CHORE_SECTIONS: readonly StarterChoreSection[] = ['morning', 'afternoon', 'evening', 'weekly'];

export const STARTER_CHORE_IDS = [
  'make-bed',
  'brush-teeth',
  'get-dressed',
  'breakfast-plate',
  'pack-school-bag',
  'feed-pets',
  'homework',
  'read-20-minutes',
  'practice-instrument',
  'shoes-and-coat',
  'unpack-lunch-box',
  'set-table',
  'clear-table',
  'load-dishwasher',
  'empty-dishwasher',
  'tidy-room',
  'clothes-in-hamper',
  'brush-teeth-bedtime',
  'screens-off',
  'take-out-trash',
  'vacuum-room',
  'fold-laundry',
  'water-plants',
  'walk-dog',
  'clean-bathroom-sink',
  'put-groceries-away',
  'recycling-out',
] as const;

export type StarterChoreId = (typeof STARTER_CHORE_IDS)[number];

export interface StarterChoreSpec {
  id: StarterChoreId;
  section: StarterChoreSection;
  /** A name from the chore icon set (`ChoreIcon`'s registry), without the `lucide:` prefix. */
  icon: string;
  points: number;
}

export const STARTER_CHORE_CATALOG: readonly StarterChoreSpec[] = [
  { id: 'make-bed', section: 'morning', icon: 'bed', points: 1 },
  { id: 'brush-teeth', section: 'morning', icon: 'droplets', points: 1 },
  { id: 'get-dressed', section: 'morning', icon: 'shirt', points: 1 },
  { id: 'breakfast-plate', section: 'morning', icon: 'egg', points: 1 },
  { id: 'pack-school-bag', section: 'morning', icon: 'backpack', points: 1 },
  { id: 'feed-pets', section: 'morning', icon: 'paw-print', points: 2 },

  { id: 'homework', section: 'afternoon', icon: 'book-open', points: 3 },
  { id: 'read-20-minutes', section: 'afternoon', icon: 'notebook', points: 2 },
  { id: 'practice-instrument', section: 'afternoon', icon: 'music', points: 2 },
  { id: 'shoes-and-coat', section: 'afternoon', icon: 'footprints', points: 1 },
  { id: 'unpack-lunch-box', section: 'afternoon', icon: 'apple', points: 1 },

  { id: 'set-table', section: 'evening', icon: 'utensils-crossed', points: 1 },
  { id: 'clear-table', section: 'evening', icon: 'utensils', points: 1 },
  { id: 'load-dishwasher', section: 'evening', icon: 'hand-platter', points: 2 },
  { id: 'empty-dishwasher', section: 'evening', icon: 'glass-water', points: 2 },
  { id: 'tidy-room', section: 'evening', icon: 'toy-brick', points: 2 },
  { id: 'clothes-in-hamper', section: 'evening', icon: 'washing-machine', points: 1 },
  { id: 'brush-teeth-bedtime', section: 'evening', icon: 'droplets', points: 1 },
  { id: 'screens-off', section: 'evening', icon: 'tv', points: 1 },

  { id: 'take-out-trash', section: 'weekly', icon: 'trash', points: 3 },
  { id: 'vacuum-room', section: 'weekly', icon: 'brush-cleaning', points: 3 },
  { id: 'fold-laundry', section: 'weekly', icon: 'towel-rack', points: 3 },
  { id: 'water-plants', section: 'weekly', icon: 'flower', points: 2 },
  { id: 'walk-dog', section: 'weekly', icon: 'dog', points: 3 },
  { id: 'clean-bathroom-sink', section: 'weekly', icon: 'spray-can', points: 3 },
  { id: 'put-groceries-away', section: 'weekly', icon: 'shopping-bag', points: 2 },
  { id: 'recycling-out', section: 'weekly', icon: 'recycle', points: 2 },
];
