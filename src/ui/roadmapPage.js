// neetcode.io/roadmap: "NeetCode | My Plan" toggle. My Plan swaps the graph for the custom
// plan graph and the stats card for a plan card. The streak card is left alone.

import { dailyTarget, paceSummary, todayUtcISO, utcDay } from "../core/daily.js";
import { indexNeetcode, problemUrl } from "../core/mapping.js";
import { TOPO_LABELS } from "../core/roadmap.js";
import { buildSchedule, DEFAULT_SETTINGS, DIFFICULTIES, groupQuestions, GROUPING_LABELS, GROUPINGS, ORDER_LABELS, ORDERS, totalHours } from "../core/scheduler.js";
import { GRIND_PAGE, loadGrindQuestions } from "../data/grindSource.js";
import { lcDone, makeIsDone } from "../data/neetcodeProgress.js";
import { loadNeetcodeProblems } from "../data/neetcodeSource.js";
import { createPlan, planStore } from "../data/planStore.js";
import { storage } from "../platform/storage.js";
import { DIFF_CLASS, fill, formatDate, h, injectStyle } from "./dom.js";
import { renderPlanGraph } from "./planGraph.js";
import css from "./styles.css";


export function initRoadmapPage() {
  injectStyle("neetgrind-style", css);
  const ui = {}; // mounted elements
  const state = {
    mode: storage.get("mode", "neetcode"),
    ncIndex: null,
    ncSource: null,
    loadError: null,
    selected: null,
    drawer: null, // null | "list" | "replan"
    graphView: null,
  };

  // --- data -------------------------------------------------------------------------------
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
    const built = buildSchedule(plan.pool, plan.settings, state.ncIndex, plan.version >= 2 ? null : plan.slugs);
    return { ...plan, ...built };
  }

  // New plan from new settings. v2 plans carry the whole Grind 75 dataset, so no refetch.
  async function rebuild(patch, startDate) {
    const plan = planStore.load();
    const pool = plan?.version >= 2 ? plan.pool : await loadGrindQuestions();
    const settings = { ...DEFAULT_SETTINGS, ...plan?.settings, ...patch };
    planStore.save(createPlan(pool, settings, startDate ?? plan?.startDate ?? todayUtcISO(), plan?.source ?? "neetcode"));
    storage.set("today", null);
    state.graphView = null;
  }

  function todaySlugs(plan, isDone) {
    const day = todayUtcISO();
    const cached = storage.get("today", null);
    if (cached && cached.planId === plan.id && cached.day === day && cached.order === plan.settings.order) return cached.slugs;
    const { slugs } = dailyTarget(plan, isDone);
    storage.set("today", { planId: plan.id, day, order: plan.settings.order, slugs });
    return slugs;
  }

  // --- mounting -----------------------------------------------------------------------------
  function findHost() {
    const graph = document.querySelector("app-graph");
    if (!graph) return null;
    return {
      graph,
      card: graph.closest(".graph-card") ?? graph.parentElement,
      zoomControls: document.querySelector(".graph-grid > .absolute.bottom-4"),
      stats: document.querySelector(".right-sidebar .stats-section"),
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
      h("button", { class: "ng-seg", "data-mode": "plan", onclick: () => setMode("plan") }, "My Plan"),
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

  // --- render --------------------------------------------------------------------------------
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
    const isDone = makeIsDone();
    renderGraph(sched, isDone);
    renderCard(sched, isDone);
    renderDrawer(sched, isDone);
  }

  function renderGraph(sched, isDone) {
    const stats = new Map();
    for (const q of sched?.questions ?? []) {
      const st = stats.get(q.pattern) ?? { total: 0, done: 0, weeks: [] };
      st.total += 1;
      st.done += isDone(q) ? 1 : 0;
      if (!st.weeks.includes(q.week)) st.weeks.push(q.week);
      stats.set(q.pattern, st);
    }
    const bySlug = new Map((sched?.questions ?? []).map((q) => [q.slug, q]));
    const todayTopics = new Set(sched ? todaySlugs(sched, isDone).map((s) => bySlug.get(s)?.pattern) : []);
    const graph = renderPlanGraph({
      stats,
      focus: todayTopics,
      selected: state.selected,
      onSelect: (label) => {
        state.selected = label;
        state.drawer = "list";
        render();
      },
    });
    if (state.graphView) graph.setView(state.graphView);
    const keepView = () => (state.graphView = graph.getView());
    graph.svg.addEventListener("pointerup", keepView);
    graph.svg.addEventListener("wheel", keepView, { passive: true });
    const zoomBtn = (label, text, fn) =>
      h("button", { class: "ng-zoom-btn", "aria-label": label, onclick: () => (fn(), keepView()) }, text);
    const controls = h(
      "div",
      { class: "ng-zoom" },
      zoomBtn("Zoom in", "+", graph.zoomIn),
      zoomBtn("Zoom out", "−", graph.zoomOut),
      zoomBtn("Fit", "⤢", () => (graph.reset(), (state.graphView = null))),
    );
    const empty = !sched
      ? h("div", { class: "ng-graph-empty" }, state.loadError ?? (state.ncIndex ? "No plan yet. Create one from the card on the right." : "Loading NeetCode problems…"))
      : null;
    const legend = sched
      ? h("div", { class: "ng-legend", "aria-label": "Legend" },
          h("span", null, h("i", { class: "ng-swatch ng-swatch-today" }), "Today's topics"),
          h("span", null, h("i", { class: "ng-swatch ng-swatch-complete" }), "Complete"),
          h("span", null, h("i", { class: "ng-swatch ng-swatch-selected" }), "Selected"),
          h("span", { class: "ng-muted" }, "W2–4 = weeks it's scheduled"),
        )
      : null;
    fill(ui.graphHost, graph.svg, controls, legend, empty);
    placeCard();
  }

  // Above the streak card when NeetCode shows its sidebar; floating over the graph otherwise (mobile).
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
      fill(ui.card, 
        h("div", { class: "ng-card-title" }, "My Plan"),
        h("p", { class: "ng-muted" }, "Pick weeks, hours and difficulty on Grind 75, then press “Send to NeetCode”. Or build one here."),
        h("div", { class: "ng-row" },
          h("a", { class: "ng-btn ng-btn-primary", href: GRIND_PAGE, target: "_blank", rel: "noopener" }, "Open Grind 75"),
          h("button", { class: "ng-btn", onclick: () => openDrawer("replan") }, "Build here"),
        ),
      );
      return;
    }
    const pace = paceSummary(sched, isDone);
    const { pos } = pace;
    const today = todaySlugs(sched, isDone);
    const bySlug = new Map(sched.questions.map((q) => [q.slug, q]));
    const todayQs = today.map((slug) => bySlug.get(slug)).filter(Boolean);
    const next = todayQs.find((q) => !isDone(q)) ?? sched.questions.find((q) => q.week <= pos.week && !isDone(q)) ?? sched.questions.find((q) => !isDone(q));

    const when =
      pos.state === "not-started"
        ? `Starts ${formatDate(sched.startDate)} (in ${pos.daysUntilStart}d)`
        : pos.state === "overtime"
          ? `Plan ended · ${pace.total - pace.done} left`
          : `Week ${pos.week} of ${pos.weeks} · Day ${pos.dayOfWeek}`;

    fill(ui.card, 
      h("div", { class: "ng-card-head" },
        h("div", { class: "ng-card-title" }, "My Plan"),
        h("button", { class: "ng-btn ng-btn-ghost ng-btn-sm", onclick: () => openDrawer("replan") }, "Re-plan"),
      ),
      h("div", { class: "ng-progress", role: "progressbar", "aria-valuemin": 0, "aria-valuemax": pace.total, "aria-valuenow": pace.done },
        h("div", { class: "ng-progress-fill", style: { width: `${(100 * pace.done) / Math.max(1, pace.total)}%` } }),
      ),
      h("div", { class: "ng-card-head ng-small" }, h("span", null, when), h("span", { class: "ng-muted" }, `${pace.done}/${pace.total} done`)),
      h("div", { class: "ng-muted ng-small" },
        pos.state === "not-started" ? `${sched.settings.weeks} wks · ${sched.settings.hours} h/wk` : `This week ${pace.weekDone}/${pace.weekTotal}`,
        pace.overdue ? h("span", { class: "ng-warn-text" }, ` · ${pace.overdue} overdue`) : null,
      ),
      todayQs.length
        ? h("div", { class: "ng-today" },
            h("div", { class: "ng-label" }, "Today"),
            todayQs.map((q) => questionRow(q, isDone, { compact: true })),
          )
        : null,
      h("div", { class: "ng-row" },
        next ? h("a", { class: "ng-btn ng-btn-primary", href: problemUrl(next), target: "_blank", rel: "noopener" }, "Solve next") : null,
        h("button", { class: "ng-btn", onclick: () => { state.selected = null; openDrawer("list"); } }, "All questions"),
      ),
      sched.settings.excludedTopics?.length
        ? h("div", { class: "ng-muted ng-small" },
            `${sched.settings.excludedTopics.length} topic${sched.settings.excludedTopics.length > 1 ? "s" : ""} excluded · `,
            h("button", { class: "ng-link", onclick: () => openDrawer("replan") }, "Edit"),
          )
        : null,
      state.ncSource === "github" ? h("div", { class: "ng-warn-text ng-small" }, "Using GitHub problem data; some links go to LeetCode.") : null,
    );
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
    const status = q.leetcodeOnly
      ? h("input", {
          type: "checkbox",
          class: "ng-check",
          checked: done,
          "aria-label": `Mark ${q.title} done (LeetCode only)`,
          onchange: () => (lcDone.toggle(q.slug), render()),
        })
      : h("span", { class: `ng-dot ${done ? "ng-dot-done" : ""}`, title: done ? "Completed on NeetCode" : "Not completed on NeetCode" }, done ? "✓" : "");
    return h(
      "div",
      { class: `ng-q ${done ? "ng-q-done" : ""}` },
      status,
      h("a", { class: "ng-q-title", href: problemUrl(q), target: "_blank", rel: "noopener" }, q.ncTitle ?? q.title),
      compact ? null : h("span", { class: "ng-muted ng-small" }, `${q.duration}m`),
      tag ? h("span", { class: "ng-tag" }, tag) : null,
      q.leetcodeOnly ? h("span", { class: "ng-tag ng-tag-lc", title: "Not on NeetCode; opens LeetCode" }, "LC") : null,
      h("span", { class: `ng-diff ${DIFF_CLASS[q.difficulty]}` }, q.difficulty),
    );
  }

  function renderDrawer(sched, isDone) {
    ui.drawer.classList.toggle("ng-open", Boolean(state.drawer));
    if (!state.drawer) return fill(ui.drawer);
    const close = h("button", { class: "ng-btn ng-btn-ghost ng-icon-btn", "aria-label": "Close", onclick: closeDrawer }, "✕");
    if (state.drawer === "replan") return fill(ui.drawer, replanForm(sched, close));
    if (!sched) return closeDrawer();

    const grouping = sched.settings.grouping ?? "weeks";
    const qs = state.selected ? sched.questions.filter((q) => q.pattern === state.selected) : sched.questions;
    const current = paceSummary(sched, isDone).pos.week;
    const groups = groupQuestions(qs, grouping);
    // Tag each row with whatever the grouping and topic filter don't already show.
    // Review questions (Recommended order) hide their topic so you have to spot the pattern.
    // Topic grouping or a clicked topic already reveals it, so only the week is shown there.
    const tagFor = (q) => {
      if (grouping === "topics" || state.selected) return grouping === "weeks" ? null : `W${q.week}`;
      const topic = q.review ? "Review" : q.pattern;
      return grouping === "weeks" ? topic : `${topic} · W${q.week}`;
    };
    const setGrouping = (g) => {
      planStore.update({ settings: { ...sched.settings, grouping: g } });
      render();
    };
    const doneIn = (list) => list.filter(isDone).length;
    fill(ui.drawer, 
      h("header", { class: "ng-drawer-head" },
        h("div", null,
          h("div", { class: "ng-card-title" }, state.selected ?? "All questions"),
          h("div", { class: "ng-muted ng-small" }, `${doneIn(qs)}/${qs.length} done · ~${totalHours(qs)} h`),
        ),
        close,
      ),
      h("div", { class: "ng-row" },
        h("div", { class: "ng-toggle ng-toggle-inline", role: "group", "aria-label": "Group by" },
          GROUPINGS.map((g) =>
            h("button", { class: "ng-seg", "aria-pressed": String(grouping === g), onclick: () => setGrouping(g) }, GROUPING_LABELS[g]),
          ),
        ),
        state.selected ? h("button", { class: "ng-btn ng-btn-ghost", onclick: () => { state.selected = null; render(); } }, "Show all topics") : null,
        state.selected
          ? h("button", {
              class: "ng-btn ng-btn-ghost ng-danger",
              title: "Leave this topic out. Its hours go to other questions; turn it back on in Re-plan.",
              onclick: async () => {
                await rebuild({ excludedTopics: [...(sched.settings.excludedTopics ?? []), state.selected] });
                state.selected = null;
                state.drawer = null;
                render();
              },
            }, "Remove topic from plan")
          : null,
      ),
      h("div", { class: "ng-groups" },
        groups.map(({ name, questions: list }) =>
          h("details", { class: "ng-group", open: grouping !== "weeks" || Boolean(state.selected) || name === `Week ${current}` },
            h("summary", null, h("span", null, name), h("span", { class: "ng-muted ng-small" }, `${doneIn(list)}/${list.length}`)),
            list.map((q) => questionRow(q, isDone, { tag: tagFor(q) })),
          ),
        ),
      ),
    );
  }

  function replanForm(sched, close) {
    const s = sched?.settings ?? DEFAULT_SETTINGS;
    const weeks = h("input", { class: "ng-input", type: "number", min: 1, max: 26, value: s.weeks });
    const hours = h("input", { class: "ng-input", type: "number", min: 1, max: 40, value: s.hours });
    const diffs = DIFFICULTIES.map((d) => h("input", { type: "checkbox", value: d, checked: s.difficulty.includes(d) }));
    const order = h("select", { class: "ng-input" }, ORDERS.map((o) => h("option", { value: o, selected: o === s.order }, ORDER_LABELS[o])));
    const grouping = h("select", { class: "ng-input" }, GROUPINGS.map((g) => h("option", { value: g, selected: g === (s.grouping ?? "weeks") }, GROUPING_LABELS[g])));
    const start = h("input", { class: "ng-input", type: "date", value: sched?.startDate ?? todayUtcISO() });
    const excluded = new Set(s.excludedTopics ?? []);
    const topicBoxes = TOPO_LABELS.map((t) => h("input", { type: "checkbox", value: t, checked: !excluded.has(t) }));
    const status = h("div", { class: "ng-status", role: "status" });
    const submit = h("button", { class: "ng-btn ng-btn-primary", type: "submit" }, sched ? "Rebuild plan" : "Create plan");

    const grindLink = () => {
      const p = new URLSearchParams({ weeks: weeks.value, hours: hours.value });
      for (const cb of diffs) if (cb.checked) p.append("difficulty", cb.value);
      if (["difficulty", "topics", "all_rounded"].includes(order.value)) p.set("order", order.value);
      p.set("grouping", grouping.value);
      return `${GRIND_PAGE}?${p}`;
    };

    async function onSubmit(e) {
      e.preventDefault();
      const difficulty = diffs.filter((cb) => cb.checked).map((cb) => cb.value);
      if (!difficulty.length) return fill(status, "Pick at least one difficulty.");
      const excludedTopics = topicBoxes.filter((cb) => !cb.checked).map((cb) => cb.value);
      if (excludedTopics.length === topicBoxes.length) return fill(status, "Keep at least one topic.");
      const settings = {
        ...s,
        weeks: Math.min(26, Math.max(1, Math.round(+weeks.value || 8))),
        hours: Math.min(40, Math.max(1, Math.round(+hours.value || 8))),
        difficulty,
        order: order.value,
        grouping: grouping.value,
        excludedTopics,
        mode: "preferences",
      };
      submit.disabled = true;
      fill(status, "Building plan…");
      try {
        await rebuild(settings, start.value || todayUtcISO());
        state.drawer = null;
        state.selected = null;
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
      h("div", { class: "ng-grid2" },
        h("label", { class: "ng-field" }, h("span", null, "Weeks"), weeks),
        h("label", { class: "ng-field" }, h("span", null, "Hours / week"), hours),
      ),
      h("fieldset", { class: "ng-field" },
        h("legend", null, "Difficulty"),
        h("div", { class: "ng-row" }, diffs.map((cb) => h("label", { class: "ng-check-label" }, cb, cb.value))),
      ),
      h("div", { class: "ng-grid2" },
        h("label", { class: "ng-field" }, h("span", null, "Order"), order),
        h("label", { class: "ng-field" }, h("span", null, "Group by"), grouping),
      ),
      h("label", { class: "ng-field" }, h("span", null, "Start date (UTC)"), start),
      h("fieldset", { class: "ng-field" },
        h("legend", null, "NeetCode topics"),
        h("div", { class: "ng-topic-grid" }, topicBoxes.map((cb) => h("label", { class: "ng-check-label" }, cb, cb.value))),
        h("div", { class: "ng-row" },
          h("button", { type: "button", class: "ng-link", onclick: () => topicBoxes.forEach((cb) => (cb.checked = true)) }, "All"),
          h("button", { type: "button", class: "ng-link", onclick: () => topicBoxes.forEach((cb) => (cb.checked = false)) }, "None"),
        ),
      ),
      h("p", { class: "ng-muted ng-small" }, "Uses Grind 75's question selection. Hours from turned-off topics go to other questions. Grind 75's own topic filter is kept."),
      h("div", { class: "ng-row" },
        submit,
        h("a", { class: "ng-btn ng-btn-ghost", target: "_blank", rel: "noopener", onclick: (e) => (e.currentTarget.href = grindLink()), href: GRIND_PAGE }, "Preview on Grind 75"),
      ),
      status,
    );
  }

  // --- lifecycle -----------------------------------------------------------------------------
  let lastDay = utcDay(new Date());
  function tick() {
    if (!location.pathname.startsWith("/roadmap")) {
      if (ui.toggle) unmount();
      return;
    }
    if (!mounted() || !ui.host.graph.isConnected) mount();
    const day = utcDay(new Date());
    if (day !== lastDay) {
      lastDay = day;
      render();
    }
  }
  setInterval(tick, 400);
  tick();

  // Progress lives in NeetCode's localStorage; refresh when it may have changed.
  window.addEventListener("focus", render);
  window.addEventListener("storage", render);
  window.addEventListener("resize", () => mounted() && state.mode === "plan" && placeCard());
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && state.drawer) closeDrawer();
  });
  loadNc();
}
