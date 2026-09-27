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

// Company-tagged questions (see data/companySource.js). `limit` is "count" (top N per company)
// or "share" (% of the plan's hours). `picked` slugs are always in the plan.
export const DEFAULT_COMPANY = { names: [], window: "6mo", limit: "count", count: 25, share: 50, picked: [] };
export const COMPANY_LIMITS = { count: "Top N per company", share: "Share of time" };
// Estimated minutes for questions Grind 75 doesn't list (close to Grind's averages: 18 / 28 / 38).
export const EST_DURATION = { Easy: 20, Medium: 30, Hard: 40 };

export const DEFAULT_SETTINGS = {
  weeks: 8,
  hours: 8,
  difficulty: [...DIFFICULTIES],
  topics: null, // null = all topics (Grind 75 topics)
  excludedTopics: [], // NeetCode roadmap topics to leave out
  mode: "preferences",
  order: "recommended",
  grouping: "weeks",
  company: DEFAULT_COMPANY,
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
// `budget` (minutes) overrides the plan's hours, e.g. for what's left after company questions.
export function selectQuestions(all, settings, budget = 60 * settings.hours * settings.weeks) {
  const excluded = new Set(settings.excludedTopics ?? []);
  const byPriority = [...all].sort((a, b) => a.priority - b.priority).filter((q) => !excluded.has(q.pattern));
  if (settings.mode === "all") return byPriority;
  const diffs = new Set(settings.difficulty ?? DIFFICULTIES);
  const topics = settings.topics ? new Set(settings.topics) : null;
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

export function companySettings(settings) {
  return { ...DEFAULT_COMPANY, ...settings?.company };
}

// Tags Grind 75 questions that are on a chosen company's list, and turns the rest of the company
// rows into questions. Returns { grind, extra }, both mapped to NeetCode topics.
export function withCompanies(grindMapped, companyPool, ncIndex) {
  const tags = new Map(companyPool.map((r) => [r.slug, r.tags]));
  const grind = grindMapped.map((q) => (tags.has(q.slug) ? { ...q, companies: tags.get(q.slug) } : q));
  const inGrind = new Set(grindMapped.map((q) => q.slug));
  const extra = companyPool
    .filter((r) => !inGrind.has(r.slug))
    .map((r, i) =>
      mapQuestion(
        {
          slug: r.slug,
          title: r.title,
          url: `https://leetcode.com/problems/${r.slug}/`,
          duration: EST_DURATION[r.difficulty] ?? 30,
          difficulty: r.difficulty,
          topic: null,
          priority: 1000 + i,
          premium: false,
          lcTopics: r.lcTopics,
          companies: r.tags,
        },
        ncIndex,
      ),
    );
  return { grind, extra };
}

export const bestFrequency = (q) => Math.max(0, ...(q.companies ?? []).map((t) => t.frequency));
const frequencyFor = (q, company) => q.companies?.find((t) => t.company === company)?.frequency ?? -1;

// Company questions go first. Hand-picked ones are always in; the rest follow the plan's
// difficulty and topic filters, capped by `limit`, and everything is trimmed to the total budget
// so that, with too little time, company questions push Grind 75 out rather than the reverse.
export function selectCompanyQuestions(candidates, settings) {
  const co = companySettings(settings);
  if (!co.names.length && !co.picked.length) return [];
  const budget = 60 * settings.hours * settings.weeks;
  const bySlug = new Map(candidates.map((q) => [q.slug, q]));
  const picked = co.picked.map((s) => bySlug.get(s)).filter(Boolean);
  const pickedSet = new Set(picked.map((q) => q.slug));
  const diffs = new Set(settings.difficulty ?? DIFFICULTIES);
  const excluded = new Set(settings.excludedTopics ?? []);
  const eligible = candidates.filter(
    (q) => !pickedSet.has(q.slug) && diffs.has(q.difficulty) && !excluded.has(q.pattern) && q.companies?.length,
  );

  const ranked = [];
  const seen = new Set();
  const add = (q) => !seen.has(q.slug) && (seen.add(q.slug), ranked.push(q));
  const perCompany = co.names.map((name) =>
    eligible.filter((q) => frequencyFor(q, name) >= 0).sort((a, b) => frequencyFor(b, name) - frequencyFor(a, name)),
  );
  if (co.limit === "share") {
    // Take turns between companies, most frequent first, until the share of hours is used.
    let left = (budget * Math.min(100, Math.max(0, co.share))) / 100 - picked.reduce((t, q) => t + costOf(q), 0);
    const cursors = perCompany.map(() => 0);
    let progress = true;
    while (progress && left > 0) {
      progress = false;
      perCompany.forEach((list, i) => {
        while (cursors[i] < list.length && seen.has(list[cursors[i]].slug)) cursors[i]++;
        const q = list[cursors[i]];
        if (!q || costOf(q) > left) return;
        add(q);
        left -= costOf(q);
        progress = true;
      });
    }
  } else {
    const n = Math.max(0, Math.round(co.count));
    for (const list of perCompany) list.slice(0, n).forEach(add);
    ranked.sort((a, b) => bestFrequency(b) - bestFrequency(a));
  }

  const out = [];
  let left = budget;
  for (const q of [...picked, ...ranked]) {
    if (costOf(q) > left) continue;
    out.push(q);
    left -= costOf(q);
  }
  return out;
}

// Full pipeline: map to NeetCode topics, select, order, split into weeks.
// `pool` is the plan's saved copy of the Grind 75 dataset, so results don't shift when the site
// updates. `slugs` is only set on older (v1) plans, which pinned the chosen questions.
// `companyPool` is the plan's saved copy of the chosen companies' lists (data/companySource.js).
export function buildSchedule(pool, settings, ncIndex, slugs = null, companyPool = []) {
  const { grind: mapped, extra } = withCompanies(
    pool.map((q) => mapQuestion(q, ncIndex)),
    companyPool ?? [],
    ncIndex,
  );
  const company = selectCompanyQuestions([...mapped, ...extra], settings);
  const taken = new Set(company.map((q) => q.slug));
  let picked;
  if (slugs) {
    const excluded = new Set(settings.excludedTopics ?? []);
    const bySlug = new Map(mapped.map((q) => [q.slug, q]));
    picked = slugs.map((s) => bySlug.get(s)).filter((q) => q && !excluded.has(q.pattern) && !taken.has(q.slug));
  } else {
    const left = 60 * settings.hours * settings.weeks - company.reduce((t, q) => t + costOf(q), 0);
    const rest = mapped.filter((q) => !taken.has(q.slug));
    picked = settings.mode === "all" ? selectQuestions(rest, settings) : selectQuestions(rest, settings, left);
  }
  picked = [...company, ...picked];
  const ordered = orderQuestions(picked, settings.order, settings);
  const questions = assignWeeks(ordered, settings);
  return {
    questions,
    hours: totalHours(questions),
    fits: totalHours(questions) <= settings.hours * settings.weeks,
    missing: slugs ? slugs.filter((s) => !pool.some((q) => q.slug === s)).length : 0,
    companyCount: questions.filter((q) => q.companies?.length).length,
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
