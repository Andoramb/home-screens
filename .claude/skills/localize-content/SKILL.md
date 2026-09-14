---
name: localize-content
description: "Localize seed or content data into all seven Home Screens locales with per-locale adversarial review. Triggers on: 'localize this', 'translate the seed content', 'add locales for the new module content', any new content dataset (affirmations, word lists, quotes) that must ship in every language."
---

# Localize Content Across All Locales

## Overview

Ships content in all seven supported locales using the fan-out pattern that has worked before (word-of-day, affirmations): parallel per-locale generation, then a parallel adversarial reviewer per locale, then structural verification. Native quality and cultural adaptation, not literal translation.

Locales (source of truth: `src/i18n/manifest.ts`): `en-US` (source), `de-DE`, `fr-FR`, `es-ES`, `nl-NL`, `pt-BR`, `da-DK`.

## Process

### Step 1: Finalize the source content

Get the `en-US` dataset right first (counts, tone, structure, kid-appropriateness where relevant). This is the contract every locale must match.

### Step 2: Fan out one subagent per locale

Each locale agent gets the full source dataset and produces a culturally adapted equivalent: idiomatic phrasing a native speaker would write, locale-appropriate cultural references (holidays, wordplay, names), exact same JSON structure and item count. Explicitly forbid literal machine-translation style output.

### Step 3: Adversarial review, one reviewer per locale

A second, independent subagent per locale reviews as a native-speaker skeptic: wrong or unnatural phrasing, untranslated leakage, cultural misfires, count or schema mismatches, duplicated items. Reviewers report findings; fix everything real.

### Step 4: Structural verification

Programmatically verify every locale file: same keys, same item counts, valid JSON, no empty strings, no en-US leftovers (spot-check with grep for common English words). Host dictionaries live in `src/translations/<locale>/`; module seed content lives with the module or its data file, matching wherever the en-US version lives.

### Step 5: Tests

Run the test suite. If a dataset has count or shape assertions, they must pass for all seven locales.

## Red Flags

**Never:**
- Ship a locale that was generated but not reviewed
- Let item counts differ across locales
- Accept literal translations of jokes, idioms, or holidays; adapt them
