// ==UserScript==
// @name         NeetGrind: Grind 75 plans on NeetCode's roadmap
// @namespace    https://github.com/aeironnsarmiento/neetgrind
// @homepageURL  https://github.com/aeironnsarmiento/neetgrind
// @supportURL   https://github.com/aeironnsarmiento/neetgrind/issues
// @downloadURL  https://raw.githubusercontent.com/aeironnsarmiento/neetgrind/main/dist/neetgrind.user.js
// @updateURL    https://raw.githubusercontent.com/aeironnsarmiento/neetgrind/main/dist/neetgrind.user.js
// @license      MIT
// @icon         https://raw.githubusercontent.com/aeironnsarmiento/neetgrind/main/assets/icon-64.png
// @version      0.2.3
// @description  Build a custom Grind 75 study plan and view it on NeetCode's roadmap graph.
// @match        https://www.techinterviewhandbook.org/grind75*
// @match        https://neetcode.io/*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @connect      www.techinterviewhandbook.org
// @connect      neetcode.io
// @connect      raw.githubusercontent.com
// @connect      api.github.com
// @run-at       document-start
// @noframes
// ==/UserScript==

(() => {
  // src/core/mapping.js
  var UNMATCHED_OVERRIDES = {
    "01-matrix": "Graphs",
    "first-bad-version": "Binary Search",
    "string-to-integer-atoi": "Arrays & Hashing",
    "basic-calculator": "Stack",
    "shortest-path-to-get-food": "Graphs",
    "top-k-frequent-words": "Heap / Priority Queue",
    "path-sum-ii": "Trees",
    "odd-even-linked-list": "Linked List",
    "inorder-successor-in-bst": "Trees",
    "longest-valid-parentheses": "Stack",
    "path-sum-iii": "Trees",
    "all-nodes-distance-k-in-binary-tree": "Trees",
    "3sum-closest": "Two Pointers",
    "palindrome-pairs": "Tries",
    "sudoku-solver": "Backtracking"
  };
  var GRIND_TOPIC_FALLBACK = {
    array: "Arrays & Hashing",
    string: "Arrays & Hashing",
    "hash-table": "Arrays & Hashing",
    queue: "Arrays & Hashing",
    stack: "Stack",
    "linked-list": "Linked List",
    "binary-tree": "Trees",
    "binary-search-tree": "Trees",
    "binary-search": "Binary Search",
    graph: "Graphs",
    heap: "Heap / Priority Queue",
    trie: "Tries",
    recursion: "Backtracking",
    "dynamic-programming": "1-D Dynamic Programming",
    binary: "Bit Manipulation",
    matrix: "Math & Geometry",
    math: "Math & Geometry"
  };
  var LC_TOPIC_PATTERNS = [
    [["Trie"], "Tries"],
    [["Backtracking"], "Backtracking"],
    [["Heap (Priority Queue)"], "Heap / Priority Queue"],
    [
      [
        "Shortest Path",
        "Minimum Spanning Tree",
        "Eulerian Circuit",
        "Eulerian Path",
        "Strongly Connected Component",
        "Dijkstra's Algorithm",
        "Bellman\u2013Ford Algorithm",
        "Floyd\u2013Warshall Algorithm",
        "Prim's Algorithm",
        "Kruskal's Algorithm"
      ],
      "Advanced Graphs"
    ],
    [["Linked List", "Doubly-Linked List"], "Linked List"],
    [["Tree", "Binary Tree", "Binary Search Tree", "DP on Trees", "Lowest Common Ancestor"], "Trees"],
    // LeetCode renamed some tags (Graph → Graph Theory, Union Find → Union-Find); match both.
    [["Graph", "Graph Theory", "Topological Sort", "Union Find", "Union-Find", "Directed Acyclic Graph", "Bipartite Graph"], "Graphs"],
    [["Sliding Window", "Monotonic Queue"], "Sliding Window"],
    [["Two Pointers"], "Two Pointers"],
    [["Binary Search"], "Binary Search"],
    [["Stack", "Monotonic Stack"], "Stack"],
    [["Dynamic Programming", "Memoization", "Knapsack Problem", "0-1 Knapsack"], "1-D Dynamic Programming"],
    [["Greedy"], "Greedy"],
    [["Line Sweep", "Sweep Line"], "Intervals"],
    [["Bit Manipulation", "Bitmask"], "Bit Manipulation"],
    [["Math", "Geometry", "Matrix", "Number Theory"], "Math & Geometry"],
    [["Breadth-First Search", "Depth-First Search"], "Graphs"]
  ];
  function patternFromLcTopics(tags) {
    const has = new Set(tags ?? []);
    for (const [names, label] of LC_TOPIC_PATTERNS) {
      if (!names.some((n) => has.has(n))) continue;
      if (label === "1-D Dynamic Programming" && has.has("Matrix")) return "2-D Dynamic Programming";
      return label;
    }
    return tags?.length ? "Arrays & Hashing" : null;
  }
  function normalizeSlug(slug) {
    return String(slug ?? "").trim().replace(/^\/+|\/+$/g, "").toLowerCase();
  }
  function indexNeetcode(problems) {
    const index = /* @__PURE__ */ new Map();
    for (const p of problems) {
      const slug = normalizeSlug(p.link);
      if (slug && !index.has(slug) && p.pattern !== "JavaScript") index.set(slug, p);
    }
    return index;
  }
  function mapQuestion(q, ncIndex) {
    const nc = ncIndex.get(normalizeSlug(q.slug));
    if (nc) {
      const ncSlug = normalizeSlug(nc.ncLink);
      return {
        ...q,
        pattern: nc.pattern,
        ncTitle: nc.problem,
        ncLink: ncSlug || null,
        neetcode150: Boolean(nc.neetcode150),
        leetcodeOnly: false
      };
    }
    return {
      ...q,
      pattern: UNMATCHED_OVERRIDES[q.slug] ?? patternFromLcTopics(q.lcTopics) ?? GRIND_TOPIC_FALLBACK[q.topic] ?? "Arrays & Hashing",
      ncTitle: null,
      ncLink: null,
      neetcode150: false,
      leetcodeOnly: true
    };
  }
  function problemUrl(q) {
    return q.ncLink ? `https://neetcode.io/problems/${q.ncLink}` : `https://leetcode.com/problems/${q.slug}/`;
  }

  // src/platform/storage.js
  var hasGM = typeof GM_getValue === "function" && typeof GM_setValue === "function";
  var PREFIX = "neetgrind:";
  var storage = {
    get(key, fallback = null) {
      try {
        if (hasGM) return GM_getValue(key, fallback);
        const raw = localStorage.getItem(PREFIX + key);
        return raw == null ? fallback : JSON.parse(raw);
      } catch {
        return fallback;
      }
    },
    set(key, value) {
      try {
        if (hasGM) GM_setValue(key, value);
        else localStorage.setItem(PREFIX + key, JSON.stringify(value));
      } catch (err) {
        console.warn("[NeetGrind] storage write failed", key, err);
      }
    }
  };

  // src/data/neetcodeProgress.js
  function collect(value, out) {
    if (typeof value === "string") out.add(normalizeSlug(value));
    else if (Array.isArray(value)) value.forEach((v) => collect(v, out));
    else if (value && typeof value === "object") {
      for (const [k, v] of Object.entries(value)) {
        if (v === true) out.add(normalizeSlug(k));
        else collect(v, out);
      }
    }
  }
  function parseJson(raw) {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  function readCompletedSlugs(ls = localStorage) {
    const out = /* @__PURE__ */ new Set();
    const synced = parseJson(ls.getItem("synced-progress-cache"));
    if (synced?.completed) collect(synced.completed, out);
    const local = parseJson(ls.getItem("completed-problem-list"));
    if (local) collect(local, out);
    return out;
  }
  var FAILED = /^(wrong answer|time limit exceeded|memory limit exceeded|runtime error|compil(e|ation) error|output limit exceeded)$/i;
  function isAcceptedResponse(res) {
    let accepted = false;
    let failed = false;
    const walk = (v, depth) => {
      if (depth > 6 || failed) return;
      if (typeof v === "string") {
        if (/^accepted$/i.test(v.trim())) accepted = true;
        else if (FAILED.test(v.trim())) failed = true;
      } else if (Array.isArray(v)) v.forEach((x) => walk(x, depth + 1));
      else if (v && typeof v === "object") {
        for (const [k, x] of Object.entries(v)) {
          if (/^(is)?accepted$/i.test(k) && typeof x === "boolean") x ? accepted = true : failed = true;
          else walk(x, depth + 1);
        }
      }
    };
    walk(res, 0);
    return accepted && !failed;
  }
  var EMPTY = () => ({ server: null, marks: {}, accepted: {} });
  function applyCapture(state, cap, now = (/* @__PURE__ */ new Date()).toISOString()) {
    if (cap.status !== 200) return null;
    const req = parseJson(cap.body)?.data ?? {};
    const res = parseJson(cap.text)?.data;
    const next = { ...EMPTY(), ...state, marks: { ...state?.marks }, accepted: { ...state?.accepted } };
    if (/\/executeCodeFunctionHttp\b/.test(cap.url)) {
      if (!isAcceptedResponse(res)) return null;
      const ids = new Set([req.problemId, cap.path?.match(/^\/problems\/([^/]+)/)?.[1]].map(normalizeSlug).filter(Boolean));
      if (!ids.size) return null;
      for (const id of ids) next.accepted[id] = now;
      return next;
    }
    switch (req.functionId) {
      case "getCompletedProblems": {
        if (!res || typeof res !== "object") return null;
        const slugs = /* @__PURE__ */ new Set();
        collect(res, slugs);
        const marks = Object.fromEntries(Object.entries(next.marks).filter(([, m]) => !m.done));
        return { server: { at: now, slugs: [...slugs] }, marks, accepted: next.accepted };
      }
      case "markProblemComplete":
      case "markProblemIncomplete": {
        const slug = normalizeSlug(req.problem);
        if (!slug) return null;
        next.marks[slug] = { done: req.functionId === "markProblemComplete", at: now };
        return next;
      }
      default:
        return null;
    }
  }
  function isSolved(q, state, fallback) {
    const keys = [q.slug, q.ncLink].filter(Boolean).map(normalizeSlug);
    const acc = keys.map((k) => state?.accepted?.[k]).filter(Boolean).sort().at(-1);
    const mark = state?.marks?.[q.slug];
    if (acc && (!mark || acc >= mark.at)) return true;
    if (mark && (!state.server || mark.at > state.server.at)) return mark.done;
    const base = state?.server ? new Set(state.server.slugs) : fallback;
    return keys.some((k) => base.has(k));
  }
  var listeners = /* @__PURE__ */ new Set();
  var onProgress = (fn) => listeners.add(fn);
  function debugOn() {
    try {
      return localStorage.getItem("neetgrind:debug") === "1";
    } catch {
      return false;
    }
  }
  function debugLog(cap, next) {
    const req = parseJson(cap.body)?.data ?? {};
    const { rawCode, ...reqShown } = req;
    console.log(
      "[NeetGrind] captured",
      cap.url.replace(/^.*\//, ""),
      reqShown,
      `status ${cap.status}`,
      next ? "\u2192 progress updated" : "\u2192 ignored",
      "\nresponse:",
      cap.text.length > 4e3 ? `${cap.text.slice(0, 4e3)}\u2026 (${cap.text.length} chars)` : cap.text
    );
  }
  function recordCapture(cap) {
    const next = applyCapture(storage.get("ncProgress", null), cap);
    if (debugOn()) debugLog(cap, next);
    if (!next) return;
    storage.set("ncProgress", next);
    listeners.forEach((fn) => fn());
  }
  var lcDone = {
    all: () => storage.get("lcDone", {}),
    toggle(slug) {
      const all = storage.get("lcDone", {});
      if (all[slug]) delete all[slug];
      else all[slug] = (/* @__PURE__ */ new Date()).toISOString();
      storage.set("lcDone", all);
    }
  };
  function makeIsDone() {
    const state = storage.get("ncProgress", null);
    const ls = readCompletedSlugs();
    const lc = lcDone.all();
    return (q) => q.leetcodeOnly ? Boolean(lc[q.slug]) : isSolved(q, state, ls);
  }

  // src/platform/netHook.js
  var TAG = "neetgrind:net";
  function pageHook(tag) {
    if (window.__neetgrindNetHook) return;
    window.__neetgrindNetHook = true;
    const WATCH = /\/(callableFunctionHttp|executeCodeFunctionHttp)(?:[?#]|$)/;
    const post = (url, body, status, text) => {
      try {
        window.postMessage(
          { tag, url: String(url), body: typeof body === "string" ? body : null, status, text: String(text ?? ""), path: location.pathname },
          location.origin
        );
      } catch {
      }
    };
    const XHR = XMLHttpRequest.prototype;
    const open = XHR.open;
    const send = XHR.send;
    XHR.open = function(method, url) {
      this.__ngUrl = String(url);
      return open.apply(this, arguments);
    };
    XHR.send = function(body) {
      if (WATCH.test(this.__ngUrl ?? "")) {
        this.addEventListener("load", () => {
          const text = this.responseType === "" || this.responseType === "text" ? this.responseText : JSON.stringify(this.response);
          post(this.__ngUrl, body, this.status, text);
        });
      }
      return send.apply(this, arguments);
    };
    const fetch0 = window.fetch;
    window.fetch = function(input, init) {
      const url = typeof input === "string" ? input : input?.url ?? String(input);
      const res = fetch0.apply(this, arguments);
      if (WATCH.test(url)) {
        res.then((r) => r.clone().text().then((t) => post(url, init?.body, r.status, t))).catch(() => {
        });
      }
      return res;
    };
  }
  function installNetHook(onCapture) {
    const el = document.createElement("script");
    el.textContent = `(${pageHook})(${JSON.stringify(TAG)});`;
    (document.head || document.documentElement).appendChild(el);
    el.remove();
    window.addEventListener("message", (e) => {
      if (e.origin !== location.origin || e.data?.tag !== TAG) return;
      onCapture(e.data);
    });
  }

  // src/core/daily.js
  var DAY_MS = 864e5;
  var utcDay = (date) => Math.floor(new Date(date).getTime() / DAY_MS);
  function todayUtcISO(now = /* @__PURE__ */ new Date()) {
    return new Date(utcDay(now) * DAY_MS).toISOString().slice(0, 10);
  }
  function planPosition(plan, now = /* @__PURE__ */ new Date()) {
    const weeks = plan.settings.weeks;
    const dayIndex = utcDay(now) - utcDay(plan.startDate);
    const totalDays = weeks * 7;
    if (dayIndex < 0) return { state: "not-started", dayIndex, week: 1, weeks, daysLeftInWeek: 7, daysUntilStart: -dayIndex };
    if (dayIndex >= totalDays) return { state: "overtime", dayIndex, week: weeks, weeks, daysLeftInWeek: 1 };
    const week = Math.floor(dayIndex / 7) + 1;
    return { state: "active", dayIndex, week, weeks, dayOfWeek: dayIndex % 7 + 1, daysLeftInWeek: 7 - dayIndex % 7 };
  }
  function backlog(questions, week, isDone) {
    return questions.filter((q) => q.week <= week && !isDone(q));
  }
  function dailyTarget(plan, isDone, now = /* @__PURE__ */ new Date()) {
    const pos = planPosition(plan, now);
    if (pos.state === "not-started") return { pos, slugs: [] };
    const pending = backlog(plan.questions, pos.week, isDone);
    const count = Math.ceil(pending.length / pos.daysLeftInWeek);
    return { pos, slugs: pending.slice(0, count).map((q) => q.slug) };
  }
  function paceSummary(plan, isDone, now = /* @__PURE__ */ new Date()) {
    const pos = planPosition(plan, now);
    const done = plan.questions.filter(isDone).length;
    const overdue = plan.questions.filter((q) => q.week < pos.week && !isDone(q)).length;
    const thisWeek = plan.questions.filter((q) => q.week === pos.week);
    return {
      pos,
      done,
      total: plan.questions.length,
      overdue: pos.state === "not-started" ? 0 : overdue,
      weekDone: thisWeek.filter(isDone).length,
      weekTotal: thisWeek.length
    };
  }

  // src/core/roadmap.js
  var NC_NODES = [
    { id: 1, label: "Arrays & Hashing", parents: [] },
    { id: 2, label: "Two Pointers", parents: [1] },
    { id: 3, label: "Stack", parents: [1] },
    { id: 4, label: "Sliding Window", parents: [2] },
    { id: 5, label: "Linked List", parents: [2] },
    { id: 6, label: "Binary Search", parents: [2] },
    { id: 7, label: "Trees", parents: [5, 6] },
    { id: 8, label: "Tries", parents: [7] },
    { id: 9, label: "Heap / Priority Queue", parents: [7] },
    { id: 10, label: "Backtracking", parents: [7] },
    { id: 11, label: "Graphs", parents: [10] },
    { id: 12, label: "1-D Dynamic Programming", parents: [10] },
    { id: 13, label: "Intervals", parents: [9] },
    { id: 16, label: "Greedy", parents: [9] },
    { id: 17, label: "Advanced Graphs", parents: [9, 11] },
    { id: 14, label: "2-D Dynamic Programming", parents: [11, 12] },
    { id: 15, label: "Bit Manipulation", parents: [12] },
    { id: 18, label: "Math & Geometry", parents: [14, 15] }
  ];
  var NC_POSITIONS = {
    "Arrays & Hashing": { x: 0, y: -560 },
    "Two Pointers": { x: -151, y: -358 },
    Stack: { x: 92, y: -383 },
    "Binary Search": { x: -375, y: -153 },
    "Sliding Window": { x: -118, y: -152 },
    "Linked List": { x: 155, y: -144 },
    Trees: { x: -128, y: 47 },
    Tries: { x: -355, y: 243 },
    "Heap / Priority Queue": { x: -203, y: 393 },
    Backtracking: { x: 96, y: 235 },
    Graphs: { x: 85, y: 455 },
    "1-D Dynamic Programming": { x: 372, y: 435 },
    Intervals: { x: -626, y: 612 },
    Greedy: { x: -346, y: 691 },
    "Advanced Graphs": { x: -101, y: 650 },
    "2-D Dynamic Programming": { x: 194, y: 691 },
    "Bit Manipulation": { x: 490, y: 683 },
    "Math & Geometry": { x: 388, y: 901 }
  };
  var NODE_BY_ID = new Map(NC_NODES.map((n) => [n.id, n]));
  var NODE_BY_LABEL = new Map(NC_NODES.map((n) => [n.label, n]));
  function topoOrder(nodes = NC_NODES) {
    const indegree = new Map(nodes.map((n) => [n.id, n.parents.length]));
    const children = new Map(nodes.map((n) => [n.id, []]));
    for (const n of nodes) for (const p of n.parents) children.get(p).push(n.id);
    const ready = nodes.filter((n) => n.parents.length === 0).map((n) => n.id);
    const order = [];
    while (ready.length) {
      ready.sort((a, b) => a - b);
      const id = ready.shift();
      order.push(id);
      for (const c of children.get(id)) {
        indegree.set(c, indegree.get(c) - 1);
        if (indegree.get(c) === 0) ready.push(c);
      }
    }
    return order.map((id) => NODE_BY_ID.get(id).label);
  }
  var TOPO_LABELS = topoOrder();
  var TOPO_RANK = Object.fromEntries(TOPO_LABELS.map((label, i) => [label, i]));
  function ancestorsOf(label) {
    const out = /* @__PURE__ */ new Set();
    const stack = [...NODE_BY_LABEL.get(label)?.parents ?? []];
    while (stack.length) {
      const id = stack.pop();
      const node = NODE_BY_ID.get(id);
      if (!node || out.has(node.label)) continue;
      out.add(node.label);
      stack.push(...node.parents);
    }
    return out;
  }
  function visibleGraph(visible) {
    const keep = new Set(visible);
    const nearestVisible = (node) => {
      const out = /* @__PURE__ */ new Set();
      const stack = [...node.parents];
      const seen = /* @__PURE__ */ new Set();
      while (stack.length) {
        const id = stack.pop();
        if (seen.has(id)) continue;
        seen.add(id);
        const p = NODE_BY_ID.get(id);
        if (keep.has(p.label)) out.add(p.label);
        else stack.push(...p.parents);
      }
      return [...out];
    };
    return NC_NODES.filter((n) => keep.has(n.label)).map((n) => {
      const parents = nearestVisible(n);
      return {
        label: n.label,
        parents: parents.filter((p) => !parents.some((q) => q !== p && ancestorsOf(q).has(p)))
      };
    });
  }

  // src/core/recommended.js
  var COST_FACTOR = 1.96;
  var DIFF_RANK = { Easy: 0, Medium: 1, Hard: 2 };
  var cost = (q) => COST_FACTOR * q.duration;
  var CONFUSABLE_GROUPS = [
    ["Two Pointers", "Sliding Window", "Binary Search"],
    ["Arrays & Hashing", "Two Pointers", "Sliding Window"],
    ["Stack", "Linked List"],
    ["Trees", "Graphs", "Backtracking", "Tries"],
    ["Graphs", "Advanced Graphs"],
    ["Greedy", "1-D Dynamic Programming", "2-D Dynamic Programming"],
    ["Heap / Priority Queue", "Intervals", "Greedy"],
    ["Bit Manipulation", "Math & Geometry"]
  ];
  function confusableWith(label) {
    const out = /* @__PURE__ */ new Set();
    for (const g of CONFUSABLE_GROUPS) if (g.includes(label)) g.forEach((l) => l !== label && out.add(l));
    return out;
  }
  var FINAL_SHARE = 0.2;
  var FINAL_MAX_SHARE = 0.35;
  var MAX_REVIEWS_PER_NEW = 3;
  var SPACING_WEEKS = 0.4;
  var RECENT_WINDOW = 3;
  function orderRecommended(questions, { weeks, hours }) {
    const weekCost = 60 * hours;
    const total = questions.reduce((t, q) => t + cost(q), 0);
    const finalCost = weeks >= 2 ? Math.min(Math.max(weekCost, total * FINAL_SHARE), total * FINAL_MAX_SHARE) : 0;
    const introSize = weeks >= 10 ? 3 : 2;
    const byTopic = /* @__PURE__ */ new Map();
    for (const q of questions) {
      if (!byTopic.has(q.pattern)) byTopic.set(q.pattern, []);
      byTopic.get(q.pattern).push(q);
    }
    for (const list of byTopic.values()) {
      list.sort((a, b) => DIFF_RANK[a.difficulty] - DIFF_RANK[b.difficulty] || a.priority - b.priority);
    }
    const topics = [...byTopic.keys()].sort((a, b) => (TOPO_RANK[a] ?? 99) - (TOPO_RANK[b] ?? 99));
    const intro = /* @__PURE__ */ new Map();
    const pool = /* @__PURE__ */ new Map();
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
    const nextFrom = (t) => {
      const list = pool.get(t);
      if (!list.length) return null;
      const st = state.get(t);
      return st.reviews === 0 ? list.find((q) => q.difficulty !== "Hard") ?? null : list[0];
    };
    const pickReview = ({ near, readyOnly, allowHardFallback }) => {
      let candidates = topics.filter((t2) => {
        const st = state.get(t2);
        if (st.introducedAt === null || !pool.get(t2).length) return false;
        if (readyOnly && pos - st.introducedAt < SPACING_WEEKS * weekCost) return false;
        return nextFrom(t2) || allowHardFallback;
      });
      if (!candidates.length) return null;
      const recent = recentTopics();
      const fresh = candidates.filter((t2) => !recent.has(t2));
      if (fresh.length) candidates = fresh;
      const near_ = near ? confusableWith(near) : /* @__PURE__ */ new Set();
      const due = (t2) => (pos - state.get(t2).lastAt + weekCost * 0.25) * pool.get(t2).length * (near_.has(t2) ? 1.5 : 1);
      candidates.sort((a, b) => due(b) - due(a) || TOPO_RANK[a] - TOPO_RANK[b]);
      const t = candidates[0];
      return nextFrom(t) ?? pool.get(t)[0];
    };
    const take = (q) => {
      const list = pool.get(q.pattern);
      list.splice(list.indexOf(q), 1);
      poolCost -= cost(q);
    };
    const introTotal = topics.reduce((sum, t) => sum + intro.get(t).reduce((s2, q) => s2 + cost(q), 0), 0);
    const mainReviewBudget = Math.max(0, poolCost - finalCost);
    let introSoFar = 0;
    let reviewedSoFar = 0;
    for (const t of topics) {
      for (const q of intro.get(t)) {
        emit(q, false);
        introSoFar += cost(q);
      }
      state.get(t).introducedAt = pos;
      if (pos < weekCost) continue;
      const allowed = mainReviewBudget * introSoFar / introTotal;
      for (let i = 0; i < MAX_REVIEWS_PER_NEW * intro.get(t).length; i++) {
        const q = pickReview({ near: t, readyOnly: true, allowHardFallback: false });
        if (!q || reviewedSoFar + cost(q) / 2 > allowed || poolCost - cost(q) < finalCost) break;
        take(q);
        emit(q, true);
        reviewedSoFar += cost(q);
      }
    }
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

  // src/core/scheduler.js
  var COST_FACTOR2 = 1.96;
  var DIFFICULTIES = ["Easy", "Medium", "Hard"];
  var DIFFICULTY_RANK = { Easy: 0, Medium: 1, Hard: 2 };
  var GRIND_TOPIC_RANK = {
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
    math: 22
  };
  var ORDERS = ["recommended", "difficulty", "topics", "all_rounded", "roadmap"];
  var ORDER_LABELS = {
    recommended: "Recommended (spaced + mixed)",
    difficulty: "Difficulty (Grind 75 default)",
    topics: "Topics (Grind 75)",
    all_rounded: "All rounded (priority)",
    roadmap: "NeetCode roadmap"
  };
  var GROUPINGS = ["weeks", "topics", "difficulty", "none"];
  var GROUPING_LABELS = { weeks: "Weeks", topics: "Topics", difficulty: "Difficulty", none: "None" };
  var DEFAULT_COMPANY = { names: [], window: "6mo", limit: "count", count: 25, share: 50, picked: [] };
  var COMPANY_LIMITS = { count: "Top N per company", share: "Share of time" };
  var EST_DURATION = { Easy: 20, Medium: 30, Hard: 40 };
  var DEFAULT_SETTINGS = {
    weeks: 8,
    hours: 8,
    difficulty: [...DIFFICULTIES],
    topics: null,
    // null = all topics (Grind 75 topics)
    excludedTopics: [],
    // NeetCode roadmap topics to leave out
    mode: "preferences",
    order: "recommended",
    grouping: "weeks",
    company: DEFAULT_COMPANY
  };
  var costOf = (q) => COST_FACTOR2 * q.duration;
  function parseGrindParams(search) {
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
      grouping: GROUPINGS.includes(p.get("grouping")) ? p.get("grouping") : "weeks"
    };
  }
  function selectQuestions(all, settings, budget = 60 * settings.hours * settings.weeks) {
    const excluded = new Set(settings.excludedTopics ?? []);
    const byPriority = [...all].sort((a, b) => a.priority - b.priority).filter((q) => !excluded.has(q.pattern));
    if (settings.mode === "all") return byPriority;
    const diffs = new Set(settings.difficulty ?? DIFFICULTIES);
    const topics = settings.topics ? new Set(settings.topics) : null;
    const picked = [];
    for (const q of byPriority) {
      if (!diffs.has(q.difficulty) || topics && !topics.has(q.topic)) continue;
      budget -= costOf(q);
      if (budget < 0) break;
      picked.push(q);
    }
    return picked;
  }
  function orderQuestions(questions, order, settings = DEFAULT_SETTINGS) {
    if (order === "recommended") return orderRecommended(questions, settings);
    const cmp = {
      all_rounded: (a, b) => a.priority - b.priority,
      difficulty: (a, b) => DIFFICULTY_RANK[a.difficulty] - DIFFICULTY_RANK[b.difficulty],
      topics: (a, b) => (GRIND_TOPIC_RANK[a.topic] ?? 99) - (GRIND_TOPIC_RANK[b.topic] ?? 99),
      roadmap: (a, b) => (TOPO_RANK[a.pattern] ?? 99) - (TOPO_RANK[b.pattern] ?? 99) || DIFFICULTY_RANK[a.difficulty] - DIFFICULTY_RANK[b.difficulty] || a.priority - b.priority
    }[order];
    return cmp ? [...questions].sort(cmp) : [...questions];
  }
  function assignWeeks(questions, { weeks, hours }) {
    const perWeek = 60 * hours;
    let week = 1;
    let used = 0;
    return questions.map((q) => {
      const cost2 = costOf(q);
      if (week < weeks && used + cost2 > perWeek) {
        week += 1;
        used = 0;
      }
      used += cost2;
      return { ...q, week };
    });
  }
  function totalHours(questions) {
    return Math.ceil(Math.ceil(questions.reduce((sum, q) => sum + costOf(q), 0)) / 60);
  }
  function companySettings(settings) {
    return { ...DEFAULT_COMPANY, ...settings?.company };
  }
  function withCompanies(grindMapped, companyPool, ncIndex) {
    const tags = new Map(companyPool.map((r) => [r.slug, r.tags]));
    const grind = grindMapped.map((q) => tags.has(q.slug) ? { ...q, companies: tags.get(q.slug) } : q);
    const inGrind = new Set(grindMapped.map((q) => q.slug));
    const extra = companyPool.filter((r) => !inGrind.has(r.slug)).map(
      (r, i) => mapQuestion(
        {
          slug: r.slug,
          title: r.title,
          url: `https://leetcode.com/problems/${r.slug}/`,
          duration: EST_DURATION[r.difficulty] ?? 30,
          difficulty: r.difficulty,
          topic: null,
          priority: 1e3 + i,
          premium: false,
          lcTopics: r.lcTopics,
          companies: r.tags
        },
        ncIndex
      )
    );
    return { grind, extra };
  }
  var bestFrequency = (q) => Math.max(0, ...(q.companies ?? []).map((t) => t.frequency));
  var frequencyFor = (q, company) => q.companies?.find((t) => t.company === company)?.frequency ?? -1;
  function selectCompanyQuestions(candidates, settings) {
    const co = companySettings(settings);
    if (!co.names.length && !co.picked.length) return [];
    const budget = 60 * settings.hours * settings.weeks;
    const bySlug = new Map(candidates.map((q) => [q.slug, q]));
    const picked = co.picked.map((s2) => bySlug.get(s2)).filter(Boolean);
    const pickedSet = new Set(picked.map((q) => q.slug));
    const diffs = new Set(settings.difficulty ?? DIFFICULTIES);
    const excluded = new Set(settings.excludedTopics ?? []);
    const eligible = candidates.filter(
      (q) => !pickedSet.has(q.slug) && diffs.has(q.difficulty) && !excluded.has(q.pattern) && q.companies?.length
    );
    const ranked = [];
    const seen = /* @__PURE__ */ new Set();
    const add = (q) => !seen.has(q.slug) && (seen.add(q.slug), ranked.push(q));
    const perCompany = co.names.map(
      (name) => eligible.filter((q) => frequencyFor(q, name) >= 0).sort((a, b) => frequencyFor(b, name) - frequencyFor(a, name))
    );
    if (co.limit === "share") {
      let left2 = budget * Math.min(100, Math.max(0, co.share)) / 100 - picked.reduce((t, q) => t + costOf(q), 0);
      const cursors = perCompany.map(() => 0);
      let progress = true;
      while (progress && left2 > 0) {
        progress = false;
        perCompany.forEach((list, i) => {
          while (cursors[i] < list.length && seen.has(list[cursors[i]].slug)) cursors[i]++;
          const q = list[cursors[i]];
          if (!q || costOf(q) > left2) return;
          add(q);
          left2 -= costOf(q);
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
  function buildSchedule(pool, settings, ncIndex, slugs = null, companyPool = []) {
    const { grind: mapped, extra } = withCompanies(
      pool.map((q) => mapQuestion(q, ncIndex)),
      companyPool ?? [],
      ncIndex
    );
    const company = selectCompanyQuestions([...mapped, ...extra], settings);
    const taken = new Set(company.map((q) => q.slug));
    let picked;
    if (slugs) {
      const excluded = new Set(settings.excludedTopics ?? []);
      const bySlug = new Map(mapped.map((q) => [q.slug, q]));
      picked = slugs.map((s2) => bySlug.get(s2)).filter((q) => q && !excluded.has(q.pattern) && !taken.has(q.slug));
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
      missing: slugs ? slugs.filter((s2) => !pool.some((q) => q.slug === s2)).length : 0,
      companyCount: questions.filter((q) => q.companies?.length).length
    };
  }
  function groupQuestions(questions, grouping) {
    const groups = /* @__PURE__ */ new Map();
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

  // src/platform/http.js
  var hasGMXhr = typeof GM_xmlhttpRequest === "function";
  function gmGet(url) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "GET",
        url,
        onload: (res) => res.status >= 200 && res.status < 300 ? resolve(res.responseText) : reject(new Error(`${res.status} ${url}`)),
        onerror: () => reject(new Error(`Network error: ${url}`)),
        ontimeout: () => reject(new Error(`Timed out: ${url}`)),
        timeout: 3e4
      });
    });
  }
  async function fetchText(url) {
    const sameOrigin = typeof location !== "undefined" && new URL(url, location.href).origin === location.origin;
    if (!sameOrigin && hasGMXhr) return gmGet(url);
    const res = await fetch(url, { credentials: "omit" });
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    return res.text();
  }
  async function fetchJson(url) {
    return JSON.parse(await fetchText(url));
  }

  // src/data/cache.js
  async function cached(name, key, load, { force = false } = {}) {
    const hit = storage.get(name, null);
    if (!force && hit && hit.key === key) return hit.value;
    const value = await load();
    storage.set(name, { key, value, fetchedAt: (/* @__PURE__ */ new Date()).toISOString() });
    return value;
  }

  // src/data/grindSource.js
  var GRIND_ORIGIN = "https://www.techinterviewhandbook.org";
  var GRIND_PAGE = `${GRIND_ORIGIN}/grind75`;
  var SIGNATURE = '"slug":"two-sum"';
  function decodeJsString(body) {
    return body.replace(/\\(u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|[\s\S])/g, (_, esc) => {
      if (esc[0] === "u" && esc[1] === "{") return String.fromCodePoint(parseInt(esc.slice(2, -1), 16));
      if (esc[0] === "u" && esc.length === 5) return String.fromCharCode(parseInt(esc.slice(1), 16));
      if (esc[0] === "x" && esc.length === 3) return String.fromCharCode(parseInt(esc.slice(1), 16));
      return { n: "\n", r: "\r", t: "	", b: "\b", f: "\f", v: "\v", 0: "\0" }[esc] ?? esc;
    });
  }
  function extractGrindQuestions(jsText) {
    const at = jsText.indexOf(SIGNATURE);
    if (at < 0) return null;
    const open = jsText.lastIndexOf("JSON.parse('", at);
    if (open < 0) return null;
    const start2 = open + "JSON.parse('".length;
    let i = start2;
    while (i < jsText.length) {
      if (jsText[i] === "\\") i += 2;
      else if (jsText[i] === "'") break;
      else i += 1;
    }
    const data = JSON.parse(decodeJsString(jsText.slice(start2, i)));
    if (!Array.isArray(data) || !data.every((q) => q.slug && q.difficulty && Number.isFinite(q.duration))) {
      throw new Error("Grind 75 dataset has an unexpected shape");
    }
    return data;
  }
  function chunkUrlsFromHtml(html, base = GRIND_PAGE) {
    return [...html.matchAll(/src="([^"]*\/_next\/static\/chunks\/[^"]+\.js)"/g)].map((m) => new URL(m[1], base).href);
  }
  function chunkUrlsFromDocument(doc = document) {
    const fromTags = [...doc.querySelectorAll("script[src]")].map((s2) => s2.src);
    const fromPerf = performance.getEntriesByType("resource").map((e) => e.name);
    return [.../* @__PURE__ */ new Set([...fromTags, ...fromPerf])].filter((u) => /\/grind75\/_next\/static\/chunks\/.+\.js/.test(u));
  }
  async function findDataset(urls) {
    for (const url of urls) {
      const text = await fetchText(url);
      if (text.includes(SIGNATURE)) return { url, questions: extractGrindQuestions(text) };
    }
    throw new Error("Couldn't find the Grind 75 question list in the site's scripts");
  }
  async function loadGrindQuestions({ urls, force = false } = {}) {
    const candidates = urls ?? chunkUrlsFromHtml(await fetchText(GRIND_PAGE));
    const key = candidates.map((u) => u.split("/").pop()).sort().join(",");
    const found = await cached("grind:data", key, () => findDataset(candidates), { force });
    return found.questions;
  }

  // src/data/planStore.js
  var POOL_FIELDS = ["slug", "title", "url", "duration", "difficulty", "topic", "priority", "premium"];
  function createPlan(allGrind, settings, startDate, source, { companyPool = [], companyVersion = null } = {}) {
    return {
      version: 2,
      id: `${Date.now()}`,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
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
        company: settings.company ?? null
      },
      pool: allGrind.map((q) => Object.fromEntries(POOL_FIELDS.map((f) => [f, q[f]]))),
      companyPool,
      companyVersion
    };
  }
  var planStore = {
    load: () => storage.get("plan", null),
    save: (plan) => storage.set("plan", plan),
    update(patch) {
      const plan = { ...planStore.load(), ...patch };
      planStore.save(plan);
      return plan;
    }
  };

  // src/ui/dom.js
  var SVG_NS = "http://www.w3.org/2000/svg";
  function apply(el, props) {
    for (const [key, value] of Object.entries(props ?? {})) {
      if (value == null || value === false) continue;
      if (key === "class") el.setAttribute("class", value);
      else if (key === "style" && typeof value === "object") Object.assign(el.style, value);
      else if (key.startsWith("on") && typeof value === "function") el.addEventListener(key.slice(2), value);
      else if (key in el && !(el instanceof SVGElement)) el[key] = value;
      else el.setAttribute(key, value === true ? "" : value);
    }
  }
  function append(el, children) {
    for (const child of children.flat(Infinity)) {
      if (child == null || child === false) continue;
      el.append(child instanceof Node ? child : document.createTextNode(String(child)));
    }
  }
  function h(tag, props, ...children) {
    const el = document.createElement(tag);
    apply(el, props);
    append(el, children);
    return el;
  }
  function s(tag, props, ...children) {
    const el = document.createElementNS(SVG_NS, tag);
    apply(el, props);
    append(el, children);
    return el;
  }
  function injectStyle(id, css) {
    if (document.getElementById(id)) return;
    document.head.append(h("style", { id }, css));
  }
  var DIFF_CLASS = { Easy: "ng-easy", Medium: "ng-medium", Hard: "ng-hard" };
  function formatDate(iso) {
    return (/* @__PURE__ */ new Date(`${iso}T00:00:00Z`)).toLocaleDateString(void 0, { month: "short", day: "numeric", timeZone: "UTC" });
  }
  function fill(el, ...children) {
    el.replaceChildren();
    append(el, children);
    return el;
  }

  // src/ui/styles.css
  var styles_default = `/* NeetGrind. On neetcode.io the tokens pick up NeetCode's own CSS variables. */
.ng-root {
  --ng-bg: var(--background, #ffffff);
  --ng-fg: var(--foreground, #111827);
  --ng-card: var(--card, #ffffff);
  --ng-border: var(--border, #e5e7eb);
  --ng-muted: var(--muted, #f3f4f6);
  --ng-muted-fg: var(--muted-foreground, #6b7280);
  --ng-primary: var(--primary, #4f46e5);
  --ng-primary-fg: #ffffff;
  --ng-done: oklch(0.696 0.17 162.48);
  --ng-easy: #15803d;
  --ng-medium: #a16207;
  --ng-hard: #b91c1c;
  --ng-warn: #b45309;
  --ng-node: color-mix(in oklab, var(--ng-primary) 18%, var(--ng-card));
  --ng-edge: color-mix(in oklab, var(--ng-fg) 30%, transparent);
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: var(--ng-fg);
  box-sizing: border-box;
}
.ng-root[data-theme="dark"] {
  --ng-bg: var(--background, #1b1a1f);
  --ng-fg: var(--foreground, #f5f5f5);
  --ng-card: var(--card, #1f1f1f);
  --ng-border: var(--border, #3f3f3f);
  --ng-muted: var(--muted, #2b2b2b);
  --ng-muted-fg: var(--muted-foreground, #c4c4c4);
  --ng-primary: var(--primary, #7c7cf0);
  --ng-easy: #4ade80;
  --ng-medium: #facc15;
  --ng-hard: #f87171;
  --ng-warn: #fbbf24;
  --ng-node: color-mix(in oklab, var(--ng-primary) 30%, var(--ng-card));
}
.ng-root *, .ng-root *::before, .ng-root *::after { box-sizing: border-box; }
.ng-root [hidden], .ng-root[hidden] { display: none !important; }

/* ---------- shared controls ---------- */
.ng-muted { color: var(--ng-muted-fg); }
.ng-small { font-size: 12px; }
.ng-row { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.ng-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  min-height: 32px; padding: 0 12px; border-radius: 8px;
  border: 1px solid var(--ng-border); background: var(--ng-card); color: var(--ng-fg);
  font: 500 13px/1 inherit; cursor: pointer; text-decoration: none; white-space: nowrap;
}
.ng-btn:hover { background: var(--ng-muted); }
.ng-btn:disabled { opacity: 0.5; cursor: default; }
.ng-btn-primary { background: var(--ng-primary); border-color: var(--ng-primary); color: var(--ng-primary-fg); }
.ng-btn-primary:hover { background: color-mix(in oklab, var(--ng-primary) 85%, black); }
.ng-btn-ghost { background: transparent; border-color: transparent; }
.ng-icon-btn { width: 32px; padding: 0; }
.ng-btn:focus-visible, .ng-seg:focus-visible, .ng-q-title:focus-visible, .ng-zoom-btn:focus-visible, .ng-node:focus-visible {
  outline: 2px solid var(--ng-primary); outline-offset: 2px;
}
.ng-input {
  width: 100%; min-height: 32px; padding: 4px 8px; border-radius: 8px;
  border: 1px solid var(--ng-border); background: var(--ng-bg); color: var(--ng-fg); font: 13px inherit;
  color-scheme: light dark;
}
.ng-field { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--ng-muted-fg); border: 0; padding: 0; margin: 0; }
.ng-field legend { padding: 0; margin-bottom: 4px; }
.ng-check-label { display: inline-flex; gap: 6px; align-items: center; color: var(--ng-fg); font-size: 13px; }
.ng-status { font-size: 12px; min-height: 16px; }
.ng-status a { color: var(--ng-primary); }
.ng-error { color: var(--ng-hard); font-size: 12px; }
.ng-warn, .ng-warn-text { color: var(--ng-warn); }
.ng-warn { font-size: 12px; }

.ng-toggle { display: inline-flex; padding: 3px; gap: 2px; border-radius: 10px; background: var(--ng-muted); border: 1px solid var(--ng-border); }
.ng-seg {
  border: 0; background: transparent; color: var(--ng-muted-fg); font: 500 13px/1 inherit;
  padding: 7px 12px; border-radius: 7px; cursor: pointer;
}
.ng-seg[aria-pressed="true"] { background: var(--ng-card); color: var(--ng-fg); box-shadow: 0 1px 3px rgb(0 0 0 / 0.25); }

/* ---------- Grind 75 panel ---------- */
.ng-grind-panel {
  position: fixed; right: 16px; bottom: 16px; z-index: 2147483000; width: 300px; max-width: calc(100vw - 32px);
  background: var(--ng-card); border: 1px solid var(--ng-border); border-radius: 12px;
  box-shadow: 0 10px 30px rgb(0 0 0 / 0.15); font-size: 13px;
}
.ng-grind-head { display: flex; align-items: center; gap: 8px; padding: 8px 8px 8px 14px; border-bottom: 1px solid var(--ng-border); }
.ng-grind-head .ng-muted { flex: 1; font-size: 12px; }
.ng-grind-content { display: flex; flex-direction: column; gap: 10px; padding: 12px 14px 14px; }
.ng-grind-body { display: flex; flex-direction: column; gap: 2px; }
.ng-big { font-size: 18px; font-weight: 600; margin-top: 4px; }
.ng-big .ng-muted { font-size: 13px; font-weight: 400; }
.ng-collapsed .ng-grind-content { display: none; }
.ng-collapsed .ng-grind-head { border-bottom: 0; }

/* ---------- NeetCode roadmap ---------- */
.ng-toggle:not(.ng-toggle-inline) { position: absolute; top: 12px; left: 12px; z-index: 5; }
.ng-graph-host { position: absolute; inset: 0; z-index: 1; background: transparent; overflow: hidden; }
.ng-graph { display: block; width: 100%; height: 100%; touch-action: none; cursor: grab; user-select: none; }
.ng-graph:active { cursor: grabbing; }
.ng-graph-empty {
  position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); max-width: 320px; text-align: center;
  padding: 16px; border-radius: 12px; background: var(--ng-card); border: 1px solid var(--ng-border);
}
.ng-edge { fill: none; stroke: var(--ng-edge); stroke-width: 5; transition: stroke 0.2s; }
.ng-edge.ng-lit { stroke: var(--ng-primary); }
.ng-node { cursor: pointer; }
.ng-node-card { fill: var(--ng-node); stroke: color-mix(in oklab, var(--ng-primary) 60%, transparent); stroke-width: 1.5; transition: fill 0.2s; }
.ng-node:hover .ng-node-card, .ng-node.ng-lit .ng-node-card { fill: color-mix(in oklab, var(--ng-primary) 45%, var(--ng-card)); }
.ng-node-label { fill: var(--ng-fg); font-size: 26px; font-weight: 600; }
.ng-node-meta { fill: var(--ng-muted-fg); font-size: 20px; font-variant-numeric: tabular-nums; }
.ng-node-track { fill: color-mix(in oklab, var(--ng-fg) 85%, transparent); }
.ng-node-fill { fill: var(--ng-done); }
.ng-node-empty { cursor: default; opacity: 0.35; }
.ng-node-empty .ng-node-track, .ng-node-empty .ng-node-fill { display: none; }
.ng-node-today .ng-node-card { stroke: var(--ng-primary); stroke-width: 5; }
.ng-node-complete .ng-node-card { stroke: var(--ng-done); stroke-width: 4; }
.ng-node-selected .ng-node-card { stroke: var(--ng-fg); stroke-width: 5; }

.ng-zoom {
  position: absolute; left: 16px; bottom: 16px; display: flex; flex-direction: column;
  border-radius: 10px; overflow: hidden; border: 1px solid var(--ng-border); background: var(--ng-card);
}
.ng-zoom-btn { width: 36px; height: 36px; border: 0; background: transparent; color: var(--ng-fg); font-size: 16px; cursor: pointer; }
.ng-zoom-btn + .ng-zoom-btn { border-top: 1px solid var(--ng-border); }
.ng-zoom-btn:hover { background: var(--ng-muted); }

.ng-plan-card { display: flex; flex-direction: column; gap: 8px; padding: 16px; font-size: 13px; flex: none; }
.ng-graph-host .ng-plan-card { position: absolute; top: 60px; right: 12px; width: 280px; background: var(--ng-card); border: 1px solid var(--ng-border); border-radius: 12px; }
.ng-card-head { display: flex; justify-content: space-between; align-items: baseline; }
.ng-card-title { font-size: 15px; font-weight: 600; }
.ng-plan-card p { margin: 0; line-height: 1.4; }
.ng-progress { height: 6px; border-radius: 3px; background: var(--ng-muted); overflow: hidden; }
.ng-progress-fill { height: 100%; background: var(--ng-done); }
.ng-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--ng-muted-fg); margin-bottom: 2px; }
.ng-today { display: flex; flex-direction: column; border-top: 1px solid var(--ng-border); padding-top: 8px; }

.ng-q { display: flex; align-items: center; gap: 8px; min-height: 32px; padding: 2px 0; font-size: 13px; }
.ng-q-title { flex: 1; min-width: 0; color: var(--ng-fg); text-decoration: none; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ng-q-title:hover { text-decoration: underline; color: var(--ng-primary); }
.ng-q-done .ng-q-title { color: var(--ng-muted-fg); }
.ng-dot {
  flex: none; width: 16px; height: 16px; border-radius: 50%; border: 1.5px solid var(--ng-border);
  display: inline-flex; align-items: center; justify-content: center; font-size: 10px; color: var(--ng-bg);
}
.ng-dot-done { background: var(--ng-done); border-color: var(--ng-done); }
.ng-check { flex: none; width: 16px; height: 16px; margin: 0; accent-color: var(--ng-done); }
.ng-diff { flex: none; font-size: 12px; font-weight: 500; min-width: 48px; text-align: right; }
.ng-easy { color: var(--ng-easy); }
.ng-medium { color: var(--ng-medium); }
.ng-hard { color: var(--ng-hard); }
.ng-tag { flex: none; font-size: 11px; padding: 2px 6px; border-radius: 6px; background: var(--ng-muted); color: var(--ng-muted-fg); max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ng-tag-lc { color: var(--ng-warn); }
.ng-tag-co { display: inline-flex; align-items: center; gap: 4px; max-width: 140px; color: var(--ng-primary); background: color-mix(in oklab, var(--ng-primary) 14%, transparent); }
.ng-co-name { overflow: hidden; text-overflow: ellipsis; }
.ng-co-icon { flex: none; vertical-align: -1px; }
.ng-co-line { display: flex; flex-direction: column; gap: 2px; }
.ng-co-update { color: var(--ng-warn); }
.ng-co-chips { flex-wrap: wrap; gap: 6px; }
.ng-chip { display: inline-flex; align-items: center; gap: 4px; padding: 2px 4px 2px 8px; border-radius: 999px; font-size: 12px; color: var(--ng-fg); background: var(--ng-muted); }
.ng-chip-x { border: 0; background: none; color: var(--ng-muted-fg); cursor: pointer; font-size: 11px; padding: 2px 4px; }
.ng-chip-x:hover { color: var(--ng-hard); }
.ng-pick { cursor: pointer; border-bottom: 1px solid var(--ng-border); }
.ng-freq { flex: none; width: 36px; height: 4px; border-radius: 2px; background: var(--ng-muted); overflow: hidden; }
.ng-freq i { display: block; height: 100%; background: var(--ng-primary); }

.ng-drawer {
  position: fixed; top: 0; right: 0; bottom: 0; z-index: 1002; width: min(480px, 100vw);
  background: var(--ng-card); border-left: 1px solid var(--ng-border); box-shadow: -12px 0 32px rgb(0 0 0 / 0.3);
  transform: translateX(100%); transition: transform 0.2s ease; overflow-y: auto; padding: 16px 20px 32px;
  display: flex; flex-direction: column; gap: 12px; visibility: hidden;
}
.ng-drawer.ng-open { transform: none; visibility: visible; }
.ng-drawer-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; }
.ng-groups { display: flex; flex-direction: column; gap: 4px; }
.ng-group { border-bottom: 1px solid var(--ng-border); padding: 4px 0; }
.ng-group summary { display: flex; justify-content: space-between; align-items: center; cursor: pointer; padding: 8px 0; font-weight: 600; font-size: 14px; list-style: none; }
.ng-group summary::-webkit-details-marker { display: none; }
.ng-group summary::before { content: "\u25B8"; margin-right: 8px; color: var(--ng-muted-fg); transition: transform 0.15s; }
.ng-group[open] summary::before { transform: rotate(90deg); }
.ng-group summary > span:first-of-type { flex: 1; }
.ng-form { display: flex; flex-direction: column; gap: 14px; }
.ng-grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }

@media (prefers-reduced-motion: reduce) {
  .ng-drawer, .ng-edge, .ng-node-card, .ng-group summary::before { transition: none; }
}
.ng-btn-sm { min-height: 26px; padding: 0 8px; font-size: 12px; color: var(--ng-muted-fg); }

.ng-legend {
  position: absolute; top: 64px; left: 12px; display: flex; flex-direction: column; gap: 4px;
  padding: 8px 10px; border-radius: 10px; background: color-mix(in oklab, var(--ng-card) 85%, transparent);
  border: 1px solid var(--ng-border); font-size: 12px; pointer-events: none;
}
.ng-legend span { display: flex; align-items: center; gap: 8px; }
.ng-swatch { display: inline-block; width: 16px; height: 11px; border-radius: 3px; background: var(--ng-node); border: 2px solid transparent; }
.ng-swatch-today { border-color: var(--ng-primary); }
.ng-swatch-complete { border-color: var(--ng-done); }
.ng-swatch-selected { border-color: var(--ng-fg); }
.ng-link { border: 0; padding: 0; background: none; color: var(--ng-primary); font: inherit; cursor: pointer; text-decoration: underline; }
.ng-danger { color: var(--ng-hard); }
.ng-topic-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 12px; }

@media (max-width: 768px) {
  .ng-graph-host .ng-plan-card { top: auto; left: 12px; right: 12px; bottom: 12px; width: auto; max-height: 45%; overflow-y: auto; }
  .ng-zoom { left: auto; bottom: auto; right: 12px; top: 12px; }
  .ng-q-title { white-space: normal; }
}
`;

  // src/ui/grindPanel.js
  function initGrindPanel() {
    injectStyle("neetgrind-style", styles_default);
    let questions = null;
    let loadError = null;
    let lastSearch = null;
    let collapsed = storage.get("grindPanelCollapsed", false);
    let orderPicked = false;
    let groupingPicked = false;
    const orderSelect = h(
      "select",
      { class: "ng-input", onchange: () => (orderPicked = true, render()) },
      Object.entries(ORDER_LABELS).map(([value, label]) => h("option", { value }, label))
    );
    const groupingSelect = h(
      "select",
      { class: "ng-input", onchange: () => (groupingPicked = true, render()) },
      Object.entries(GROUPING_LABELS).map(([value, label]) => h("option", { value }, label))
    );
    const startInput = h("input", { class: "ng-input", type: "date", value: todayUtcISO() });
    const body = h("div", { class: "ng-grind-body" });
    const status = h("div", { class: "ng-status", role: "status" });
    const sendBtn = h("button", { class: "ng-btn ng-btn-primary", onclick: send }, "Send to NeetCode");
    const toggleBtn = h("button", { class: "ng-btn ng-btn-ghost ng-icon-btn", "aria-label": "Collapse", onclick: toggle }, "\u2013");
    const panel = h(
      "section",
      { class: "ng-root ng-grind-panel", "data-theme": "light", "aria-label": "NeetGrind" },
      h("header", { class: "ng-grind-head" }, h("strong", null, "NeetGrind"), h("span", { class: "ng-muted" }, "\u2192 NeetCode roadmap"), toggleBtn),
      h(
        "div",
        { class: "ng-grind-content" },
        body,
        h(
          "div",
          { class: "ng-grid2" },
          h("label", { class: "ng-field" }, h("span", null, "Order"), orderSelect),
          h("label", { class: "ng-field" }, h("span", null, "Group by"), groupingSelect)
        ),
        h("label", { class: "ng-field" }, h("span", null, "Start date (UTC)"), startInput),
        sendBtn,
        status
      )
    );
    document.body.append(panel);
    function toggle() {
      collapsed = !collapsed;
      storage.set("grindPanelCollapsed", collapsed);
      render();
    }
    function settings() {
      return { ...parseGrindParams(location.search), order: orderSelect.value, grouping: groupingSelect.value };
    }
    function render() {
      const page = parseGrindParams(location.search);
      const explicitOrder = new URLSearchParams(location.search).get("order");
      if (!orderPicked) orderSelect.value = explicitOrder in ORDER_LABELS ? explicitOrder : "recommended";
      if (!groupingPicked) groupingSelect.value = page.grouping;
      panel.classList.toggle("ng-collapsed", collapsed);
      toggleBtn.textContent = collapsed ? "+" : "\u2013";
      toggleBtn.setAttribute("aria-label", collapsed ? "Expand" : "Collapse");
      const s2 = settings();
      const diffs = s2.difficulty.length === 3 ? "All difficulties" : s2.difficulty.join(", ");
      const topics = s2.topics ? `${s2.topics.length} topics` : "All topics";
      const lines = [h("div", null, `${s2.weeks} weeks \xB7 ${s2.hours} h/week`), h("div", { class: "ng-muted" }, `${diffs} \xB7 ${topics}`)];
      const saved = planStore.load();
      const excluded = saved?.settings?.excludedTopics ?? [];
      const companies = saved?.settings?.company?.names ?? [];
      if (companies.length) {
        lines.push(h("div", { class: "ng-muted ng-small" }, `Companies: ${companies.join(", ")}. Their questions go in first; edit on NeetCode.`));
      }
      if (excluded.length) {
        lines.push(h("div", { class: "ng-muted ng-small" }, `Skipping on NeetCode: ${excluded.join(", ")}. The count there will differ.`));
      }
      if (loadError) lines.push(h("div", { class: "ng-error" }, loadError));
      else if (!questions) lines.push(h("div", { class: "ng-muted" }, "Loading questions\u2026"));
      else {
        const picked = selectQuestions(questions, s2);
        lines.push(h("div", { class: "ng-big" }, `${picked.length} questions`, h("span", { class: "ng-muted" }, ` \xB7 ~${totalHours(picked)} h`)));
        const shown = document.querySelectorAll('main [role="listitem"], [role="list"] [role="listitem"]').length;
        if (s2.mode === "preferences" && shown > 0 && shown !== picked.length) {
          lines.push(h("div", { class: "ng-warn" }, `Page shows ${shown}. Grind 75 may have changed its logic.`));
        }
      }
      fill(body, ...lines);
      sendBtn.disabled = !questions;
    }
    function send() {
      const s2 = settings();
      const prev = planStore.load();
      const excludedTopics = prev?.settings?.excludedTopics ?? [];
      const company = prev?.settings?.company ?? null;
      const companyData = { companyPool: prev?.companyPool ?? [], companyVersion: prev?.companyVersion ?? null };
      planStore.save(createPlan(questions, { ...s2, excludedTopics, company }, startInput.value || todayUtcISO(), "grind75", companyData));
      const adjusted = excludedTopics.length || company?.names?.length || company?.picked?.length;
      fill(
        status,
        adjusted ? "Saved. " : `Saved ${selectQuestions(questions, s2).length} questions. `,
        h("a", { href: "https://neetcode.io/roadmap", target: "_blank", rel: "noopener" }, "Open NeetCode roadmap \u2192")
      );
    }
    setInterval(() => {
      if (location.search !== lastSearch) {
        lastSearch = location.search;
        fill(status);
        render();
      }
    }, 500);
    render();
    (async () => {
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          questions = await loadGrindQuestions({ urls: chunkUrlsFromDocument() });
          loadError = null;
          break;
        } catch (err) {
          loadError = err.message;
          await new Promise((r) => setTimeout(r, 1e3));
        }
      }
      render();
    })();
  }

  // src/data/companySource.js
  var CO_REPO = "liquidslr/leetcode-company-wise-problems";
  var CO_REPO_URL = `https://github.com/${CO_REPO}`;
  var API = `https://api.github.com/repos/${CO_REPO}`;
  var RAW = `https://raw.githubusercontent.com/${CO_REPO}`;
  var CHECK_EVERY_MS = 24 * 60 * 60 * 1e3;
  var WINDOWS = {
    "30d": "1. Thirty Days.csv",
    "3mo": "2. Three Months.csv",
    "6mo": "3. Six Months.csv",
    all: "5. All.csv"
  };
  var WINDOW_LABELS = { "30d": "30 days", "3mo": "3 months", "6mo": "6 months", all: "All time" };
  function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = "";
    let quoted = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (quoted) {
        if (c === '"' && text[i + 1] === '"') field += '"', i++;
        else if (c === '"') quoted = false;
        else field += c;
      } else if (c === '"') quoted = true;
      else if (c === ",") row.push(field), field = "";
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else field += c;
    }
    if (field || row.length) row.push(field), rows.push(row);
    return rows.filter((r) => r.some((f) => f.trim()));
  }
  var DIFF = { EASY: "Easy", MEDIUM: "Medium", HARD: "Hard" };
  function slugFromLink(link) {
    const m = String(link ?? "").match(/\/problems\/([^/?#]+)/);
    return m ? normalizeSlug(m[1]) : "";
  }
  function rowsFromCsv(text) {
    const [header, ...rows] = parseCsv(text);
    if (!header) return [];
    const col = Object.fromEntries(header.map((name, i) => [name.trim().toLowerCase(), i]));
    const get = (r, name) => col[name] == null ? "" : (r[col[name]] ?? "").trim();
    const out = [];
    for (const r of rows) {
      const slug = slugFromLink(get(r, "link"));
      const difficulty = DIFF[get(r, "difficulty").toUpperCase()];
      if (!slug || !difficulty) continue;
      out.push({
        slug,
        title: get(r, "title") || slug,
        difficulty,
        frequency: Number(get(r, "frequency")) || 0,
        lcTopics: get(r, "topics").split(",").map((t) => t.trim()).filter(Boolean)
      });
    }
    return out;
  }
  function mergeCompanyRows(listsByCompany) {
    const bySlug = /* @__PURE__ */ new Map();
    for (const [company, rows] of Object.entries(listsByCompany)) {
      for (const r of rows) {
        let q = bySlug.get(r.slug);
        if (!q) bySlug.set(r.slug, q = { slug: r.slug, title: r.title, difficulty: r.difficulty, lcTopics: r.lcTopics, tags: [] });
        if (!q.tags.some((t) => t.company === company)) q.tags.push({ company, frequency: r.frequency });
      }
    }
    const best = (q) => Math.max(...q.tags.map((t) => t.frequency));
    for (const q of bySlug.values()) q.tags.sort((a, b) => b.frequency - a.frequency);
    return [...bySlug.values()].sort((a, b) => best(b) - best(a));
  }
  async function latestVersion({ force = false } = {}) {
    const hit = storage.get("co:latest", null);
    if (!force && hit && Date.now() - hit.checkedAt < CHECK_EVERY_MS) return hit.version;
    const commit = await fetchJson(`${API}/commits/main`);
    const version = { sha: commit.sha, date: commit.commit?.committer?.date ?? commit.commit?.author?.date ?? null };
    storage.set("co:latest", { version, checkedAt: Date.now() });
    return version;
  }
  async function loadCompanyNames(sha) {
    return cached("co:names", sha, async () => {
      const tree = await fetchJson(`${API}/git/trees/${sha}`);
      return tree.tree.filter((e) => e.type === "tree").map((e) => e.path).sort((a, b) => a.localeCompare(b));
    });
  }
  async function loadCompanyList(company, window2, sha) {
    const file = WINDOWS[window2] ?? WINDOWS["6mo"];
    const url = `${RAW}/${sha}/${encodeURIComponent(company)}/${encodeURIComponent(file)}`;
    return cached(`co:list:${company}:${window2}`, sha, async () => rowsFromCsv(await fetchText(url)));
  }
  async function buildCompanyPool(names, window2, { force = false } = {}) {
    if (!names?.length) return { companyPool: [], companyVersion: null };
    const version = await latestVersion({ force });
    const lists = {};
    for (const name of names) lists[name] = await loadCompanyList(name, window2, version.sha);
    return { companyPool: mergeCompanyRows(lists), companyVersion: version };
  }

  // src/data/neetcodeSource.js
  var NC_ORIGIN = "https://neetcode.io";
  var FALLBACK_URL = "https://raw.githubusercontent.com/neetcode-gh/leetcode/main/.problemSiteData.json";
  var FIELD = /([A-Za-z_$][\w$]*):("(?:[^"\\]|\\.)*"|!0|!1|true|false|-?\d+(?:\.\d+)?)/y;
  function parseValue(raw) {
    if (raw === "!0" || raw === "true") return true;
    if (raw === "!1" || raw === "false") return false;
    if (raw[0] === '"') {
      try {
        return JSON.parse(raw.replace(/\\'/g, "'"));
      } catch {
        return raw.slice(1, -1);
      }
    }
    return Number(raw);
  }
  function parseObjectAt(text, start2) {
    const obj = {};
    let i = start2;
    while (i < text.length) {
      FIELD.lastIndex = i;
      const m = FIELD.exec(text);
      if (!m) return null;
      obj[m[1]] = parseValue(m[2]);
      i = FIELD.lastIndex;
      if (text[i] === ",") i += 1;
      else if (text[i] === "}") return obj;
      else return null;
    }
    return null;
  }
  function extractNeetcodeProblems(jsText) {
    const out = [];
    let at = jsText.indexOf("{problem:");
    while (at >= 0) {
      const obj = parseObjectAt(jsText, at + 1);
      if (obj && obj.problem && obj.pattern && obj.link) out.push(obj);
      at = jsText.indexOf("{problem:", at + 1);
    }
    return out;
  }
  function mainBundleUrl(docOrHtml) {
    if (typeof docOrHtml === "string") {
      const m = docOrHtml.match(/src="([^"]*main\.[a-f0-9]+\.js)"/);
      return m ? new URL(m[1], `${NC_ORIGIN}/`).href : null;
    }
    const el = docOrHtml.querySelector('script[src*="main."]');
    return el ? el.src : null;
  }
  async function loadNeetcodeProblems({ doc, force = false } = {}) {
    let url = doc ? mainBundleUrl(doc) : null;
    if (!url) url = mainBundleUrl(await fetchText(`${NC_ORIGIN}/roadmap`));
    try {
      if (!url) throw new Error("NeetCode main bundle not found");
      const problems = await cached("nc:problems", url, async () => {
        const list = extractNeetcodeProblems(await fetchText(url));
        if (list.length < 200) throw new Error(`Only found ${list.length} NeetCode problems`);
        return list;
      }, { force });
      return { problems, source: "bundle" };
    } catch (err) {
      console.warn("[NeetGrind] Falling back to GitHub problem data:", err);
      const problems = await cached("nc:problems:github", "v1", () => fetchJson(FALLBACK_URL), { force });
      return { problems, source: "github" };
    }
  }

  // src/ui/planGraph.js
  var W = 260;
  var LINE = 32;
  var PAD = 22;
  var X_STRETCH = 1.3;
  function labelLines(label) {
    if (label.length <= 17) return [label];
    const cut = label.lastIndexOf(" ", Math.ceil(label.length / 2) + 2);
    return [label.slice(0, cut), label.slice(cut + 1)];
  }
  var nodeHeight = (label) => PAD * 2 + labelLines(label).length * LINE + 26 + 18;
  function weekRange(weeks) {
    if (!weeks.length) return "";
    const lo = Math.min(...weeks);
    const hi = Math.max(...weeks);
    return lo === hi ? `W${lo}` : `W${lo}\u2013${hi}`;
  }
  function renderPlanGraph({ stats, focus = /* @__PURE__ */ new Set(), selected, onSelect }) {
    const inPlan = NC_NODES.map((n) => n.label).filter((label) => stats.get(label)?.total);
    const graph = visibleGraph(inPlan.length ? inPlan : NC_NODES.map((n) => n.label));
    const boxes = new Map(
      graph.map((n) => {
        const p = NC_POSITIONS[n.label];
        return [n.label, { x: p.x * X_STRETCH - W / 2, y: p.y, w: W, h: nodeHeight(n.label) }];
      })
    );
    const all = [...boxes.values()];
    const minX = Math.min(...all.map((b) => b.x)) - 60;
    const minY = Math.min(...all.map((b) => b.y)) - 60;
    const maxX = Math.max(...all.map((b) => b.x + b.w)) + 60;
    const maxY = Math.max(...all.map((b) => b.y + b.h)) + 60;
    const base = { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
    let view = { ...base };
    const edges = [];
    for (const n of graph) {
      for (const parent of n.parents) {
        const from = boxes.get(parent);
        const to = boxes.get(n.label);
        const x1 = from.x + W / 2;
        const y1 = from.y + from.h;
        const x2 = to.x + W / 2;
        const y2 = to.y;
        const dy = Math.max(40, (y2 - y1) / 2);
        edges.push(
          s("path", {
            class: "ng-edge",
            "data-from": parent,
            "data-to": n.label,
            d: `M${x1},${y1} C${x1},${y1 + dy} ${x2},${y2 - dy} ${x2},${y2}`
          })
        );
      }
    }
    const nodes = graph.map((n) => {
      const b = boxes.get(n.label);
      const st = stats.get(n.label) ?? { total: 0, done: 0, weeks: [] };
      const pct = st.total ? st.done / st.total : 0;
      const lines = labelLines(n.label);
      const state = [
        "ng-node",
        st.total === 0 && "ng-node-empty",
        st.total > 0 && st.done === st.total && "ng-node-complete",
        focus.has(n.label) && "ng-node-today",
        selected === n.label && "ng-node-selected"
      ].filter(Boolean).join(" ");
      const barY = b.h - PAD - 10;
      const company = st.company ? `  \xB7  \u{1F3E2} ${st.company}` : "";
      const meta = st.total ? `${st.done}/${st.total}  \xB7  ${weekRange(st.weeks)}${company}` : "not in plan";
      return s(
        "g",
        {
          class: state,
          "data-label": n.label,
          transform: `translate(${b.x},${b.y})`,
          tabindex: st.total ? 0 : -1,
          role: "button",
          "aria-label": `${n.label}: ${meta}`,
          onclick: () => st.total && onSelect(n.label),
          onkeydown: (e) => {
            if ((e.key === "Enter" || e.key === " ") && st.total) {
              e.preventDefault();
              onSelect(n.label);
            }
          },
          onmouseenter: () => highlight(n.label),
          onmouseleave: () => highlight(null)
        },
        s("rect", { class: "ng-node-card", width: W, height: b.h, rx: 14 }),
        lines.map((line, i) => s("text", { class: "ng-node-label", x: W / 2, y: PAD + LINE * (i + 0.8), "text-anchor": "middle" }, line)),
        s("text", { class: "ng-node-meta", x: W / 2, y: PAD + LINE * lines.length + 20, "text-anchor": "middle" }, meta),
        s("rect", { class: "ng-node-track", x: PAD, y: barY, width: W - PAD * 2, height: 8, rx: 4 }),
        s("rect", { class: "ng-node-fill", x: PAD, y: barY, width: (W - PAD * 2) * pct, height: 8, rx: 4 })
      );
    });
    const svg = s(
      "svg",
      { class: "ng-graph", role: "group", "aria-label": "Custom plan roadmap", preserveAspectRatio: "xMidYMid meet" },
      s("g", { class: "ng-edges" }, edges),
      s("g", { class: "ng-nodes" }, nodes)
    );
    function setView(v) {
      view = v;
      svg.setAttribute("viewBox", `${v.x} ${v.y} ${v.w} ${v.h}`);
    }
    setView(base);
    function highlight(label) {
      const lit = label ? /* @__PURE__ */ new Set([label, ...ancestorsOf(label)]) : /* @__PURE__ */ new Set();
      for (const g of svg.querySelectorAll(".ng-node")) g.classList.toggle("ng-lit", lit.has(g.dataset.label));
      for (const p of svg.querySelectorAll(".ng-edge")) p.classList.toggle("ng-lit", lit.has(p.dataset.from) && lit.has(p.dataset.to));
    }
    function toSvg(e) {
      const r = svg.getBoundingClientRect();
      const scale = Math.max(view.w / r.width, view.h / r.height);
      const offX = (r.width * scale - view.w) / 2;
      const offY = (r.height * scale - view.h) / 2;
      return { x: view.x - offX + (e.clientX - r.left) * scale, y: view.y - offY + (e.clientY - r.top) * scale, scale };
    }
    function zoom(factor, at) {
      const w = Math.min(base.w * 1.5, Math.max(base.w / 6, view.w * factor));
      const k = w / view.w;
      const h2 = view.h * k;
      const cx = at?.x ?? view.x + view.w / 2;
      const cy = at?.y ?? view.y + view.h / 2;
      setView({ x: cx - (cx - view.x) * k, y: cy - (cy - view.y) * k, w, h: h2 });
    }
    svg.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        zoom(Math.exp(e.deltaY * (e.ctrlKey ? 0.01 : 2e-3)), toSvg(e));
      },
      { passive: false }
    );
    let drag = null;
    svg.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      drag = { start: toSvg(e), view: { ...view }, moved: false, id: e.pointerId };
    });
    svg.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const r = svg.getBoundingClientRect();
      const scale = Math.max(drag.view.w / r.width, drag.view.h / r.height);
      const dx = (e.clientX - r.left) * scale;
      const dy = (e.clientY - r.top) * scale;
      const sx = drag.start.x - drag.view.x + (r.width * scale - drag.view.w) / 2;
      const sy = drag.start.y - drag.view.y + (r.height * scale - drag.view.h) / 2;
      if (!drag.moved && Math.hypot(dx - sx, dy - sy) < 4 * scale) return;
      if (!drag.moved) svg.setPointerCapture(drag.id);
      drag.moved = true;
      setView({ ...drag.view, x: drag.view.x - (dx - sx), y: drag.view.y - (dy - sy) });
    });
    const endDrag = () => {
      if (drag?.moved) {
        const eat = (e) => e.stopPropagation();
        svg.addEventListener("click", eat, { capture: true });
        setTimeout(() => svg.removeEventListener("click", eat, { capture: true }), 0);
      }
      drag = null;
    };
    svg.addEventListener("pointerup", endDrag);
    svg.addEventListener("pointercancel", endDrag);
    return {
      svg,
      zoomIn: () => zoom(1 / 1.25),
      zoomOut: () => zoom(1.25),
      reset: () => setView(base),
      getView: () => view,
      setView
    };
  }

  // src/ui/roadmapPage.js
  function initRoadmapPage() {
    injectStyle("neetgrind-style", styles_default);
    const ui = {};
    const state = {
      mode: storage.get("mode", "neetcode"),
      ncIndex: null,
      ncSource: null,
      loadError: null,
      selected: null,
      drawer: null,
      // null | "list" | "replan" | "companyPick"
      graphView: null,
      draft: null,
      // Re-plan form values, kept while switching to the question picker
      companyNames: null,
      companyUpdate: null,
      // { sha, date } when GitHub has newer company lists than the plan
      picker: null,
      // { key, rows, error } company lists for the picker
      pickerQuery: "",
      pickerFiltered: true,
      coWindow: ""
      // label of the plan's company window, for badge tooltips
    };
    async function loadNc() {
      try {
        const { problems, source } = await loadNeetcodeProblems({ doc: document });
        state.ncIndex = indexNeetcode(problems);
        state.ncSource = source;
      } catch (err) {
        state.loadError = `Couldn't load NeetCode's problem list: ${err.message}`;
      }
      render();
    }
    function schedule() {
      const plan = planStore.load();
      if (!plan || !state.ncIndex) return null;
      const built = buildSchedule(plan.pool, plan.settings, state.ncIndex, plan.version >= 2 ? null : plan.slugs, plan.companyPool);
      return { ...plan, ...built };
    }
    async function rebuild(patch, startDate) {
      const plan = planStore.load();
      const pool = plan?.version >= 2 ? plan.pool : await loadGrindQuestions();
      const settings = { ...DEFAULT_SETTINGS, ...plan?.settings, ...patch };
      const co = companySettings(settings);
      const old = companySettings(plan?.settings);
      const sameLists = plan?.companyPool && co.window === old.window && co.names.join("\n") === old.names.join("\n");
      const company = sameLists ? { companyPool: plan.companyPool, companyVersion: plan.companyVersion } : await buildCompanyPool(co.names, co.window);
      if (!sameLists) state.companyUpdate = null;
      planStore.save(createPlan(pool, settings, startDate ?? plan?.startDate ?? todayUtcISO(), plan?.source ?? "neetcode", company));
      storage.set("today", null);
      state.graphView = null;
    }
    async function checkCompanyUpdate() {
      const plan = planStore.load();
      if (!companySettings(plan?.settings).names.length || !plan.companyVersion) return;
      try {
        const latest = await latestVersion();
        state.companyUpdate = latest.sha !== plan.companyVersion.sha ? latest : null;
        render();
      } catch (err) {
        console.warn("[NeetGrind] Company list update check failed:", err);
      }
    }
    async function applyCompanyUpdate(btn) {
      const plan = planStore.load();
      const co = companySettings(plan.settings);
      btn.disabled = true;
      btn.textContent = "Updating\u2026";
      try {
        planStore.update(await buildCompanyPool(co.names, co.window));
        storage.set("today", null);
        state.companyUpdate = null;
      } catch (err) {
        btn.textContent = `Failed: ${err.message}`;
        return;
      }
      render();
    }
    async function loadCompanyNamesOnce() {
      if (state.companyNames?.length) return;
      state.companyNames = null;
      try {
        state.companyNames = await loadCompanyNames((await latestVersion()).sha);
      } catch (err) {
        state.companyNames = [];
        console.warn("[NeetGrind] Couldn't load company names:", err);
      }
      if (state.drawer === "replan") render();
    }
    function todaySlugs(plan, isDone) {
      const day = todayUtcISO();
      const cached2 = storage.get("today", null);
      if (cached2 && cached2.planId === plan.id && cached2.day === day && cached2.order === plan.settings.order) return cached2.slugs;
      const { slugs } = dailyTarget(plan, isDone);
      storage.set("today", { planId: plan.id, day, order: plan.settings.order, slugs });
      return slugs;
    }
    function findHost() {
      const graph = document.querySelector("app-graph");
      if (!graph) return null;
      return {
        graph,
        card: graph.closest(".graph-card") ?? graph.parentElement,
        zoomControls: document.querySelector(".graph-grid > .absolute.bottom-4"),
        stats: document.querySelector(".right-sidebar .stats-section")
      };
    }
    function mounted() {
      return ui.toggle?.isConnected && ui.graphHost?.isConnected;
    }
    function mount() {
      const host = findHost();
      if (!host) return;
      unmount();
      ui.host = host;
      ui.toggle = h(
        "div",
        { class: "ng-root ng-toggle", role: "group", "aria-label": "Roadmap source" },
        h("button", { class: "ng-seg", "data-mode": "neetcode", onclick: () => setMode("neetcode") }, "NeetCode"),
        h("button", { class: "ng-seg", "data-mode": "plan", onclick: () => setMode("plan") }, "My Plan")
      );
      ui.graphHost = h("div", { class: "ng-root ng-graph-host" });
      ui.card = h("div", { class: "ng-root ng-plan-card app-surface-card" });
      ui.drawer = h("aside", { class: "ng-root ng-drawer", "aria-label": "Plan questions" });
      host.card.append(ui.graphHost, ui.toggle);
      document.body.append(ui.drawer);
      render();
    }
    function unmount() {
      for (const el of Object.values(ui)) if (el instanceof Element && el !== ui.host) el.remove();
      if (ui.host) applyNativeVisibility(ui.host, true);
      for (const k of Object.keys(ui)) delete ui[k];
    }
    function applyNativeVisibility(host, show) {
      for (const el of [host.graph, host.zoomControls, host.stats]) if (el) el.style.display = show ? "" : "none";
    }
    function setMode(mode) {
      state.mode = mode;
      storage.set("mode", mode);
      if (mode === "neetcode") state.drawer = null;
      render();
    }
    function render() {
      if (!mounted()) return;
      const plan = state.mode === "plan";
      for (const b of ui.toggle.querySelectorAll(".ng-seg")) b.setAttribute("aria-pressed", String(b.dataset.mode === state.mode));
      applyNativeVisibility(ui.host, !plan);
      ui.graphHost.hidden = !plan;
      ui.card.hidden = !plan;
      const dark = document.documentElement.classList.contains("dark-theme");
      for (const el of [ui.toggle, ui.graphHost, ui.card, ui.drawer]) el.dataset.theme = dark ? "dark" : "light";
      if (!plan) {
        ui.drawer.classList.remove("ng-open");
        return;
      }
      const sched = schedule();
      state.coWindow = sched ? WINDOW_LABELS[companySettings(sched.settings).window] ?? "" : "";
      const isDone = makeIsDone();
      renderGraph(sched, isDone);
      renderCard(sched, isDone);
      renderDrawer(sched, isDone);
    }
    function renderGraph(sched, isDone) {
      const stats = /* @__PURE__ */ new Map();
      for (const q of sched?.questions ?? []) {
        const st = stats.get(q.pattern) ?? { total: 0, done: 0, weeks: [], company: 0 };
        st.total += 1;
        st.company += q.companies?.length ? 1 : 0;
        st.done += isDone(q) ? 1 : 0;
        if (!st.weeks.includes(q.week)) st.weeks.push(q.week);
        stats.set(q.pattern, st);
      }
      const bySlug = new Map((sched?.questions ?? []).map((q) => [q.slug, q]));
      const todayTopics = new Set(sched ? todaySlugs(sched, isDone).map((s2) => bySlug.get(s2)?.pattern) : []);
      const graph = renderPlanGraph({
        stats,
        focus: todayTopics,
        selected: state.selected,
        onSelect: (label) => {
          state.selected = label;
          state.drawer = "list";
          render();
        }
      });
      if (state.graphView) graph.setView(state.graphView);
      const keepView = () => state.graphView = graph.getView();
      graph.svg.addEventListener("pointerup", keepView);
      graph.svg.addEventListener("wheel", keepView, { passive: true });
      const zoomBtn = (label, text, fn) => h("button", { class: "ng-zoom-btn", "aria-label": label, onclick: () => (fn(), keepView()) }, text);
      const controls = h(
        "div",
        { class: "ng-zoom" },
        zoomBtn("Zoom in", "+", graph.zoomIn),
        zoomBtn("Zoom out", "\u2212", graph.zoomOut),
        zoomBtn("Fit", "\u2922", () => (graph.reset(), state.graphView = null))
      );
      const empty = !sched ? h("div", { class: "ng-graph-empty" }, state.loadError ?? (state.ncIndex ? "No plan yet. Create one from the card on the right." : "Loading NeetCode problems\u2026")) : null;
      const legend = sched ? h(
        "div",
        { class: "ng-legend", "aria-label": "Legend" },
        h("span", null, h("i", { class: "ng-swatch ng-swatch-today" }), "Today's topics"),
        h("span", null, h("i", { class: "ng-swatch ng-swatch-complete" }), "Complete"),
        h("span", null, h("i", { class: "ng-swatch ng-swatch-selected" }), "Selected"),
        h("span", { class: "ng-muted" }, "W2\u20134 = weeks it's scheduled"),
        sched.companyCount ? h("span", { class: "ng-muted" }, "\u{1F3E2} 3 = company-tagged questions") : null
      ) : null;
      fill(ui.graphHost, graph.svg, controls, legend, empty);
      placeCard();
    }
    function placeCard() {
      const sidebar = ui.host.stats?.closest(".right-sidebar");
      const sidebarShown = sidebar && getComputedStyle(sidebar).display !== "none" && sidebar.getClientRects().length > 0;
      if (sidebarShown) {
        if (ui.card.nextElementSibling !== ui.host.stats) ui.host.stats.before(ui.card);
      } else if (ui.card.parentElement !== ui.graphHost) {
        ui.graphHost.append(ui.card);
      }
    }
    function renderCard(sched, isDone) {
      if (!sched) {
        fill(
          ui.card,
          h("div", { class: "ng-card-title" }, "My Plan"),
          h("p", { class: "ng-muted" }, "Pick weeks, hours and difficulty on Grind 75, then press \u201CSend to NeetCode\u201D. Or build one here."),
          h(
            "div",
            { class: "ng-row" },
            h("a", { class: "ng-btn ng-btn-primary", href: GRIND_PAGE, target: "_blank", rel: "noopener" }, "Open Grind 75"),
            h("button", { class: "ng-btn", onclick: () => openReplan(null) }, "Build here")
          )
        );
        return;
      }
      const pace = paceSummary(sched, isDone);
      const { pos } = pace;
      const today = todaySlugs(sched, isDone);
      const bySlug = new Map(sched.questions.map((q) => [q.slug, q]));
      const todayQs = today.map((slug) => bySlug.get(slug)).filter(Boolean);
      const next = todayQs.find((q) => !isDone(q)) ?? sched.questions.find((q) => q.week <= pos.week && !isDone(q)) ?? sched.questions.find((q) => !isDone(q));
      const when = pos.state === "not-started" ? `Starts ${formatDate(sched.startDate)} (in ${pos.daysUntilStart}d)` : pos.state === "overtime" ? `Plan ended \xB7 ${pace.total - pace.done} left` : `Week ${pos.week} of ${pos.weeks} \xB7 Day ${pos.dayOfWeek}`;
      fill(
        ui.card,
        h(
          "div",
          { class: "ng-card-head" },
          h("div", { class: "ng-card-title" }, "My Plan"),
          h("button", { class: "ng-btn ng-btn-ghost ng-btn-sm", onclick: () => openReplan(sched) }, "Re-plan")
        ),
        h(
          "div",
          { class: "ng-progress", role: "progressbar", "aria-valuemin": 0, "aria-valuemax": pace.total, "aria-valuenow": pace.done },
          h("div", { class: "ng-progress-fill", style: { width: `${100 * pace.done / Math.max(1, pace.total)}%` } })
        ),
        h("div", { class: "ng-card-head ng-small" }, h("span", null, when), h("span", { class: "ng-muted" }, `${pace.done}/${pace.total} done`)),
        h(
          "div",
          { class: "ng-muted ng-small" },
          pos.state === "not-started" ? `${sched.settings.weeks} wks \xB7 ${sched.settings.hours} h/wk` : `This week ${pace.weekDone}/${pace.weekTotal}`,
          pace.overdue ? h("span", { class: "ng-warn-text" }, ` \xB7 ${pace.overdue} overdue`) : null
        ),
        todayQs.length ? h(
          "div",
          { class: "ng-today" },
          h("div", { class: "ng-label" }, "Today"),
          todayQs.map((q) => questionRow(q, isDone, { compact: true }))
        ) : null,
        h(
          "div",
          { class: "ng-row" },
          next ? h("a", { class: "ng-btn ng-btn-primary", href: problemUrl(next), target: "_blank", rel: "noopener" }, "Solve next") : null,
          h("button", { class: "ng-btn", onclick: () => {
            state.selected = null;
            openDrawer("list");
          } }, "All questions")
        ),
        sched.settings.excludedTopics?.length ? h(
          "div",
          { class: "ng-muted ng-small" },
          `${sched.settings.excludedTopics.length} topic${sched.settings.excludedTopics.length > 1 ? "s" : ""} excluded \xB7 `,
          h("button", { class: "ng-link", onclick: () => openReplan(sched) }, "Edit")
        ) : null,
        companyLine(sched),
        state.ncSource === "github" ? h("div", { class: "ng-warn-text ng-small" }, "Using GitHub problem data; some links go to LeetCode.") : null
      );
    }
    function companyLine(sched) {
      const co = companySettings(sched.settings);
      if (!co.names.length && !co.picked.length) return null;
      const names = co.names.length > 2 ? `${co.names.slice(0, 2).join(", ")} +${co.names.length - 2}` : co.names.join(", ");
      const update = state.companyUpdate;
      return h(
        "div",
        { class: "ng-co-line ng-small" },
        h(
          "div",
          { class: "ng-muted" },
          buildingIcon(),
          ` ${sched.companyCount} company-tagged \xB7 ${names || "picked"} (${WINDOW_LABELS[co.window] ?? co.window})`
        ),
        update ? h(
          "div",
          { class: "ng-co-update" },
          `Company lists updated${update.date ? ` (${formatDate(update.date.slice(0, 10))})` : ""} \xB7 `,
          h("button", { class: "ng-link", onclick: (e) => applyCompanyUpdate(e.currentTarget) }, "Apply")
        ) : null
      );
    }
    function draftFrom(sched) {
      const base = { ...DEFAULT_SETTINGS, ...sched?.settings };
      return structuredClone({ ...base, company: companySettings(base), startDate: sched?.startDate ?? todayUtcISO() });
    }
    function openReplan(sched) {
      state.draft = draftFrom(sched);
      loadCompanyNamesOnce();
      openDrawer("replan");
    }
    function openDrawer(view) {
      state.drawer = view;
      render();
      ui.drawer.querySelector("button, input, select, a")?.focus();
    }
    function closeDrawer() {
      state.drawer = null;
      state.selected = null;
      render();
    }
    function questionRow(q, isDone, { compact = false, tag = null } = {}) {
      const done = isDone(q);
      const status = q.leetcodeOnly ? h("input", {
        type: "checkbox",
        class: "ng-check",
        checked: done,
        "aria-label": `Mark ${q.title} done (LeetCode only)`,
        onchange: () => (lcDone.toggle(q.slug), render())
      }) : h("span", { class: `ng-dot ${done ? "ng-dot-done" : ""}`, title: done ? "Completed on NeetCode" : "Not completed on NeetCode" }, done ? "\u2713" : "");
      return h(
        "div",
        { class: `ng-q ${done ? "ng-q-done" : ""}` },
        status,
        h("a", { class: "ng-q-title", href: problemUrl(q), target: "_blank", rel: "noopener" }, q.ncTitle ?? q.title),
        compact ? null : h("span", { class: "ng-muted ng-small" }, `${q.duration}m`),
        tag ? h("span", { class: "ng-tag" }, tag) : null,
        companyBadge(q),
        q.leetcodeOnly ? h("span", { class: "ng-tag ng-tag-lc", title: "Not on NeetCode; opens LeetCode" }, "LC") : null,
        h("span", { class: `ng-diff ${DIFF_CLASS[q.difficulty]}` }, q.difficulty)
      );
    }
    function buildingIcon() {
      return s(
        "svg",
        { class: "ng-co-icon", viewBox: "0 0 16 16", width: 12, height: 12, "aria-hidden": "true" },
        s("path", { d: "M2 15V2.5L9 1v14M9 6l5 1.5V15M1 15h14M4.5 4.5h2M4.5 7.5h2M4.5 10.5h2M11 9.5h1M11 12h1", fill: "none", stroke: "currentColor", "stroke-width": 1.4, "stroke-linecap": "round", "stroke-linejoin": "round" })
      );
    }
    function companyBadge(q, span = state.coWindow) {
      if (!q.companies?.length) return null;
      const title = q.companies.map((t) => `${t.company} \xB7 frequency ${Math.round(t.frequency)}`).join("\n");
      return h(
        "span",
        { class: "ng-tag ng-tag-co", title: `Company-tagged${span ? ` (${span})` : ""}
${title}` },
        buildingIcon(),
        h("span", { class: "ng-co-name" }, q.companies[0].company),
        q.companies.length > 1 ? ` +${q.companies.length - 1}` : null
      );
    }
    function renderDrawer(sched, isDone) {
      ui.drawer.classList.toggle("ng-open", Boolean(state.drawer));
      if (!state.drawer) return fill(ui.drawer);
      const close = h("button", { class: "ng-btn ng-btn-ghost ng-icon-btn", "aria-label": "Close", onclick: closeDrawer }, "\u2715");
      if (state.drawer === "replan") return fill(ui.drawer, replanForm(sched, close));
      if (state.drawer === "companyPick") return fill(ui.drawer, companyPicker(sched, close));
      if (!sched) return closeDrawer();
      const grouping = sched.settings.grouping ?? "weeks";
      const qs = state.selected ? sched.questions.filter((q) => q.pattern === state.selected) : sched.questions;
      const current = paceSummary(sched, isDone).pos.week;
      const groups = groupQuestions(qs, grouping);
      const tagFor = (q) => {
        if (grouping === "topics" || state.selected) return grouping === "weeks" ? null : `W${q.week}`;
        const topic = q.review ? "Review" : q.pattern;
        return grouping === "weeks" ? topic : `${topic} \xB7 W${q.week}`;
      };
      const setGrouping = (g) => {
        planStore.update({ settings: { ...sched.settings, grouping: g } });
        render();
      };
      const doneIn = (list) => list.filter(isDone).length;
      fill(
        ui.drawer,
        h(
          "header",
          { class: "ng-drawer-head" },
          h(
            "div",
            null,
            h("div", { class: "ng-card-title" }, state.selected ?? "All questions"),
            h("div", { class: "ng-muted ng-small" }, `${doneIn(qs)}/${qs.length} done \xB7 ~${totalHours(qs)} h`)
          ),
          close
        ),
        h(
          "div",
          { class: "ng-row" },
          h(
            "div",
            { class: "ng-toggle ng-toggle-inline", role: "group", "aria-label": "Group by" },
            GROUPINGS.map(
              (g) => h("button", { class: "ng-seg", "aria-pressed": String(grouping === g), onclick: () => setGrouping(g) }, GROUPING_LABELS[g])
            )
          ),
          state.selected ? h("button", { class: "ng-btn ng-btn-ghost", onclick: () => {
            state.selected = null;
            render();
          } }, "Show all topics") : null,
          state.selected ? h("button", {
            class: "ng-btn ng-btn-ghost ng-danger",
            title: "Leave this topic out. Its hours go to other questions; turn it back on in Re-plan.",
            onclick: async () => {
              await rebuild({ excludedTopics: [...sched.settings.excludedTopics ?? [], state.selected] });
              state.selected = null;
              state.drawer = null;
              render();
            }
          }, "Remove topic from plan") : null
        ),
        h(
          "div",
          { class: "ng-groups" },
          groups.map(
            ({ name, questions: list }) => h(
              "details",
              { class: "ng-group", open: grouping !== "weeks" || Boolean(state.selected) || name === `Week ${current}` },
              h("summary", null, h("span", null, name), h("span", { class: "ng-muted ng-small" }, `${doneIn(list)}/${list.length}`)),
              list.map((q) => questionRow(q, isDone, { tag: tagFor(q) }))
            )
          )
        )
      );
    }
    function replanForm(sched, close) {
      const d = state.draft ??= draftFrom(sched);
      const co = d.company;
      const bind = (el, fn) => (el.addEventListener("input", () => fn(el)), el);
      const weeks = bind(h("input", { class: "ng-input", type: "number", min: 1, max: 26, value: d.weeks }), (el) => d.weeks = el.value);
      const hours = bind(h("input", { class: "ng-input", type: "number", min: 1, max: 40, value: d.hours }), (el) => d.hours = el.value);
      const diffs = DIFFICULTIES.map(
        (v) => h("input", { type: "checkbox", value: v, checked: d.difficulty.includes(v), onchange: () => d.difficulty = diffs.filter((cb) => cb.checked).map((cb) => cb.value) })
      );
      const order = h("select", { class: "ng-input", onchange: () => d.order = order.value }, ORDERS.map((o) => h("option", { value: o, selected: o === d.order }, ORDER_LABELS[o])));
      const grouping = h("select", { class: "ng-input", onchange: () => d.grouping = grouping.value }, GROUPINGS.map((g) => h("option", { value: g, selected: g === (d.grouping ?? "weeks") }, GROUPING_LABELS[g])));
      const start2 = bind(h("input", { class: "ng-input", type: "date", value: d.startDate }), (el) => d.startDate = el.value);
      const excluded = new Set(d.excludedTopics ?? []);
      const topicBoxes = TOPO_LABELS.map(
        (t) => h("input", { type: "checkbox", value: t, checked: !excluded.has(t), onchange: () => d.excludedTopics = topicBoxes.filter((cb) => !cb.checked).map((cb) => cb.value) })
      );
      const setAllTopics = (on) => {
        topicBoxes.forEach((cb) => cb.checked = on);
        d.excludedTopics = on ? [] : [...TOPO_LABELS];
      };
      const status = h("div", { class: "ng-status", role: "status" });
      const submit = h("button", { class: "ng-btn ng-btn-primary", type: "submit" }, sched ? "Rebuild plan" : "Create plan");
      const grindLink = () => {
        const p = new URLSearchParams({ weeks: d.weeks, hours: d.hours });
        for (const v of d.difficulty) p.append("difficulty", v);
        if (["difficulty", "topics", "all_rounded"].includes(d.order)) p.set("order", d.order);
        p.set("grouping", d.grouping);
        return `${GRIND_PAGE}?${p}`;
      };
      async function onSubmit(e) {
        e.preventDefault();
        if (!d.difficulty.length) return fill(status, "Pick at least one difficulty.");
        if ((d.excludedTopics ?? []).length >= TOPO_LABELS.length) return fill(status, "Keep at least one topic.");
        const { startDate, ...rest } = d;
        const settings = {
          ...rest,
          weeks: Math.min(26, Math.max(1, Math.round(+d.weeks || 8))),
          hours: Math.min(40, Math.max(1, Math.round(+d.hours || 8))),
          mode: "preferences",
          company: {
            ...co,
            count: Math.max(1, Math.round(+co.count || 25)),
            share: Math.min(100, Math.max(1, Math.round(+co.share || 50)))
          }
        };
        submit.disabled = true;
        fill(status, co.names.length ? "Loading company lists\u2026" : "Building plan\u2026");
        try {
          await rebuild(settings, startDate || todayUtcISO());
          state.drawer = null;
          state.selected = null;
          state.draft = null;
          render();
        } catch (err) {
          fill(status, `Failed: ${err.message}`);
          submit.disabled = false;
        }
      }
      return h(
        "form",
        { class: "ng-form", onsubmit: onSubmit },
        h("header", { class: "ng-drawer-head" }, h("div", { class: "ng-card-title" }, sched ? "Re-plan" : "Build a plan"), close),
        h(
          "div",
          { class: "ng-grid2" },
          h("label", { class: "ng-field" }, h("span", null, "Weeks"), weeks),
          h("label", { class: "ng-field" }, h("span", null, "Hours / week"), hours)
        ),
        h(
          "fieldset",
          { class: "ng-field" },
          h("legend", null, "Difficulty"),
          h("div", { class: "ng-row" }, diffs.map((cb) => h("label", { class: "ng-check-label" }, cb, cb.value)))
        ),
        h(
          "div",
          { class: "ng-grid2" },
          h("label", { class: "ng-field" }, h("span", null, "Order"), order),
          h("label", { class: "ng-field" }, h("span", null, "Group by"), grouping)
        ),
        h("label", { class: "ng-field" }, h("span", null, "Start date (UTC)"), start2),
        h(
          "fieldset",
          { class: "ng-field" },
          h("legend", null, "NeetCode topics"),
          h("div", { class: "ng-topic-grid" }, topicBoxes.map((cb) => h("label", { class: "ng-check-label" }, cb, cb.value))),
          h(
            "div",
            { class: "ng-row" },
            h("button", { type: "button", class: "ng-link", onclick: () => setAllTopics(true) }, "All"),
            h("button", { type: "button", class: "ng-link", onclick: () => setAllTopics(false) }, "None")
          )
        ),
        companyFields(co),
        h("p", { class: "ng-muted ng-small" }, "Company questions are picked first, then Grind 75 fills the hours left. Hours from turned-off topics go to other questions. Grind 75's own topic filter is kept."),
        h(
          "div",
          { class: "ng-row" },
          submit,
          h("a", { class: "ng-btn ng-btn-ghost", target: "_blank", rel: "noopener", onclick: (e) => e.currentTarget.href = grindLink(), href: GRIND_PAGE }, "Preview on Grind 75")
        ),
        status
      );
    }
    function companyFields(co) {
      const names = state.companyNames;
      const available = (names ?? []).filter((n) => !co.names.includes(n));
      const picker = h(
        "select",
        {
          class: "ng-input ng-co-select",
          "aria-label": "Add a company",
          disabled: !names?.length,
          onchange: (e) => {
            const name = e.target.value;
            if (!name || co.names.includes(name)) return;
            co.names.push(name);
            render();
            ui.drawer.querySelector(".ng-co-select")?.focus();
          }
        },
        h(
          "option",
          { value: "", selected: true },
          !names ? "Loading companies\u2026" : names.length ? `Add a company (${available.length} available)\u2026` : "Couldn't load companies"
        ),
        available.map((n) => h("option", { value: n }, n))
      );
      const windowSelect = h(
        "select",
        { class: "ng-input", onchange: (e) => co.window = e.target.value },
        Object.keys(WINDOWS).map((w) => h("option", { value: w, selected: w === co.window }, WINDOW_LABELS[w]))
      );
      const limitSelect = h(
        "select",
        { class: "ng-input", onchange: (e) => (co.limit = e.target.value, render()) },
        Object.entries(COMPANY_LIMITS).map(([v, label]) => h("option", { value: v, selected: v === co.limit }, label))
      );
      const share = co.limit === "share";
      const amount = h("input", {
        class: "ng-input",
        type: "number",
        min: 1,
        max: share ? 100 : 500,
        value: share ? co.share : co.count,
        oninput: (e) => share ? co.share = e.target.value : co.count = e.target.value
      });
      return h(
        "fieldset",
        { class: "ng-field" },
        h("legend", null, "Company tags"),
        h(
          "div",
          { class: "ng-row ng-co-chips" },
          co.names.map(
            (n) => h(
              "span",
              { class: "ng-chip" },
              n,
              h("button", { type: "button", class: "ng-chip-x", "aria-label": `Remove ${n}`, onclick: () => (co.names = co.names.filter((x) => x !== n), render()) }, "\u2715")
            )
          ),
          co.names.length ? null : h("span", { class: "ng-muted ng-small" }, "None. Add companies you're interviewing with.")
        ),
        picker,
        h(
          "div",
          { class: "ng-grid2" },
          h("label", { class: "ng-field" }, h("span", null, "Asked in the last"), windowSelect),
          h("label", { class: "ng-field" }, h("span", null, "How many"), limitSelect)
        ),
        h("label", { class: "ng-field" }, h("span", null, share ? "% of your hours" : "Questions per company"), amount),
        h(
          "div",
          { class: "ng-row" },
          h("button", {
            type: "button",
            class: "ng-btn",
            disabled: !co.names.length,
            onclick: () => (state.drawer = "companyPick", render(), ui.drawer.querySelector(".ng-co-search")?.focus())
          }, "Choose questions\u2026"),
          h("span", { class: "ng-muted ng-small" }, co.picked.length ? `${co.picked.length} picked, always included` : "Optional")
        ),
        h(
          "p",
          { class: "ng-muted ng-small" },
          "Lists from ",
          h("a", { href: CO_REPO_URL, target: "_blank", rel: "noopener" }, "leetcode-company-wise-problems"),
          ", checked daily for updates."
        )
      );
    }
    function companyPicker(sched, close) {
      const d = state.draft ??= draftFrom(sched);
      const co = d.company;
      const key = `${co.window}|${co.names.join("\n")}`;
      if (state.picker?.key !== key) {
        state.picker = { key, rows: null, error: null };
        buildCompanyPool(co.names, co.window).then(({ companyPool }) => state.picker.key === key && (state.picker.rows = companyPool)).catch((err) => state.picker.key === key && (state.picker.error = err.message)).finally(() => state.drawer === "companyPick" && render());
      }
      const back = h("button", { class: "ng-btn ng-btn-ghost", onclick: () => (state.drawer = "replan", render()) }, "\u2190 Back");
      const head = (sub) => h(
        "header",
        { class: "ng-drawer-head" },
        h("div", null, h("div", { class: "ng-card-title" }, "Choose company questions"), h("div", { class: "ng-muted ng-small" }, sub)),
        close
      );
      const { rows, error } = state.picker;
      if (!rows) return h("div", { class: "ng-form" }, head(error ? `Failed: ${error}` : "Loading lists\u2026"), back);
      const grind = (sched?.pool ?? planStore.load()?.pool ?? []).map((q) => mapQuestion(q, state.ncIndex));
      const tagged = withCompanies(grind, rows, state.ncIndex);
      const all = [...tagged.grind.filter((q) => q.companies), ...tagged.extra].sort((a, b) => bestFrequency(b) - bestFrequency(a));
      const picked = new Set(co.picked);
      const count = h("div", { class: "ng-muted ng-small" });
      const setCount = () => fill(count, `${picked.size} picked \xB7 ${co.names.join(", ")} \xB7 ${WINDOW_LABELS[co.window]}`);
      const list = h("div", { class: "ng-groups" });
      const LIMIT = 200;
      function renderList() {
        const query = state.pickerQuery.trim().toLowerCase();
        const diffs = new Set(d.difficulty);
        const excluded = new Set(d.excludedTopics ?? []);
        const shown = all.filter(
          (q) => (picked.has(q.slug) || !state.pickerFiltered || diffs.has(q.difficulty) && !excluded.has(q.pattern)) && (!query || `${q.ncTitle ?? q.title} ${q.pattern} ${q.slug}`.toLowerCase().includes(query))
        );
        fill(
          list,
          shown.slice(0, LIMIT).map(
            (q) => h(
              "label",
              { class: "ng-q ng-pick" },
              h("input", {
                type: "checkbox",
                class: "ng-check",
                checked: picked.has(q.slug),
                onchange: (e) => {
                  if (e.target.checked) picked.add(q.slug);
                  else picked.delete(q.slug);
                  co.picked = [...picked];
                  setCount();
                }
              }),
              h("span", { class: "ng-q-title" }, q.ncTitle ?? q.title),
              h("span", { class: "ng-freq", title: `Frequency ${Math.round(bestFrequency(q))}` }, h("i", { style: { width: `${Math.min(100, bestFrequency(q))}%` } })),
              h("span", { class: "ng-tag" }, q.pattern),
              companyBadge(q, WINDOW_LABELS[co.window]),
              h("span", { class: `ng-diff ${DIFF_CLASS[q.difficulty]}` }, q.difficulty)
            )
          ),
          shown.length > LIMIT ? h("div", { class: "ng-muted ng-small" }, `Showing ${LIMIT} of ${shown.length}. Search to narrow.`) : null,
          shown.length ? null : h("div", { class: "ng-muted ng-small" }, "No questions match.")
        );
      }
      setCount();
      renderList();
      return h(
        "div",
        { class: "ng-form" },
        head(""),
        count,
        h("input", {
          class: "ng-input ng-co-search",
          type: "search",
          placeholder: "Search questions or topics\u2026",
          value: state.pickerQuery,
          oninput: (e) => (state.pickerQuery = e.target.value, renderList())
        }),
        h(
          "label",
          { class: "ng-check-label" },
          h("input", { type: "checkbox", checked: state.pickerFiltered, onchange: (e) => (state.pickerFiltered = e.target.checked, renderList()) }),
          "Only the plan's difficulties and topics"
        ),
        h(
          "div",
          { class: "ng-row" },
          back,
          h("button", { class: "ng-btn ng-btn-ghost", onclick: () => (co.picked = [], picked.clear(), setCount(), renderList()) }, "Clear picks")
        ),
        list
      );
    }
    let lastDay = utcDay(/* @__PURE__ */ new Date());
    function tick() {
      if (!location.pathname.startsWith("/roadmap")) {
        if (ui.toggle) unmount();
        return;
      }
      if (!mounted() || !ui.host.graph.isConnected) mount();
      const day = utcDay(/* @__PURE__ */ new Date());
      if (day !== lastDay) {
        lastDay = day;
        render();
      }
    }
    setInterval(tick, 400);
    tick();
    onProgress(render);
    window.addEventListener("focus", render);
    window.addEventListener("storage", render);
    window.addEventListener("resize", () => mounted() && state.mode === "plan" && placeCard());
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && state.drawer) closeDrawer();
    });
    loadNc();
    checkCompanyUpdate();
  }

  // src/main.js
  if (location.hostname === "neetcode.io") installNetHook(recordCapture);
  function start() {
    const { hostname, pathname } = location;
    if (hostname.endsWith("techinterviewhandbook.org") && pathname.startsWith("/grind75")) initGrindPanel();
    else if (hostname === "neetcode.io") initRoadmapPage();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
