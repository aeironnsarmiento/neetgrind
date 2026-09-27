// The saved plan. Shared between grind75 and neetcode.io through userscript storage.
// `pool` is a copy of the whole Grind 75 dataset (~170 small records), so NeetCode can
// re-select, re-order and exclude topics without refetching Grind 75, and a Grind 75
// redeploy can't silently change an existing plan. `companyPool` is the same idea for the
// company-tagged lists: a snapshot at `companyVersion` that only changes when the user applies an update.

import { storage } from "../platform/storage.js";

const POOL_FIELDS = ["slug", "title", "url", "duration", "difficulty", "topic", "priority", "premium"];

export function createPlan(allGrind, settings, startDate, source, { companyPool = [], companyVersion = null } = {}) {
  return {
    version: 2,
    id: `${Date.now()}`,
    createdAt: new Date().toISOString(),
    source,
    startDate,
    settings: {
      weeks: settings.weeks,
      hours: settings.hours,
      difficulty: settings.difficulty,
      topics: settings.topics,
      mode: settings.mode,
      order: settings.order,
      grouping: settings.grouping,
      excludedTopics: settings.excludedTopics ?? [],
      company: settings.company ?? null,
    },
    pool: allGrind.map((q) => Object.fromEntries(POOL_FIELDS.map((f) => [f, q[f]]))),
    companyPool,
    companyVersion,
  };
}

export const planStore = {
  load: () => storage.get("plan", null),
  save: (plan) => storage.set("plan", plan),
  update(patch) {
    const plan = { ...planStore.load(), ...patch };
    planStore.save(plan);
    return plan;
  },
};
