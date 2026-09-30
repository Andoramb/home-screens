'use client';

import { useCallback } from 'react';
import { useFetchData } from '@/hooks/useFetchData';
import { displayCache } from '@/lib/display-cache';
import { familyUrl, FETCH_KEY_REGISTRY } from '@/lib/fetch-keys';
import type { FamilyGroup, FamilyMember } from '@/types/family';

export interface FamilySnapshot {
  members: FamilyMember[];
  groups: FamilyGroup[];
  revision: string;
}

const EMPTY_MEMBERS: FamilyMember[] = [];
const EMPTY_GROUPS: FamilyGroup[] = [];

/** Whether a response body carries a family (members, groups and the revision they were read at). */
export function isFamilySnapshot(value: unknown): value is FamilySnapshot {
  const v = value as Partial<FamilySnapshot> | null;
  return !!v && typeof v === 'object' && Array.isArray(v.members) && Array.isArray(v.groups) && typeof v.revision === 'string';
}

/** Publish a checked mutation response to every family consumer on this page. */
export function publishFamilyData(snapshot: FamilySnapshot): void {
  displayCache.replace(familyUrl(), snapshot, FETCH_KEY_REGISTRY.family.ttlMs);
}

/**
 * `roster` is a family the caller was handed another way (the kids' page,
 * which has no session to read `/api/family` with, gets it with the page and
 * with its chores poll): it is used as is and nothing is fetched.
 */
export function useFamilyData(roster?: FamilySnapshot | null) {
  const [fetched, error] = useFetchData<FamilySnapshot>(roster ? '' : familyUrl(), FETCH_KEY_REGISTRY.family.ttlMs);
  const current = roster ?? fetched;
  const refresh = useCallback(() => displayCache.invalidate(familyUrl()), []);
  return {
    members: current?.members ?? EMPTY_MEMBERS,
    groups: current?.groups ?? EMPTY_GROUPS,
    revision: current?.revision ?? null,
    loading: !current && !error,
    /** A roster has arrived. A later failed refresh keeps it and sets `error`. */
    loaded: !!current,
    error,
    refresh,
  };
}
