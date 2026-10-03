'use client';

import { useTranslate } from '@/i18n';
import Toggle from '@/components/ui/Toggle';
import Slider from '@/components/ui/Slider';
import RefreshIntervalSlider from './RefreshIntervalSlider';
import ViewSelect from '@/components/editor/ViewSelect';
import { useModuleConfig } from '@/hooks/useModuleConfig';
import { SPORTS_LEAGUES } from '@/lib/espn';
import { FavoriteTeamsPicker } from './FavoriteTeamsPicker';
import type { ModuleInstance, SportsView } from '@/types/config';

export function SportsConfigSection({ mod, screenId }: { mod: ModuleInstance; screenId: string }) {
  const t = useTranslate('editor');
  const { config: c, set } = useModuleConfig<{
    view?: SportsView;
    leagues?: string[];
    favoriteTeams?: string[];
    favoritesOnly?: boolean;
    refreshIntervalMs?: number;
    tickerSpeed?: number;
  }>(mod, screenId);

  const SPORTS_VIEWS: { value: SportsView; label: string }[] = [
    { value: 'scoreboard', label: t('configSections.sports.viewScoreboard') },
    { value: 'cards', label: t('configSections.sports.viewCards') },
    { value: 'list', label: t('configSections.sports.viewList') },
    { value: 'ticker', label: t('configSections.sports.viewTicker') },
    { value: 'team', label: t('configSections.sports.viewTeam') },
  ];

  const selectedLeagues = c.leagues ?? ['nba', 'nfl'];
  const favorites = c.favoriteTeams ?? [];
  const view = c.view ?? 'scoreboard';

  const leagueGroups: { key: 'american' | 'soccer'; label: string }[] = [
    { key: 'american', label: t('configSections.sports.leaguesAmerican') },
    { key: 'soccer', label: t('configSections.sports.leaguesSoccer') },
  ];

  return (
    <>
      <ViewSelect
        value={view}
        onChange={(v) => set({ view: v })}
        options={SPORTS_VIEWS}
      />
      <div className="space-y-1">
        <span className="text-xs text-hs-text-muted">{t('configSections.sports.leagues')}</span>
        {leagueGroups.map((group) => (
          <div key={group.key} className="space-y-1">
            <span className="block text-[10px] uppercase tracking-wider text-hs-text-faint pt-1">{group.label}</span>
            {SPORTS_LEAGUES.filter((l) => l.group === group.key).map((league) => (
              <Toggle
                key={league.id}
                label={league.label}
                checked={selectedLeagues.includes(league.id)}
                onChange={(checked) => {
                  const next = checked
                    ? [...selectedLeagues, league.id]
                    : selectedLeagues.filter((l) => l !== league.id);
                  set({ leagues: next });
                }}
              />
            ))}
          </div>
        ))}
      </div>
      <FavoriteTeamsPicker
        leagues={selectedLeagues}
        value={favorites}
        onChange={(next) => set({ favoriteTeams: next })}
        help={view === 'team'
          ? t('configSections.sports.favoriteTeamsHelpTeam')
          : t('configSections.sports.favoriteTeamsHelp')}
      />
      {view !== 'team' && favorites.length > 0 && (
        <Toggle
          label={t('configSections.sports.favoritesOnly')}
          checked={c.favoritesOnly ?? false}
          onChange={(v) => set({ favoritesOnly: v })}
        />
      )}
      {view === 'ticker' && (
        <Slider
          label={t('configSections.sports.tickerSpeed')}
          value={c.tickerSpeed ?? 4}
          min={2}
          max={10}
          step={1}
          onChange={(v) => set({ tickerSpeed: v })}
        />
      )}
      <RefreshIntervalSlider
        value={c.refreshIntervalMs}
        onChange={(ms) => set({ refreshIntervalMs: ms })}
        fetchKey="sports"
        fallbackMs={60_000}
        unit="seconds"
        min={30}
        max={600}
        step={30}
      />
    </>
  );
}
