// Reimplementation of the Grind 75 schedule generator
// (techinterviewhandbook.org/grind75, client chunk logic), plus a NeetCode "roadmap" order.

import { mapQuestion } from "./mapping.js";
import { orderRecommended } from "./recommended.js";
import { TOPO_LABELS, TOPO_RANK } from "./roadmap.js";

// Grind 75 budgets each question at 1.96x its listed duration.
export const COST_FACTOR = 1.96;
export const DIFFICULTIES = ["Easy", "Medium", "Hard"];
export const DIFFICULTY_RANK = { Easy: 0, Medium: 1, Hard: 2 };
export const GRIND_TOPIC_RANK = {
  array: 0,
  string: 1,
  matrix: 2,
  "binary-search": 3,
  graph: 4,
  "binary-search-tree": 5,
  "binary-tree": 6,
  "hash-table": 10,
  recursion: 11,
  "linked-list": 12,
  stack: 13,
  queue: 14,
  heap: 15,
  trie: 16,
  "dynamic-programming": 20,
  binary: 21,
  math: 22,
};
export const ORDERS = ["recommended", "difficulty", "topics", "all_rounded", "roadmap"];
export const ORDER_LABELS = {
  recommended: "Recommended (spaced + mixed)",
  difficulty: "Difficulty (Grind 75 default)",
  topics: "Topics (Grind 75)",
  all_rounded: "All rounded (priority)",
  roadmap: "NeetCode roadmap",
};
// Same choices as Grind 75's "Group by". Topics are NeetCode's roadmap topics here.
export const GROUPINGS = ["weeks", "topics", "difficulty", "none"];
export const GROUPING_LABELS = { weeks: "Weeks", topics: "Topics", difficulty: "Difficulty", none: "None" };

export const DEFAULT_SETTINGS = {
  weeks: 8,
  hours: 8,
  difficulty: [...DIFFICULTIES],
  topics: null, // null = all topics (Grind 75 topics)
  excludedTopics: [], // NeetCode roadmap topics to leave out
  mode: "preferences",
  order: "recommended",
  grouping: "weeks",
};

export const costOf = (q) => COST_FACTOR * q.duration;

// Reads Grind 75's URL params. `grindOrder` is the page's "Order by" (default "difficulty").
export function parseGrindParams(search) {
  const p = new URLSearchParams(search);
  const num = (key, def) => {
    const v = p.get(key);
    const n = v == null ? NaN : Number(v);
    return Number.isFinite(n) && n > 0 ? n : def;
  };
  const list = (key) => {
    const v = p.getAll(key);
    return v.length ? v : null;
  };
  return {
    weeks: num("weeks", 8),
    hours: num("hours", 8),
    difficulty: list("difficulty") ?? [...DIFFICULTIES],
    topics: list("topics"),
    mode: p.get("mode") === "all" ? "all" : "preferences",
    grindOrder: p.get("order") ?? "difficulty",
    grouping: GROUPINGS.includes(p.get("grouping")) ? p.get("grouping") : "weeks",
  };
}

// Greedy pick in priority order; stops at the first question that overflows the budget
// (Grind 75 does not skip and continue). `excludedTopics` are NeetCode topics, so they only
// apply to questions already mapped with a `pattern`; like Grind's own topic filter, excluded
// questions don't use up budget, so the freed hours go to other questions.
export function selectQuestions(all, settings) {
  const excluded = new Set(settings.excludedTopics ?? []);
  const byPriority = [...all].sort((a, b) => a.priority - b.priority).filter((q) => !excluded.has(q.pattern));
  if (settings.mode === "all") return byPriority;
  const diffs = new Set(settings.difficulty ?? DIFFICULTIES);
  const topics = settings.topics ? new Set(settings.topics) : null;
  let budget = 60 * settings.hours * settings.weeks;
  const picked = [];
  for (const q of byPriority) {
    if (!diffs.has(q.difficulty) || (topics && !topics.has(q.topic))) continue;
    budget -= costOf(q);
    if (budget < 0) break;
    picked.push(q);
  }
  return picked;
}

// Array.prototype.sort is stable, so ties keep priority order, same as Grind 75.
// `recommended` also needs the plan's weeks/hours and marks each question `review: true|false`.
export function orderQuestions(questions, order, settings = DEFAULT_SETTINGS) {
  if (order === "recommended") return orderRecommended(questions, settings);
  const cmp = {
    all_rounded: (a, b) => a.priority - b.priority,
    difficulty: (a, b) => DIFFICULTY_RANK[a.difficulty] - DIFFICULTY_RANK[b.difficulty],
    topics: (a, b) => (GRIND_TOPIC_RANK[a.topic] ?? 99) - (GRIND_TOPIC_RANK[b.topic] ?? 99),
    roadmap: (a, b) =>
      (TOPO_RANK[a.pattern] ?? 99) - (TOPO_RANK[b.pattern] ?? 99) ||
      DIFFICULTY_RANK[a.difficulty] - DIFFICULTY_RANK[b.difficulty] ||
      a.priority - b.priority,
  }[order];
  return cmp ? [...questions].sort(cmp) : [...questions];
}

// Fills weeks in list order; everything that doesn't fit lands in the last week.
export function assignWeeks(questions, { weeks, hours }) {
  const perWeek = 60 * hours;
  let week = 1;
  let used = 0;
  return questions.map((q) => {
    const cost = costOf(q);
    if (week < weeks && used + cost > perWeek) {
      week += 1;
      used = 0;
    }
    used += cost;
    return { ...q, week };
  });
}

export function totalHours(questions) {
  return Math.ceil(Math.ceil(questions.reduce((sum, q) => sum + costOf(q), 0)) / 60);
}

// Full pipeline: map to NeetCode topics, select, order, split into weeks.
// `pool` is the plan's saved copy of the Grind 75 dataset, so results don't shift when the site
// updates. `slugs` is only set on older (v1) plans, which pinned the chosen questions.
export function buildSchedule(pool, settings, ncIndex, slugs = null) {
  const mapped = pool.map((q) => mapQuestion(q, ncIndex));
  let picked;
  if (slugs) {
    const excluded = new Set(settings.excludedTopics ?? []);
    const bySlug = new Map(mapped.map((q) => [q.slug, q]));
    picked = slugs.map((s) => bySlug.get(s)).filter((q) => q && !excluded.has(q.pattern));
  } else {
    picked = selectQuestions(mapped, settings);
  }
  const ordered = orderQuestions(picked, settings.order, settings);
  const questions = assignWeeks(ordered, settings);
  return {
    questions,
    hours: totalHours(questions),
    fits: totalHours(questions) <= settings.hours * settings.weeks,
    missing: slugs ? slugs.filter((s) => !pool.some((q) => q.slug === s)).length : 0,
  };
}

// Returns [{ name, questions }] in display order, skipping empty groups.
export function groupQuestions(questions, grouping) {
  const groups = new Map();
  const add = (name, q) => {
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(q);
  };
  if (grouping === "topics") {
    for (const label of TOPO_LABELS) groups.set(label, []);
    for (const q of questions) add(q.pattern, q);
  } else if (grouping === "difficulty") {
    for (const d of DIFFICULTIES) groups.set(d, []);
    for (const q of questions) add(q.difficulty, q);
  } else if (grouping === "none") {
    groups.set("All questions", [...questions]);
  } else {
    for (const q of [...questions].sort((a, b) => a.week - b.week)) add(`Week ${q.week}`, q);
  }
  return [...groups.entries()].filter(([, list]) => list.length).map(([name, list]) => ({ name, questions: list }));
}
