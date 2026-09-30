import { describe, expect, it } from 'vitest';
import { ingredientsToSave } from '../meal-ingredients';

describe('ingredientsToSave', () => {
  it('leaves out rows with no name and tidies the rest', () => {
    expect(ingredientsToSave([
      { name: '', amount: '' },
      { name: '  Eggs ', amount: ' 6 ' },
      { name: '   ', amount: '2 cups', category: 'dairy' },
      { name: 'Milk', category: 'dairy' },
    ])).toEqual([
      { name: 'Eggs', amount: '6' },
      { name: 'Milk', category: 'dairy' },
    ]);
  });

  it('is undefined when nothing is left, as for a meal with no ingredients', () => {
    expect(ingredientsToSave([])).toBeUndefined();
    expect(ingredientsToSave([{ name: ' ', amount: '1' }])).toBeUndefined();
  });
});
