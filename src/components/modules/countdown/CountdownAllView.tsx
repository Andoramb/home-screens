'use client';

import { useLayoutEffect, useState } from 'react';
import { TEXT_OPACITY } from '@/lib/constants';
import { useTranslate } from '@/i18n';
import { useFitFontSize } from '@/hooks/useFitFontSize';
import CountdownTimer from './CountdownTimer';
import { countdownEventsThatFit } from './countdown-utils';
import type { CountdownViewProps } from './types';

/** Where the timers stop shrinking: flip labels are 0.3em, so below this they cannot be read. */
const MIN_TIMER_PX = 20;

/**
 * Every event, one under another. The list shrinks to fit its box: sized off
 * the box height alone, three events in the default card cut the third in
 * half. Past the smallest readable size it keeps the events that fit whole
 * and says how many more there are.
 */
export default function CountdownAllView({ events, config, scale, basePx, textPx }: CountdownViewProps) {
  const t = useTranslate('modules');
  // Everything that changes how tall the list draws starts the fit again with
  // every event: the list, format and precision, the countdown's scale, and
  // the card's text size, which sets the gaps. A smaller size that now fits
  // them all must never keep an old "+N more", and a larger one must find it
  // again. (The box is the other thing; the fit and the limit both watch it.)
  const listKey = `${events.map((e) => e.id).join('|')}|${config.format ?? 'flip'}|${config.precision ?? 'auto'}|${basePx}|${scale}|${textPx}`;
  const floor = Math.min(basePx, MIN_TIMER_PX);
  const { boxRef, contentRef, fontSize } = useFitFontSize(basePx, listKey, floor);
  // Everything in the list follows the fitted timer size.
  const fit = fontSize / basePx;
  const namePx = Math.max(12, 14 * scale * fit);
  // How many events fit at the smallest size, for the list and box it was counted in.
  const [limit, setLimit] = useState<{ key: string; box: string; count: number } | null>(null);
  const shown = limit && limit.key === listKey ? Math.min(limit.count, events.length) : events.length;

  useLayoutEffect(() => {
    const box = boxRef.current;
    const content = contentRef.current;
    if (!box || !content) return;
    const boxKey = `${box.clientWidth}x${box.clientHeight}`;
    // A new list or a resized card starts again with every event.
    if (limit && (limit.key !== listKey || limit.box !== boxKey)) {
      setLimit(null);
      return;
    }
    if (fontSize > floor * 1.001 || content.offsetHeight <= box.clientHeight) return;
    // At the smallest size and still too tall: keep the events that fit whole
    // above a line for "+N more" (its gap and its 1.5 line height).
    const top = content.getBoundingClientRect().top;
    const bottoms = [...content.querySelectorAll('[data-countdown-event]')].map((row) => row.getBoundingClientRect().bottom - top);
    const moreLine = (parseFloat(getComputedStyle(content).rowGap) || 0) + 1.5 * namePx;
    const count = countdownEventsThatFit(bottoms, box.clientHeight - moreLine, shown);
    if (count !== shown) setLimit({ key: listKey, box: boxKey, count });
  }, [boxRef, contentRef, limit, listKey, fontSize, floor, namePx, shown]);

  if (events.length === 0) {
    return <p style={{ fontSize: '0.875em', opacity: TEXT_OPACITY.dim }}>{t('countdown.noUpcoming')}</p>;
  }

  return (
    <div ref={boxRef} className="flex-1 min-h-0 overflow-hidden">
      <div ref={contentRef} className="flex flex-col" style={{ gap: `${1.2 * scale * fit}em` }}>
        {events.slice(0, shown).map((event) => (
          <div key={event.id} data-countdown-event="" className="flex flex-col items-center" style={{ gap: `${0.3 * scale * fit}em` }}>
            <p
              className="font-medium truncate w-full text-center"
              style={{ fontSize: `${namePx}px`, opacity: TEXT_OPACITY.secondary }}
            >
              {event.name}
              {event.time.past && !event.stayingForToday && <span className="ml-1 font-normal">{t('countdown.agoSuffix')}</span>}
            </p>
            {event.stayingForToday ? (
              <p
                className="font-semibold text-center"
                style={{ fontSize: `${fontSize}px`, opacity: TEXT_OPACITY.heading }}
              >
                {t('countdown.todayBang')}
              </p>
            ) : (
              <CountdownTimer time={event.time} config={config} fontSizePx={fontSize} />
            )}
          </div>
        ))}
        {shown < events.length && (
          <p className="text-center" style={{ fontSize: `${namePx}px`, opacity: TEXT_OPACITY.tertiary }}>
            {t('countdown.moreCount', { count: events.length - shown })}
          </p>
        )}
      </div>
    </div>
  );
}
