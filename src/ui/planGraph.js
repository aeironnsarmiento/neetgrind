// SVG roadmap for the custom plan. Same nodes, edges and positions as NeetCode's graph.

import { ancestorsOf, NC_NODES, NC_POSITIONS, visibleGraph } from "../core/roadmap.js";
import { s } from "./dom.js";

const W = 260;
const LINE = 32;
const PAD = 22;
// NeetCode stretches x at render time; its raw positions put 260-wide nodes edge to edge.
const X_STRETCH = 1.3;

// NeetCode wraps long labels; do the same at a fixed break.
function labelLines(label) {
  if (label.length <= 17) return [label];
  const cut = label.lastIndexOf(" ", Math.ceil(label.length / 2) + 2);
  return [label.slice(0, cut), label.slice(cut + 1)];
}

const nodeHeight = (label) => PAD * 2 + labelLines(label).length * LINE + 26 + 18;

function weekRange(weeks) {
  if (!weeks.length) return "";
  const lo = Math.min(...weeks);
  const hi = Math.max(...weeks);
  return lo === hi ? `W${lo}` : `W${lo}–${hi}`;
}

// stats: Map<label, { total, done, weeks: number[] }>
// Topics with no plan questions are left out; with no plan at all, every topic is shown.
// focus: labels to outline (today's topics).
export function renderPlanGraph({ stats, focus = new Set(), selected, onSelect }) {
  const inPlan = NC_NODES.map((n) => n.label).filter((label) => stats.get(label)?.total);
  const graph = visibleGraph(inPlan.length ? inPlan : NC_NODES.map((n) => n.label));
  const boxes = new Map(
    graph.map((n) => {
      const p = NC_POSITIONS[n.label];
      return [n.label, { x: p.x * X_STRETCH - W / 2, y: p.y, w: W, h: nodeHeight(n.label) }];
    }),
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
          d: `M${x1},${y1} C${x1},${y1 + dy} ${x2},${y2 - dy} ${x2},${y2}`,
        }),
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
      selected === n.label && "ng-node-selected",
    ]
      .filter(Boolean)
      .join(" ");
    const barY = b.h - PAD - 10;
    const meta = st.total ? `${st.done}/${st.total}  ·  ${weekRange(st.weeks)}` : "not in plan";
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
        onmouseleave: () => highlight(null),
      },
      s("rect", { class: "ng-node-card", width: W, height: b.h, rx: 14 }),
      lines.map((line, i) => s("text", { class: "ng-node-label", x: W / 2, y: PAD + LINE * (i + 0.8), "text-anchor": "middle" }, line)),
      s("text", { class: "ng-node-meta", x: W / 2, y: PAD + LINE * lines.length + 20, "text-anchor": "middle" }, meta),
      s("rect", { class: "ng-node-track", x: PAD, y: barY, width: W - PAD * 2, height: 8, rx: 4 }),
      s("rect", { class: "ng-node-fill", x: PAD, y: barY, width: (W - PAD * 2) * pct, height: 8, rx: 4 }),
    );
  });

  const svg = s(
    "svg",
    { class: "ng-graph", role: "group", "aria-label": "Custom plan roadmap", preserveAspectRatio: "xMidYMid meet" },
    s("g", { class: "ng-edges" }, edges),
    s("g", { class: "ng-nodes" }, nodes),
  );

  function setView(v) {
    view = v;
    svg.setAttribute("viewBox", `${v.x} ${v.y} ${v.w} ${v.h}`);
  }
  setView(base);

  function highlight(label) {
    const lit = label ? new Set([label, ...ancestorsOf(label)]) : new Set();
    for (const g of svg.querySelectorAll(".ng-node")) g.classList.toggle("ng-lit", lit.has(g.dataset.label));
    for (const p of svg.querySelectorAll(".ng-edge")) p.classList.toggle("ng-lit", lit.has(p.dataset.from) && lit.has(p.dataset.to));
  }

  // Pan with drag, zoom with wheel / pinch-trackpad, around the cursor.
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
    const h = view.h * k;
    const cx = at?.x ?? view.x + view.w / 2;
    const cy = at?.y ?? view.y + view.h / 2;
    setView({ x: cx - (cx - view.x) * k, y: cy - (cy - view.y) * k, w, h });
  }
  svg.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      zoom(Math.exp(e.deltaY * (e.ctrlKey ? 0.01 : 0.002)), toSvg(e));
    },
    { passive: false },
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
    const sx = drag.start.x - drag.view.x + ((r.width * scale - drag.view.w) / 2);
    const sy = drag.start.y - drag.view.y + ((r.height * scale - drag.view.h) / 2);
    if (!drag.moved && Math.hypot(dx - sx, dy - sy) < 4 * scale) return;
    if (!drag.moved) svg.setPointerCapture(drag.id);
    drag.moved = true;
    setView({ ...drag.view, x: drag.view.x - (dx - sx), y: drag.view.y - (dy - sy) });
  });
  const endDrag = () => {
    if (drag?.moved) {
      // Swallow the click that ends a drag so it doesn't open a node.
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
    setView,
  };
}
