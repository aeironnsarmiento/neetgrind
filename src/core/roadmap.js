// NeetCode roadmap graph, as defined in neetcode.io's roadmap chunk (constant `Oh`).
// Positions are the node centers NeetCode hardcodes (constant `ji`).

export const NC_NODES = [
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
  { id: 18, label: "Math & Geometry", parents: [14, 15] },
];

export const NC_POSITIONS = {
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
  "Math & Geometry": { x: 388, y: 901 },
};

export const NODE_BY_ID = new Map(NC_NODES.map((n) => [n.id, n]));
export const NODE_BY_LABEL = new Map(NC_NODES.map((n) => [n.label, n]));

// Kahn's algorithm; ties broken by node id so the order is stable.
export function topoOrder(nodes = NC_NODES) {
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

export const TOPO_LABELS = topoOrder();
export const TOPO_RANK = Object.fromEntries(TOPO_LABELS.map((label, i) => [label, i]));

export function ancestorsOf(label) {
  const out = new Set();
  const stack = [...(NODE_BY_LABEL.get(label)?.parents ?? [])];
  while (stack.length) {
    const id = stack.pop();
    const node = NODE_BY_ID.get(id);
    if (!node || out.has(node.label)) continue;
    out.add(node.label);
    stack.push(...node.parents);
  }
  return out;
}

// Subgraph of just `visible` labels. Edges through hidden nodes are rewired to the nearest
// visible ancestors, then transitively reduced so a skipped edge doesn't duplicate a path.
export function visibleGraph(visible) {
  const keep = new Set(visible);
  const nearestVisible = (node) => {
    const out = new Set();
    const stack = [...node.parents];
    const seen = new Set();
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
      parents: parents.filter((p) => !parents.some((q) => q !== p && ancestorsOf(q).has(p))),
    };
  });
}
