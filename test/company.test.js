import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { mergeCompanyRows, parseCsv, rowsFromCsv } from "../src/data/companySource.js";
import { extractGrindQuestions } from "../src/data/grindSource.js";
import { extractNeetcodeProblems } from "../src/data/neetcodeSource.js";
import { indexNeetcode, patternFromLcTopics } from "../src/core/mapping.js";
import { buildSchedule, costOf, DEFAULT_SETTINGS } from "../src/core/scheduler.js";

// Synthetic rows in the company-list CSV format (the real lists have no license, so no fixtures).
const CSV = `Difficulty,Title,Frequency,Acceptance Rate,Link,Topics
EASY,Two Sum,100.0,0.55,https://leetcode.com/problems/two-sum,"Array, Hash Table"
MEDIUM,"Quoted, Title",80.5,0.4,https://leetcode.com/problems/quoted-title/,"Tree, Depth-First Search"
HARD,No Link,50,0.3,,Array
WEIRD,Bad Difficulty,40,0.3,https://leetcode.com/problems/bad,Array
`;

test("parseCsv handles quoted fields with commas and escaped quotes", () => {
  const rows = parseCsv('a,b\n"x, y","say ""hi"""\r\n');
  assert.deepEqual(rows, [["a", "b"], ["x, y", 'say "hi"']]);
});

test("rowsFromCsv normalises slug, difficulty and topics; drops bad rows", () => {
  const rows = rowsFromCsv(CSV);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], { slug: "two-sum", title: "Two Sum", difficulty: "Easy", frequency: 100, lcTopics: ["Array", "Hash Table"] });
  assert.equal(rows[1].slug, "quoted-title");
  assert.equal(rows[1].title, "Quoted, Title");
  assert.equal(rows[1].difficulty, "Medium");
});

test("patternFromLcTopics picks the most specific NeetCode topic", () => {
  assert.equal(patternFromLcTopics(["Array", "Hash Table"]), "Arrays & Hashing");
  assert.equal(patternFromLcTopics(["Tree", "Depth-First Search"]), "Trees");
  assert.equal(patternFromLcTopics(["Depth-First Search", "Matrix", "Graph"]), "Graphs");
  assert.equal(patternFromLcTopics(["Array", "Dynamic Programming"]), "1-D Dynamic Programming");
  assert.equal(patternFromLcTopics(["Array", "Dynamic Programming", "Matrix"]), "2-D Dynamic Programming");
  assert.equal(patternFromLcTopics(["Graph", "Shortest Path", "Heap (Priority Queue)"]), "Heap / Priority Queue");
  assert.equal(patternFromLcTopics(["Dynamic Programming", "Depth-First Search", "Graph Theory"]), "Graphs");
  assert.equal(patternFromLcTopics(["Array", "Union-Find"]), "Graphs");
  assert.equal(patternFromLcTopics(["Array", "Sweep Line", "Sorting"]), "Intervals");
  assert.equal(patternFromLcTopics([]), null);
});

test("mergeCompanyRows joins companies by slug, most frequent first", () => {
  const merged = mergeCompanyRows({
    A: [{ slug: "x", title: "X", difficulty: "Easy", frequency: 10, lcTopics: [] }],
    B: [
      { slug: "x", title: "X", difficulty: "Easy", frequency: 90, lcTopics: [] },
      { slug: "y", title: "Y", difficulty: "Hard", frequency: 50, lcTopics: [] },
    ],
  });
  assert.deepEqual(merged.map((q) => q.slug), ["x", "y"]);
  assert.deepEqual(merged[0].tags, [{ company: "B", frequency: 90 }, { company: "A", frequency: 10 }]);
});

// --- scheduling ---------------------------------------------------------------------------------

const fx = (name) => new URL(`./fixtures/${name}`, import.meta.url);
const haveFixtures = existsSync(fx("grind-data.js")) && existsSync(fx("nc-main.js"));
const grind = haveFixtures ? extractGrindQuestions(readFileSync(fx("grind-data.js"), "utf8")) : [];
const ncIndex = indexNeetcode(haveFixtures ? extractNeetcodeProblems(readFileSync(fx("nc-main.js"), "utf8")) : []);
const withFixtures = { skip: !haveFixtures && "fixtures missing (npm run fixtures)" };

// 40 made-up questions per company (not on NeetCode or Grind 75), plus two-sum for company A.
const row = (company, i, difficulty, topics) => ({
  slug: `${company.toLowerCase()}-q${i}`,
  title: `${company} Q${i}`,
  difficulty,
  frequency: 100 - i,
  lcTopics: topics,
});
const lists = {
  A: [
    { slug: "two-sum", title: "Two Sum", difficulty: "Easy", frequency: 100, lcTopics: ["Array"] },
    ...Array.from({ length: 40 }, (_, i) => row("A", i, ["Easy", "Medium", "Hard"][i % 3], ["Array"])),
  ],
  B: Array.from({ length: 40 }, (_, i) => row("B", i, "Medium", i % 2 ? ["Tree"] : ["Stack"])),
};
const companyPool = mergeCompanyRows(lists);
const settings = (company = {}, over = {}) => ({
  ...DEFAULT_SETTINGS,
  ...over,
  company: { ...DEFAULT_SETTINGS.company, names: ["A", "B"], ...company },
});
const tagged = (qs) => qs.filter((q) => q.companies?.length);
const extra = (qs) => qs.filter((q) => q.priority >= 1000);

test("no companies gives the same schedule as before", withFixtures, () => {
  const plain = buildSchedule(grind, DEFAULT_SETTINGS, ncIndex);
  const empty = buildSchedule(grind, DEFAULT_SETTINGS, ncIndex, null, []);
  assert.equal(plain.questions.length, 75);
  assert.deepEqual(empty.questions.map((q) => q.slug), plain.questions.map((q) => q.slug));
  assert.equal(plain.companyCount, 0);
});

test("count mode takes top N per company, before Grind 75", withFixtures, () => {
  const { questions } = buildSchedule(grind, settings({ count: 5 }), ncIndex, null, companyPool);
  const slugs = new Set(questions.map((q) => q.slug));
  // A's top 5 includes two-sum (already in Grind 75: merged, not duplicated).
  assert.equal(questions.filter((q) => q.slug === "two-sum").length, 1);
  assert.deepEqual(questions.find((q) => q.slug === "two-sum").companies, [{ company: "A", frequency: 100 }]);
  for (let i = 0; i < 4; i++) assert.ok(slugs.has(`a-q${i}`));
  for (let i = 0; i < 5; i++) assert.ok(slugs.has(`b-q${i}`));
  assert.equal(extra(questions).length, 9);
  assert.ok(!slugs.has("b-q5"));
  // Unknown questions get a topic from their LeetCode tags and link to LeetCode.
  const b1 = questions.find((q) => q.slug === "b-q1");
  assert.equal(b1.pattern, "Trees");
  assert.equal(b1.leetcodeOnly, true);
  assert.equal(b1.duration, 30);
});

test("company questions follow difficulty and topic filters", withFixtures, () => {
  const { questions } = buildSchedule(
    grind,
    settings({ count: 10 }, { difficulty: ["Medium"], excludedTopics: ["Stack"] }),
    ncIndex,
    null,
    companyPool,
  );
  const ex = extra(questions);
  assert.ok(ex.every((q) => q.difficulty === "Medium" && q.pattern !== "Stack"));
  assert.equal(ex.filter((q) => q.slug.startsWith("b-")).length, 10);
  assert.ok(ex.filter((q) => q.slug.startsWith("b-")).every((q) => q.pattern === "Trees"));
});

test("share mode keeps company questions within the share of hours", withFixtures, () => {
  const s = settings({ limit: "share", share: 25 });
  const { questions } = buildSchedule(grind, s, ncIndex, null, companyPool);
  const ex = extra(questions);
  const used = ex.reduce((t, q) => t + costOf(q), 0);
  const cap = 0.25 * 60 * s.hours * s.weeks;
  assert.ok(used <= cap, `${used} > ${cap}`);
  assert.ok(used > cap - 2 * costOf({ duration: 40 }), `only used ${used} of ${cap}`);
  // Turns between companies.
  assert.ok(ex.some((q) => q.slug.startsWith("a-")) && ex.some((q) => q.slug.startsWith("b-")));
});

test("hand-picked questions are always in, even outside the filters", withFixtures, () => {
  const { questions } = buildSchedule(
    grind,
    settings({ count: 1, picked: ["b-q30", "a-q2"] }, { difficulty: ["Easy"] }),
    ncIndex,
    null,
    companyPool,
  );
  const slugs = new Set(questions.map((q) => q.slug));
  assert.ok(slugs.has("b-q30") && slugs.has("a-q2"));
});

test("with too little time, company questions push Grind 75 out", withFixtures, () => {
  const s = settings({ count: 40 }, { weeks: 1, hours: 2 });
  const { questions } = buildSchedule(grind, s, ncIndex, null, companyPool);
  assert.ok(questions.length > 0);
  assert.ok(questions.every((q) => q.companies?.length), "only company questions fit");
  assert.ok(questions.reduce((t, q) => t + costOf(q), 0) <= 120);
});

test("Grind 75 questions on a company list are tagged", withFixtures, () => {
  const { questions, companyCount } = buildSchedule(grind, settings({ count: 0 }), ncIndex, null, companyPool);
  assert.equal(extra(questions).length, 0);
  assert.equal(tagged(questions).map((q) => q.slug).join(), "two-sum");
  assert.equal(companyCount, 1);
});
