// Reimplementation of the Grind 75 schedule generator
// (techinterviewhandbook.org/grind75, client chunk logic), plus a NeetCode "roadmap" order.

import { mapQuestion } from "./mapping.js";
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
export const ORDERS = ["difficulty", "topics", "all_rounded", "roadmap"];
// Same choices as Grind 75's "Group by". Topics are NeetCode's roadmap topics here.
export const GROUPINGS = ["weeks", "topics", "difficulty", "none"];
export const GROUPING_LABELS = { weeks: "Weeks", topics: "Topics", difficulty: "Difficulty", none: "None" };

export const DEFAULT_SETTINGS = {
  weeks: 8,
  hours: 8,
  difficulty: [...DIFFICULTIES],
  topics: null, // null = all topics
  mode: "preferences",
  order: "difficulty",
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
// (Grind 75 does not skip and continue).
export function selectQuestions(all, settings) {
  const byPriority = [...all].sort((a, b) => a.priority - b.priority);
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
export function orderQuestions(questions, order) {
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

// Full pipeline. `slugs` pins the question set chosen when the plan was created,
// so a Grind 75 dataset update doesn't silently reshuffle an existing plan.
export function buildSchedule(allGrind, settings, ncIndex, slugs = null) {
  let picked;
  if (slugs) {
    const bySlug = new Map(allGrind.map((q) => [q.slug, q]));
    picked = slugs.map((s) => bySlug.get(s)).filter(Boolean);
  } else {
    picked = selectQuestions(allGrind, settings);
  }
  const mapped = picked.map((q) => mapQuestion(q, ncIndex));
  const ordered = orderQuestions(mapped, settings.order);
  const questions = assignWeeks(ordered, settings);
  return {
    questions,
    hours: totalHours(questions),
    fits: totalHours(questions) <= settings.hours * settings.weeks,
    missing: slugs ? slugs.length - picked.length : 0,
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
