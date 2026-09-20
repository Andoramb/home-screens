import { describe, it, expect } from 'vitest';
import { guessGroceryCategory, GROCERY_KEYWORDS } from '@/lib/grocery-categories';

describe('guessGroceryCategory', () => {
  it.each([
    // The two the audit watched land under OTHER.
    ['Ground beef', 'meat'],
    ['Cheddar cheese', 'dairy'],
    ['Tomatoes', 'produce'],
    ['Olive oil', 'pantry'],
    ['Sourdough bread', 'bakery'],
    ['Frozen peas', 'frozen'],
    ['Orange juice', 'beverages'],
  ])('reads %s as %s', (name, category) => {
    expect(guessGroceryCategory(name)).toBe(category);
  });

  it('guesses in whatever language the household types', () => {
    expect(guessGroceryCategory('Hähnchenbrust')).toBe('meat');
    expect(guessGroceryCategory('Kikkererwten')).toBe('pantry');
    expect(guessGroceryCategory('Pommes de terre')).toBe('produce');
    expect(guessGroceryCategory('Queijo minas')).toBe('dairy');
    expect(guessGroceryCategory('Hakket oksekød')).toBe('meat');
  });

  /* Longest match wins, or the fruit and the drink swap aisles. */
  it.each([
    ['Watermelon', 'produce'],
    ['Water', 'beverages'],
    ['Orange', 'produce'],
    ['Orange juice', 'beverages'],
  ])('prefers the more specific keyword for %s', (name, category) => {
    expect(guessGroceryCategory(name)).toBe(category);
  });

  /* A short keyword inside a longer word is a coincidence, not a match. */
  it('keeps short keywords to whole words', () => {
    expect(guessGroceryCategory('Cornflour')).not.toBe('produce');
    expect(guessGroceryCategory('Cocktail sticks')).not.toBe('produce');
    expect(guessGroceryCategory('Corn')).toBe('produce');
  });

  it('ignores quantities and punctuation around the word', () => {
    expect(guessGroceryCategory('2 lbs chicken-thighs')).toBe('meat');
    expect(guessGroceryCategory('  MILK  ')).toBe('dairy');
  });

  it('says nothing rather than guessing wildly', () => {
    expect(guessGroceryCategory('Birthday candles')).toBeNull();
    expect(guessGroceryCategory('')).toBeNull();
  });

  it('carries no keyword twice, in one aisle or across two', () => {
    const seen = new Map<string, string>();
    const duplicates: string[] = [];
    for (const [category, words] of Object.entries(GROCERY_KEYWORDS)) {
      for (const word of words) {
        const first = seen.get(word);
        if (first) duplicates.push(`"${word}" in ${first} and ${category}`);
        else seen.set(word, category);
      }
    }
    expect(duplicates).toEqual([]);
  });

  it('carries no keyword that punctuation stripping would break', () => {
    // A keyword is matched against a normalized name, so one carrying
    // punctuation could never match anything.
    const unmatchable = Object.values(GROCERY_KEYWORDS)
      .flat()
      .filter((word) => word !== word.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim());
    expect(unmatchable).toEqual([]);
  });
});
