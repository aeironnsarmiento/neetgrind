// "Recommended" order: blocked introduction, spaced + interleaved review, mixed finish.
//
// Evidence (see README → "Recommended order"):
// - Introduce each topic with a short easy→medium block, in prerequisite (roadmap) order:
//   blocked practice helps initial acquisition (worked-example / cognitive-load research;
//   Yan et al. 2017; Hwang 2024).
// - Then revisit earlier topics, spaced out and mixed with each other: interleaving trains
//   *which* pattern to use (Brunmair & Richter 2019, g≈0.42; Rohrer et al. 2014/2020), and
//   spaced retrieval beats massed practice (Latimier et al. 2021, g≈0.74).
// - Put confusable patterns next to each other; mixing dissimilar topics adds little.
// - Finish with fully mixed practice, like a real interview.
//
// Positions are measured in Grind 75 "cost" minutes (1.96 × duration), the same unit
// assignWeeks uses, so "week 1" and "last 20%" line up with the weeks the plan shows.

import { TOPO_LABELS, TOPO_RANK } from "./roadmap.js";

const COST_FACTOR = 1.96;
const DIFF_RANK = { Easy: 0, Medium: 1, Hard: 2 };
const cost = (q) => COST_FACTOR * q.duration;

// Patterns people mix up; reviews prefer these neighbours for contrast.
export const CONFUSABLE_GROUPS = [
  ["Two Pointers", "Sliding Window", "Binary Search"],
  ["Arrays & Hashing", "Two Pointers", "Sliding Window"],
  ["Stack", "Linked List"],
  ["Trees", "Graphs", "Backtracking", "Tries"],
  ["Graphs", "Advanced Graphs"],
  ["Greedy", "1-D Dynamic Programming", "2-D Dynamic Programming"],
  ["Heap / Priority Queue", "Intervals", "Greedy"],
  ["Bit Manipulation", "Math & Geometry"],
];

function confusableWith(label) {
  const out = new Set();
  for (const g of CONFUSABLE_GROUPS) if (g.includes(label)) g.forEach((l) => l !== label && out.add(l));
  return out;
}

// Share of the plan that is fully mixed review at the end.
const FINAL_SHARE = 0.2;
const FINAL_MAX_SHARE = 0.35;
// Most reviews allowed after one new question (≈ 2/3 of practice is review, with catch-up room).
const MAX_REVIEWS_PER_NEW = 3;
// A topic is ready for review this long (in weeks) after its intro, i.e. a few days.
const SPACING_WEEKS = 0.4;
// Don't review a topic that appeared in the last few questions (when there's a choice).
const RECENT_WINDOW = 3;

export function orderRecommended(questions, { weeks, hours }) {
  const weekCost = 60 * hours;
  const total = questions.reduce((t, q) => t + cost(q), 0);
  const finalCost = weeks >= 2 ? Math.min(Math.max(weekCost, total * FINAL_SHARE), total * FINAL_MAX_SHARE) : 0;
  const introSize = weeks >= 10 ? 3 : 2;

  // Per topic: easiest first, then Grind 75 priority.
  const byTopic = new Map();
  for (const q of questions) {
    if (!byTopic.has(q.pattern)) byTopic.set(q.pattern, []);
    byTopic.get(q.pattern).push(q);
  }
  for (const list of byTopic.values()) {
    list.sort((a, b) => DIFF_RANK[a.difficulty] - DIFF_RANK[b.difficulty] || a.priority - b.priority);
  }
  const topics = [...byTopic.keys()].sort((a, b) => (TOPO_RANK[a] ?? 99) - (TOPO_RANK[b] ?? 99));

  // Intro block: up to `introSize` non-Hard questions (or the first question if all are Hard).
  const intro = new Map();
  const pool = new Map();
  for (const t of topics) {
    const list = byTopic.get(t);
    const soft = list.filter((q) => q.difficulty !== "Hard").slice(0, introSize);
    const block = soft.length ? soft : list.slice(0, 1);
    intro.set(t, block);
    pool.set(t, list.filter((q) => !block.includes(q)));
  }

  const out = [];
  let pos = 0;
  const state = new Map(topics.map((t) => [t, { introducedAt: null, lastAt: -Infinity, reviews: 0 }]));
  let poolCost = [...pool.values()].flat().reduce((t, q) => t + cost(q), 0);

  const recentTopics = () => new Set(out.slice(-RECENT_WINDOW).map((q) => q.pattern));
  const emit = (q, review) => {
    out.push({ ...q, review });
    pos += cost(q);
    const st = state.get(q.pattern);
    st.lastAt = pos;
    if (review) st.reviews += 1;
  };

  // Next review question from topic `t`: easiest left, but no Hard until the topic
  // has had at least one review.
  const nextFrom = (t) => {
    const list = pool.get(t);
    if (!list.length) return null;
    const st = state.get(t);
    return st.reviews === 0 ? (list.find((q) => q.difficulty !== "Hard") ?? null) : list[0];
  };

  // Choose a review topic: skip ones just seen, then prefer confusable with `near`,
  // then least recently seen.
  const pickReview = ({ near, readyOnly, allowHardFallback }) => {
    let candidates = topics.filter((t) => {
      const st = state.get(t);
      if (st.introducedAt === null || !pool.get(t).length) return false;
      if (readyOnly && pos - st.introducedAt < SPACING_WEEKS * weekCost) return false;
      return nextFrom(t) || allowHardFallback;
    });
    if (!candidates.length) return null;
    const recent = recentTopics();
    const fresh = candidates.filter((t) => !recent.has(t));
    if (fresh.length) candidates = fresh;
    const near_ = near ? confusableWith(near) : new Set();
    // Longer since last seen and more questions left → more due. Confusable neighbours get a boost.
    const due = (t) => (pos - state.get(t).lastAt + weekCost * 0.25) * pool.get(t).length * (near_.has(t) ? 1.5 : 1);
    candidates.sort((a, b) => due(b) - due(a) || TOPO_RANK[a] - TOPO_RANK[b]);
    const t = candidates[0];
    return nextFrom(t) ?? pool.get(t)[0];
  };

  const take = (q) => {
    const list = pool.get(q.pattern);
    list.splice(list.indexOf(q), 1);
    poolCost -= cost(q);
  };

  // Main phase: introduce topics in roadmap order, reviewing earlier ones in between.
  // Review time outside the finish is spread in proportion to intro time, so every week
  // after the first gets some.
  const introTotal = topics.reduce((sum, t) => sum + intro.get(t).reduce((s, q) => s + cost(q), 0), 0);
  const mainReviewBudget = Math.max(0, poolCost - finalCost);
  let introSoFar = 0;
  let reviewedSoFar = 0;
  for (const t of topics) {
    for (const q of intro.get(t)) {
      emit(q, false);
      introSoFar += cost(q);
    }
    state.get(t).introducedAt = pos;
    if (pos < weekCost) continue; // week 1 stays mostly blocked
    const allowed = (mainReviewBudget * introSoFar) / introTotal;
    for (let i = 0; i < MAX_REVIEWS_PER_NEW * intro.get(t).length; i++) {
      const q = pickReview({ near: t, readyOnly: true, allowHardFallback: false });
      if (!q || reviewedSoFar + cost(q) / 2 > allowed || poolCost - cost(q) < finalCost) break;
      take(q);
      emit(q, true);
      reviewedSoFar += cost(q);
    }
  }

  // Finish: everything left, fully interleaved, alternating confusable neighbours.
  let prev = out.at(-1)?.pattern ?? null;
  while (poolCost > 1e-9) {
    const q = pickReview({ near: prev, readyOnly: false, allowHardFallback: true });
    if (!q) break;
    take(q);
    emit(q, true);
    prev = q.pattern;
  }
  return out;
}
