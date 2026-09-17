'use client';

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

/** Publish a checked mutation response to every family consumer on this page. */
export function publishFamilyData(snapshot: FamilySnapshot): void {
  displayCache.replace(familyUrl(), snapshot, FETCH_KEY_REGISTRY.family.ttlMs);
}

export function useFamilyData() {
  const [current, error] = useFetchData<FamilySnapshot>(familyUrl(), FETCH_KEY_REGISTRY.family.ttlMs);
  return {
    members: current?.members ?? EMPTY_MEMBERS,
    groups: current?.groups ?? EMPTY_GROUPS,
    revision: current?.revision ?? null,
    loading: !current && !error,
    error,
    refresh: () => displayCache.invalidate(familyUrl()),
  };
}
