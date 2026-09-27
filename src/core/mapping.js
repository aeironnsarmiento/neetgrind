// Joins Grind 75 questions onto NeetCode problems by LeetCode slug.
// Grind `slug` === NeetCode `link` without the trailing slash.

// Grind 75 questions that NeetCode doesn't list, placed by hand.
export const UNMATCHED_OVERRIDES = {
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
  "sudoku-solver": "Backtracking",
};

// Last resort for questions added to Grind 75 after this list was written.
export const GRIND_TOPIC_FALLBACK = {
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
  math: "Math & Geometry",
};

// LeetCode topic tags → NeetCode topic, for company questions neither NeetCode nor Grind 75 has.
// First match wins, so specific structures come before generic ones (BFS/DFS last: trees use them too).
export const LC_TOPIC_PATTERNS = [
  [["Trie"], "Tries"],
  [["Backtracking"], "Backtracking"],
  [["Heap (Priority Queue)"], "Heap / Priority Queue"],
  [
    [
      "Shortest Path", "Minimum Spanning Tree", "Eulerian Circuit", "Eulerian Path", "Strongly Connected Component",
      "Dijkstra's Algorithm", "Bellman–Ford Algorithm", "Floyd–Warshall Algorithm", "Prim's Algorithm", "Kruskal's Algorithm",
    ],
    "Advanced Graphs",
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
  [["Breadth-First Search", "Depth-First Search"], "Graphs"],
];

export function patternFromLcTopics(tags) {
  const has = new Set(tags ?? []);
  for (const [names, label] of LC_TOPIC_PATTERNS) {
    if (!names.some((n) => has.has(n))) continue;
    if (label === "1-D Dynamic Programming" && has.has("Matrix")) return "2-D Dynamic Programming";
    return label;
  }
  return tags?.length ? "Arrays & Hashing" : null;
}

export function normalizeSlug(slug) {
  return String(slug ?? "")
    .trim()
    .replace(/^\/+|\/+$/g, "")
    .toLowerCase();
}

export function indexNeetcode(problems) {
  const index = new Map();
  for (const p of problems) {
    const slug = normalizeSlug(p.link);
    // The bundle has a few duplicates (e.g. JavaScript track); keep the first DSA entry.
    if (slug && !index.has(slug) && p.pattern !== "JavaScript") index.set(slug, p);
  }
  return index;
}

export function mapQuestion(q, ncIndex) {
  const nc = ncIndex.get(normalizeSlug(q.slug));
  if (nc) {
    const ncSlug = normalizeSlug(nc.ncLink);
    return {
      ...q,
      pattern: nc.pattern,
      ncTitle: nc.problem,
      ncLink: ncSlug || null,
      neetcode150: Boolean(nc.neetcode150),
      leetcodeOnly: false,
    };
  }
  return {
    ...q,
    pattern:
      UNMATCHED_OVERRIDES[q.slug] ?? patternFromLcTopics(q.lcTopics) ?? GRIND_TOPIC_FALLBACK[q.topic] ?? "Arrays & Hashing",
    ncTitle: null,
    ncLink: null,
    neetcode150: false,
    leetcodeOnly: true,
  };
}

export function problemUrl(q) {
  return q.ncLink ? `https://neetcode.io/problems/${q.ncLink}` : `https://leetcode.com/problems/${q.slug}/`;
}
