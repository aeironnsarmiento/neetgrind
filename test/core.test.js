import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { extractGrindQuestions } from "../src/data/grindSource.js";
import { extractNeetcodeProblems } from "../src/data/neetcodeSource.js";
import { indexNeetcode, mapQuestion, UNMATCHED_OVERRIDES } from "../src/core/mapping.js";
import { NC_NODES, TOPO_LABELS, TOPO_RANK, ancestorsOf, visibleGraph } from "../src/core/roadmap.js";
import { assignWeeks, buildSchedule, groupQuestions, orderQuestions, parseGrindParams, selectQuestions, DEFAULT_SETTINGS } from "../src/core/scheduler.js";
import { dailyTarget, nextDayTarget, planPosition, paceSummary } from "../src/core/daily.js";

// Fixtures are the live bundles (not committed). Download them with `npm run fixtures`.
const fx = (name) => new URL(`./fixtures/${name}`, import.meta.url);
const haveFixtures = existsSync(fx("grind-data.js")) && existsSync(fx("nc-main.js"));
const grind = haveFixtures ? extractGrindQuestions(readFileSync(fx("grind-data.js"), "utf8")) : [];
const nc = haveFixtures ? extractNeetcodeProblems(readFileSync(fx("nc-main.js"), "utf8")) : [];
const ncIndex = indexNeetcode(nc);
const withFixtures = { skip: !haveFixtures && "fixtures missing (npm run fixtures)" };

const settings = (over = {}) => ({ ...DEFAULT_SETTINGS, ...over });

test("extracts the Grind 75 dataset", withFixtures, () => {
  assert.equal(grind.length, 169);
  assert.deepEqual(grind[0].slug, "two-sum");
});

test("extracts NeetCode problems from main bundle", withFixtures, () => {
  assert.ok(nc.length >= 900, `got ${nc.length}`);
  const cd = nc.find((p) => p.link === "contains-duplicate/");
  assert.equal(cd.pattern, "Arrays & Hashing");
  assert.equal(cd.ncLink, "duplicate-integer/");
  assert.equal(cd.neetcode150, true);
});

test("selection matches Grind 75 counts", withFixtures, () => {
  assert.equal(selectQuestions(grind, settings({ weeks: 8, hours: 8 })).length, 75);
  assert.equal(selectQuestions(grind, settings({ weeks: 4, hours: 8 })).length, 41);
  assert.equal(selectQuestions(grind, settings({ weeks: 26, hours: 40 })).length, 169);
  assert.equal(selectQuestions(grind, settings({ mode: "all", weeks: 1, hours: 1 })).length, 169);
});

test("difficulty and topic filters apply before the budget", withFixtures, () => {
  const easy = selectQuestions(grind, settings({ weeks: 26, hours: 40, difficulty: ["Easy"] }));
  assert.ok(easy.length > 0 && easy.every((q) => q.difficulty === "Easy"));
  const trees = selectQuestions(grind, settings({ weeks: 26, hours: 40, topics: ["binary-tree"] }));
  assert.ok(trees.every((q) => q.topic === "binary-tree"));
});

test("week packing follows Grind 75 (overflow lands in last week)", () => {
  const qs = Array.from({ length: 10 }, (_, i) => ({ slug: `q${i}`, duration: 30 })); // 58.8 min each
  const packed = assignWeeks(qs, { weeks: 3, hours: 2 }); // 120 min/week -> 2 per week
  assert.deepEqual(packed.map((q) => q.week), [1, 1, 2, 2, 3, 3, 3, 3, 3, 3]);
});

test("slug join: 154 matched, 15 overrides", withFixtures, () => {
  const mapped = grind.map((q) => mapQuestion(q, ncIndex));
  const matched = mapped.filter((q) => !q.leetcodeOnly);
  assert.equal(matched.length, 154);
  const unmatched = mapped.filter((q) => q.leetcodeOnly).map((q) => q.slug).sort();
  assert.deepEqual(unmatched, Object.keys(UNMATCHED_OVERRIDES).sort());
  const labels = new Set(NC_NODES.map((n) => n.label));
  assert.ok(mapped.every((q) => labels.has(q.pattern)), "every question lands on a roadmap node");
});

test("topo order respects every roadmap edge", () => {
  assert.equal(TOPO_LABELS.length, NC_NODES.length);
  const byId = new Map(NC_NODES.map((n) => [n.id, n.label]));
  for (const n of NC_NODES) for (const p of n.parents) assert.ok(TOPO_RANK[byId.get(p)] < TOPO_RANK[n.label]);
  assert.deepEqual([...ancestorsOf("Trees")].sort(), ["Arrays & Hashing", "Binary Search", "Linked List", "Two Pointers"]);
});

test("roadmap order walks the graph and keeps Grind's question set", withFixtures, () => {
  const plan = buildSchedule(grind, settings({ order: "roadmap" }), ncIndex);
  assert.equal(plan.questions.length, 75);
  const ranks = plan.questions.map((q) => TOPO_RANK[q.pattern]);
  assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b));
  assert.equal(plan.questions[0].pattern, "Arrays & Hashing");
  assert.equal(plan.questions.at(-1).week, 8);
});

test("pinned slugs survive dataset changes", withFixtures, () => {
  const slugs = ["two-sum", "not-a-real-slug", "valid-parentheses"];
  const plan = buildSchedule(grind, settings({ order: "all_rounded" }), ncIndex, slugs);
  assert.deepEqual(plan.questions.map((q) => q.slug), ["two-sum", "valid-parentheses"]);
  assert.equal(plan.missing, 1);
});

test("defaults: Grind 75 selection and weeks, Recommended order", () => {
  assert.equal(DEFAULT_SETTINGS.mode, "preferences");
  assert.equal(DEFAULT_SETTINGS.order, "recommended");
  assert.equal(DEFAULT_SETTINGS.grouping, "weeks");
});

test("difficulty order reproduces Grind 75's week 1", withFixtures, () => {
  const plan = buildSchedule(grind, settings({ weeks: 4, hours: 8, order: "difficulty" }), ncIndex);
  const week1 = plan.questions.filter((q) => q.week === 1).map((q) => q.slug);
  assert.deepEqual(week1.slice(0, 9), [
    "two-sum", "valid-parentheses", "merge-two-sorted-lists", "best-time-to-buy-and-sell-stock",
    "valid-palindrome", "invert-binary-tree", "valid-anagram", "binary-search", "flood-fill",
  ]);
  assert.equal(week1.length, 13);
});

test("orderQuestions: grind orders", () => {
  const qs = [
    { slug: "a", difficulty: "Hard", topic: "array", priority: 2 },
    { slug: "b", difficulty: "Easy", topic: "math", priority: 1 },
    { slug: "c", difficulty: "Easy", topic: "array", priority: 0 },
  ];
  assert.deepEqual(orderQuestions(qs, "difficulty").map((q) => q.slug), ["b", "c", "a"]);
  assert.deepEqual(orderQuestions(qs, "topics").map((q) => q.slug), ["a", "c", "b"]);
  assert.deepEqual(orderQuestions(qs, "all_rounded").map((q) => q.slug), ["c", "b", "a"]);
});

test("parseGrindParams reads repeated params and defaults", () => {
  const s = parseGrindParams("?weeks=4&hours=6&difficulty=Easy&difficulty=Medium&order=topics&grouping=topics");
  assert.equal(s.weeks, 4);
  assert.equal(s.hours, 6);
  assert.deepEqual(s.difficulty, ["Easy", "Medium"]);
  assert.equal(s.grindOrder, "topics");
  assert.equal(s.grouping, "topics");
  const d = parseGrindParams("");
  assert.equal(d.weeks, 8);
  assert.equal(d.grindOrder, "difficulty");
  assert.equal(d.topics, null);
});

test("daily target spreads backlog over UTC days left in the week", () => {
  const questions = Array.from({ length: 14 }, (_, i) => ({ slug: `q${i}`, week: i < 7 ? 1 : 2 }));
  const plan = { startDate: "2026-09-01", settings: { weeks: 2 }, questions };
  const none = () => false;
  // Day 1 of week 1: 7 questions over 7 days.
  assert.equal(dailyTarget(plan, none, new Date("2026-09-01T23:59:00Z")).slugs.length, 1);
  // Day 7 of week 1 with nothing done: all 7 today.
  assert.equal(dailyTarget(plan, none, new Date("2026-09-07T00:00:00Z")).slugs.length, 7);
  // Week 2 day 1 with week 1 undone: 14 over 7 days.
  const w2 = dailyTarget(plan, none, new Date("2026-09-08T00:00:00Z"));
  assert.equal(w2.pos.week, 2);
  assert.deepEqual(w2.slugs, ["q0", "q1"]);
  assert.equal(planPosition(plan, new Date("2026-08-31T12:00:00Z")).state, "not-started");
  assert.equal(planPosition(plan, new Date("2026-09-15T00:00:00Z")).state, "overtime");
  assert.equal(paceSummary(plan, (q) => q.slug === "q0", new Date("2026-09-08T00:00:00Z")).overdue, 6);
});

test("daily target splits by minutes, so easy days get more questions", () => {
  const mk = (d, n, week = 1) => Array.from({ length: n }, (_, i) => ({ slug: `${d}${i}`, week, difficulty: d, duration: d === "Easy" ? 18 : 28 }));
  const none = () => false;
  const day1 = new Date("2026-09-01T00:00:00Z");
  // ~10h/week: 17 easy (35 min each) vs 11 medium (55 min each), 7 days left.
  const easy = { startDate: "2026-09-01", settings: { weeks: 1 }, questions: mk("Easy", 17) };
  const medium = { startDate: "2026-09-01", settings: { weeks: 1 }, questions: mk("Medium", 11) };
  assert.equal(dailyTarget(easy, none, day1).slugs.length, 3);
  assert.equal(dailyTarget(medium, none, day1).slugs.length, 2);
  // Last day of the week takes everything left.
  assert.equal(dailyTarget(medium, none, new Date("2026-09-07T00:00:00Z")).slugs.length, 11);
});

test("nextDayTarget pulls the next day's share, skipping days already covered", () => {
  const questions = Array.from({ length: 14 }, (_, i) => ({ slug: `q${i}`, week: i < 7 ? 1 : 2 }));
  const plan = { startDate: "2026-09-01", settings: { weeks: 2 }, questions };
  const doneUpTo = (n) => (q) => Number(q.slug.slice(1)) < n;
  // Day 1, today's q0 done: tomorrow spreads q1..q6 over 6 days.
  assert.deepEqual(nextDayTarget(plan, doneUpTo(1), new Date("2026-09-01T12:00:00Z")).slugs, ["q1"]);
  // All of week 1 done on day 1: the rest of week 1 is empty, so it jumps to week 2.
  const w2 = nextDayTarget(plan, doneUpTo(7), new Date("2026-09-01T12:00:00Z"));
  assert.equal(w2.pos.week, 2);
  assert.deepEqual(w2.slugs, ["q7"]);
  // Everything done: nothing to pull.
  assert.deepEqual(nextDayTarget(plan, () => true, new Date("2026-09-01T12:00:00Z")).slugs, []);
});

test("parseGrindParams accepts every Grind 75 grouping", () => {
  for (const g of ["weeks", "topics", "difficulty", "none"]) assert.equal(parseGrindParams(`?grouping=${g}`).grouping, g);
  assert.equal(parseGrindParams("?grouping=bogus").grouping, "weeks");
});

test("groupQuestions: weeks, topics, difficulty, none", () => {
  const qs = [
    { slug: "a", week: 2, pattern: "Trees", difficulty: "Hard" },
    { slug: "b", week: 1, pattern: "Stack", difficulty: "Easy" },
    { slug: "c", week: 1, pattern: "Arrays & Hashing", difficulty: "Medium" },
  ];
  const names = (g) => groupQuestions(qs, g).map((x) => x.name);
  assert.deepEqual(names("weeks"), ["Week 1", "Week 2"]);
  assert.deepEqual(names("topics"), ["Arrays & Hashing", "Stack", "Trees"]);
  assert.deepEqual(names("difficulty"), ["Easy", "Medium", "Hard"]);
  assert.deepEqual(groupQuestions(qs, "none").map((x) => x.questions.length), [3]);
});

test("visibleGraph rewires edges around hidden topics", () => {
  const all = NC_NODES.map((n) => n.label);
  assert.equal(visibleGraph(all).length, 18);
  // Hide Heap: Intervals and Greedy hang off Trees; Advanced Graphs keeps only Graphs
  // (Trees is already an ancestor of Graphs, so a direct Trees edge would be redundant).
  const g = new Map(visibleGraph(all.filter((l) => l !== "Heap / Priority Queue")).map((n) => [n.label, n.parents]));
  assert.deepEqual(g.get("Intervals"), ["Trees"]);
  assert.deepEqual(g.get("Greedy"), ["Trees"]);
  assert.deepEqual(g.get("Advanced Graphs"), ["Graphs"]);
  assert.ok(!g.has("Heap / Priority Queue"));
});

test("excluded NeetCode topics are skipped and their hours reused", withFixtures, () => {
  const excludedTopics = ["Bit Manipulation", "Intervals", "Heap / Priority Queue"];
  const base = buildSchedule(grind, settings(), ncIndex);
  const plan = buildSchedule(grind, settings({ excludedTopics }), ncIndex);
  assert.ok(base.questions.some((q) => excludedTopics.includes(q.pattern)));
  assert.ok(plan.questions.every((q) => !excludedTopics.includes(q.pattern)));
  // Freed budget goes to lower-priority questions, so the plan isn't simply smaller.
  assert.ok(plan.questions.some((q) => !base.questions.some((b) => b.slug === q.slug)));
  const budget = 60 * 8 * 8;
  assert.ok(plan.questions.reduce((t, q) => t + 1.96 * q.duration, 0) <= budget);
});

for (const [weeks, hours] of [[4, 8], [8, 8], [12, 10]]) {
  test(`recommended order (${weeks}w x ${hours}h): intro, spaced review, mixed finish`, withFixtures, () => {
    const s = settings({ weeks, hours });
    const rec = buildSchedule(grind, s, ncIndex).questions;
    const diff = buildSchedule(grind, settings({ weeks, hours, order: "difficulty" }), ncIndex).questions;
    // Same questions as Grind 75, just reordered.
    assert.deepEqual(rec.map((q) => q.slug).sort(), diff.map((q) => q.slug).sort());

    // Topics are introduced in roadmap order, and never reviewed before their intro.
    const firstSeen = [];
    for (const q of rec) if (!firstSeen.includes(q.pattern)) firstSeen.push(q.pattern);
    assert.deepEqual(firstSeen, [...firstSeen].sort((a, b) => TOPO_RANK[a] - TOPO_RANK[b]));
    for (const q of rec.filter((x) => !x.review)) {
      const firstReview = rec.findIndex((x) => x.review && x.pattern === q.pattern);
      if (firstReview >= 0) assert.ok(rec.indexOf(q) < firstReview, `${q.pattern} reviewed before intro`);
    }

    // Intros skip Hards when the topic has anything easier.
    for (const t of new Set(rec.map((q) => q.pattern))) {
      const ofTopic = rec.filter((q) => q.pattern === t);
      if (ofTopic.some((q) => q.difficulty !== "Hard")) {
        assert.ok(ofTopic.filter((q) => !q.review).every((q) => q.difficulty !== "Hard"), `${t} intro has a Hard`);
      }
    }

    // A topic's Hard review only comes after an earlier review of that topic
    // (unless every review question left for that topic is Hard).
    rec.forEach((q, i) => {
      const onlyHards = rec.filter((x) => x.review && x.pattern === q.pattern).every((x) => x.difficulty === "Hard");
      if (q.review && q.difficulty === "Hard" && !onlyHards) {
        assert.ok(rec.slice(0, i).some((x) => x.review && x.pattern === q.pattern), `${q.slug} Hard before first review`);
      }
    });

    // Week 1 is new material only; the last week is review only; weeks in between mix both.
    const week = (w) => rec.filter((q) => q.week === w);
    assert.ok(week(1).every((q) => !q.review));
    assert.ok(week(weeks).length && week(weeks).every((q) => q.review));
    for (let w = 2; w < weeks; w++) if (week(w).length) assert.ok(week(w).some((q) => q.review), `week ${w} has no review`);

    // No more than 2 of the same topic in a row among reviews.
    for (let i = 2; i < rec.length; i++) {
      const [a, b, c] = rec.slice(i - 2, i + 1);
      if (a.review && b.review && c.review && a.pattern === b.pattern && b.pattern === c.pattern) {
        const left = rec.slice(i).some((q) => q.pattern !== c.pattern);
        assert.ok(!left, `3 ${c.pattern} reviews in a row at ${i}`);
      }
    }
  });
}
