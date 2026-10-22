/**
 * A condition list in a few words, for a rule card's header: "above 24",
 * "22 to 24", "Front door is open", "9:00 PM to 6:00 AM", "any of 3". The
 * header has one line, so this reads the shape of each root condition and
 * joins them; the full detail lives in the open card.
 */

import type { TimeFormat, VisibilityCondition } from '@/types/config';
import type { TranslateFn } from '@/i18n/types';
import { formatScheduleDays, formatScheduleTime } from '@/lib/schedule-summary';
import { formatNumber } from '@/i18n/formatters';

export interface ConditionSummaryContext {
  t: TranslateFn;
  formattingLocale: string;
  timeFormat: TimeFormat | undefined;
  /** Friendly name for a key; falls back to the key's last segment. */
  labelFor?: (key: string) => string | undefined;
}

const KEY = 'conditionSummary';

/** The readable tail of a bus key: `plugin:ha:sensor.bedroom` reads `sensor.bedroom`. */
export function keyTail(key: string): string {
  const i = key.lastIndexOf(':');
  return i >= 0 ? key.slice(i + 1) : key;
}

function valueText(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value.join(', ');
  return value ?? '';
}

function describeOne(c: VisibilityCondition, ctx: ConditionSummaryContext): string {
  const { t, formattingLocale } = ctx;
  switch (c.kind) {
    case 'numeric': {
      const n = (v: number) => formatNumber(v, { locale: formattingLocale, maximumFractionDigits: 3 });
      if (c.above !== undefined && c.below !== undefined) {
        return t(`${KEY}.between`, { a: n(c.above), b: n(c.below) });
      }
      if (c.above !== undefined) return t(`${KEY}.above`, { n: n(c.above) });
      if (c.below !== undefined) return t(`${KEY}.below`, { n: n(c.below) });
      return t(`${KEY}.anyNumber`);
    }
    case 'state': {
      const label = c.sourceKey ? (ctx.labelFor?.(c.sourceKey) ?? keyTail(c.sourceKey)) : t(`${KEY}.noKey`);
      const value = valueText(c.equals ?? c.notEquals);
      if (value === '') return label;
      return t(c.notEquals !== undefined ? `${KEY}.isNot` : `${KEY}.is`, { key: label, value });
    }
    case 'time': {
      const window = {
        daysOfWeek: c.daysOfWeek,
        startTime: c.startTime,
        endTime: c.endTime,
        endDayOffset: c.endDayOffset,
      };
      const time = formatScheduleTime(window, t, formattingLocale, ctx.timeFormat);
      const everyDay = !c.daysOfWeek || c.daysOfWeek.length === 0 || c.daysOfWeek.length === 7;
      if (everyDay) return time;
      return t('scheduleEditor.summary.short', { days: formatScheduleDays(window, t, formattingLocale), time });
    }
    case 'and':
      return t(`${KEY}.allOf`, { n: c.conditions.length });
    case 'or':
      return t(`${KEY}.anyOf`, { n: c.conditions.length });
    case 'not':
      return t(`${KEY}.noneOf`, { n: c.conditions.length });
  }
}

/**
 * The whole list in one line. An empty list is "always"; several root
 * conditions are joined with a middle dot, which the header truncates.
 */
export function describeConditions(conditions: VisibilityCondition[], ctx: ConditionSummaryContext): string {
  if (conditions.length === 0) return ctx.t(`${KEY}.always`);
  return conditions.map((c) => describeOne(c, ctx)).join(' · ');
}
