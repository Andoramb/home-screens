'use client';

import { useMemo } from 'react';
import { X } from 'lucide-react';
import Combobox from '@/components/ui/Combobox';
import { useTranslate } from '@/i18n';
import { useEditorData } from '@/hooks/useEditorData';
import { SPORTS_LEAGUES, leagueLabel, leagueWallCode, type TeamOption } from '@/lib/espn';
import { MAX_FAVORITE_TEAMS, parseTeamKey, teamKey } from '@/lib/sports-order';
import { TeamLogo } from '@/components/modules/shared/TeamLogo';
import type { ComboboxOption } from '@/lib/combobox-filter';

interface FavoriteTeamsPickerProps {
  /** Leagues the module shows; only their teams are offered. */
  leagues: string[];
  /** Picked `<league>:<ABBR>` keys in priority order. */
  value: string[];
  onChange: (next: string[]) => void;
  /** Help line under the search box; the Team view says something different from the others. */
  help: string;
}

/**
 * One search box over every enabled league's roster, with the picked teams
 * as rows beneath it in priority order. Rosters come from /api/sports/teams
 * in one request; a picked team whose league is toggled off keeps its row,
 * marked, so the user sees why it is missing from the wall.
 */
export function FavoriteTeamsPicker({ leagues, value, onChange, help }: FavoriteTeamsPickerProps) {
  const t = useTranslate('editor');
  const enabled = useMemo(() => new Set(leagues.map((l) => l.toLowerCase())), [leagues]);

  // Fetch the enabled leagues plus any league a picked team belongs to, so
  // every row can show its team's name even when its league is off.
  const wanted = useMemo(() => {
    const set = new Set(enabled);
    for (const key of value) {
      const parsed = parseTeamKey(key);
      if (parsed) set.add(parsed.league);
    }
    return [...set].filter((l) => SPORTS_LEAGUES.some((s) => s.id === l)).sort();
  }, [enabled, value]);
  const url = wanted.length ? `/api/sports/teams?leagues=${encodeURIComponent(wanted.join(','))}` : null;
  const { data, error, loading } = useEditorData<{ teams: TeamOption[] }>(url);

  const byKey = useMemo(
    () => new Map((data?.teams ?? []).map((team) => [teamKey(team.league, team.abbr), team])),
    [data],
  );
  const options = useMemo<ComboboxOption[]>(
    () => (data?.teams ?? [])
      .filter((team) => enabled.has(team.league) && !value.includes(teamKey(team.league, team.abbr)))
      .map((team) => ({ value: teamKey(team.league, team.abbr), label: team.name, description: leagueLabel(team.league) })),
    [data, enabled, value],
  );

  const placeholder = loading
    ? t('configSections.sports.favoriteTeamsLoading')
    : error
      ? t('configSections.sports.favoriteTeamsError')
      : t('configSections.sports.favoriteTeamsSearch');

  return (
    <div className="space-y-1.5" data-field-id="favoriteTeams">
      <span className="text-xs text-hs-text-muted">{t('configSections.sports.favoriteTeams')}</span>
      {value.length >= MAX_FAVORITE_TEAMS ? (
        <p className="text-[11px] text-hs-text-muted">{t('configSections.sports.favoriteTeamsLimit', { count: MAX_FAVORITE_TEAMS })}</p>
      ) : (
        <Combobox
          value=""
          onChange={(key) => { if (key && !value.includes(key)) onChange([...value, key]); }}
          options={options}
          ariaLabel={t('configSections.sports.favoriteTeams')}
          placeholder={placeholder}
          noMatchText={t('common.noMatches')}
        />
      )}
      <p className="text-[11px] text-hs-text-faint">{help}</p>
      {value.length > 0 && (
        <ul className="space-y-1" aria-label={t('configSections.sports.favoriteTeams')}>
          {value.map((key) => {
            const parsed = parseTeamKey(key);
            const team = byKey.get(key);
            const name = team?.name ?? parsed?.abbr ?? key;
            const off = !!parsed && !enabled.has(parsed.league);
            return (
              <li
                key={key}
                className={`flex items-center gap-2 rounded-md border border-hs-border bg-hs-card px-2 py-1.5 ${off ? 'opacity-60' : ''}`}
              >
                <TeamLogo src={team?.logo ?? ''} alt="" size={16} />
                <span className="text-xs text-hs-text-body truncate flex-1">{name}</span>
                {/* The short code, not the label: the panel is narrow and the team name matters more. */}
                <span className="text-[11px] text-hs-text-muted shrink-0">{leagueWallCode(parsed?.league ?? '')}</span>
                {off && (
                  <span className="text-[10px] italic text-hs-text-muted shrink-0">
                    {t('configSections.sports.favoriteTeamsHidden')}
                  </span>
                )}
                <button
                  type="button"
                  aria-label={t('configSections.sports.favoriteTeamsRemove', { team: name })}
                  onClick={() => onChange(value.filter((k) => k !== key))}
                  className="text-hs-text-muted hover:text-hs-text-body shrink-0"
                >
                  <X size={14} />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
