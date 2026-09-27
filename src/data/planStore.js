// The saved plan. Shared between grind75 and neetcode.io through userscript storage.
// `pool` keeps the chosen Grind 75 records so NeetCode can re-order/re-week them without
// refetching Grind 75, and so a Grind 75 redeploy can't silently change an existing plan.

import { selectQuestions } from "../core/scheduler.js";
import { storage } from "../platform/storage.js";

const POOL_FIELDS = ["slug", "title", "url", "duration", "difficulty", "topic", "priority", "premium"];

export function createPlan(allGrind, settings, startDate, source) {
  const picked = selectQuestions(allGrind, settings);
  return {
    version: 1,
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
    },
    slugs: picked.map((q) => q.slug),
    pool: picked.map((q) => Object.fromEntries(POOL_FIELDS.map((f) => [f, q[f]]))),
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
