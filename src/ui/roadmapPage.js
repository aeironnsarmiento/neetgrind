// neetcode.io/roadmap: "NeetCode | My Plan" toggle. My Plan swaps the graph for the custom
// plan graph and the stats card for a plan card. The streak card is left alone.

import { dailyTarget, nextDayTarget, paceSummary, todayUtcISO, utcDay } from "../core/daily.js";
import { indexNeetcode, mapQuestion, problemUrl } from "../core/mapping.js";
import { TOPO_LABELS } from "../core/roadmap.js";
import { bestFrequency, buildSchedule, COMPANY_LIMITS, companySettings, DEFAULT_SETTINGS, DIFFICULTIES, groupQuestions, GROUPING_LABELS, GROUPINGS, ORDER_LABELS, ORDERS, totalHours, withCompanies } from "../core/scheduler.js";
import { buildCompanyPool, CO_REPO_URL, latestVersion, loadCompanyNames, WINDOW_LABELS, WINDOWS } from "../data/companySource.js";
import { GRIND_PAGE, loadGrindQuestions } from "../data/grindSource.js";
import { lcDone, makeIsDone, onProgress } from "../data/neetcodeProgress.js";
import { loadNeetcodeProblems } from "../data/neetcodeSource.js";
import { createPlan, planStore } from "../data/planStore.js";
import { storage } from "../platform/storage.js";
import { DIFF_CLASS, fill, formatDate, h, injectStyle, s as svg } from "./dom.js";
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
    drawer: null, // null | "list" | "replan" | "companyPick"
    graphView: null,
    draft: null, // Re-plan form values, kept while switching to the question picker
    companyNames: null,
    companyUpdate: null, // { sha, date } when GitHub has newer company lists than the plan
    picker: null, // { key, rows, error } company lists for the picker
    pickerQuery: "",
    pickerFiltered: true,
    coWindow: "", // label of the plan's company window, for badge tooltips
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
    const built = buildSchedule(plan.pool, plan.settings, state.ncIndex, plan.version >= 2 ? null : plan.slugs, plan.companyPool);
    return { ...plan, ...built };
  }

  // New plan from new settings. v2 plans carry the whole Grind 75 dataset, so no refetch.
  async function rebuild(patch, startDate) {
    const plan = planStore.load();
    const pool = plan?.version >= 2 ? plan.pool : await loadGrindQuestions();
    const settings = { ...DEFAULT_SETTINGS, ...plan?.settings, ...patch };
    // Company lists are a snapshot; only refetch when the companies or the window change.
    const co = companySettings(settings);
    const old = companySettings(plan?.settings);
    const sameLists = plan?.companyPool && co.window === old.window && co.names.join("\n") === old.names.join("\n");
    const company = sameLists
      ? { companyPool: plan.companyPool, companyVersion: plan.companyVersion }
      : await buildCompanyPool(co.names, co.window);
    if (!sameLists) state.companyUpdate = null;
    planStore.save(createPlan(pool, settings, startDate ?? plan?.startDate ?? todayUtcISO(), plan?.source ?? "neetcode", company));
    storage.set("today", null);
    state.graphView = null;
  }

  // Checks GitHub (at most daily) for newer company lists than the plan's snapshot.
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

  // Swaps in the newer company lists. Same plan id and start date; today's list is recomputed.
  async function applyCompanyUpdate(btn) {
    const plan = planStore.load();
    const co = companySettings(plan.settings);
    btn.disabled = true;
    btn.textContent = "Updating…";
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

  // An empty list means the last attempt failed; opening Re-plan again retries.
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

  // Today's list, cached per UTC day. `ahead` counts days pulled in early with "Start next day".
  function todayList(plan, isDone) {
    const day = todayUtcISO();
    const cached = storage.get("today", null);
    if (cached && cached.planId === plan.id && cached.day === day && cached.order === plan.settings.order) {
      return { slugs: cached.slugs, ahead: cached.ahead ?? 0 };
    }
    const { slugs } = dailyTarget(plan, isDone);
    storage.set("today", { planId: plan.id, day, order: plan.settings.order, slugs, ahead: 0 });
    return { slugs, ahead: 0 };
  }

  function startNextDay(plan, isDone, ahead, slugs) {
    storage.set("today", { planId: plan.id, day: todayUtcISO(), order: plan.settings.order, slugs, ahead: ahead + 1 });
    render();
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
    state.coWindow = sched ? (WINDOW_LABELS[companySettings(sched.settings).window] ?? "") : "";
    const isDone = makeIsDone();
    renderGraph(sched, isDone);
    renderCard(sched, isDone);
    renderDrawer(sched, isDone);
  }

  function renderGraph(sched, isDone) {
    const stats = new Map();
    for (const q of sched?.questions ?? []) {
      const st = stats.get(q.pattern) ?? { total: 0, done: 0, weeks: [], company: 0 };
      st.total += 1;
      st.company += q.companies?.length ? 1 : 0;
      st.done += isDone(q) ? 1 : 0;
      if (!st.weeks.includes(q.week)) st.weeks.push(q.week);
      stats.set(q.pattern, st);
    }
    const bySlug = new Map((sched?.questions ?? []).map((q) => [q.slug, q]));
    const todayTopics = new Set(sched ? todayList(sched, isDone).slugs.map((s) => bySlug.get(s)?.pattern) : []);
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
          sched.companyCount ? h("span", { class: "ng-muted" }, "🏢 3 = company-tagged questions") : null,
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
          h("button", { class: "ng-btn", onclick: () => openReplan(null) }, "Build here"),
        ),
      );
      return;
    }
    const pace = paceSummary(sched, isDone);
    const { pos } = pace;
    const today = todayList(sched, isDone);
    const bySlug = new Map(sched.questions.map((q) => [q.slug, q]));
    const todayQs = today.slugs.map((slug) => bySlug.get(slug)).filter(Boolean);
    const upNext = pos.state !== "not-started" && todayQs.every(isDone) ? nextDayTarget(sched, isDone).slugs : [];
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
        h("button", { class: "ng-btn ng-btn-ghost ng-btn-sm", onclick: () => openReplan(sched) }, "Re-plan"),
      ),
      h("div", { class: "ng-progress", role: "progressbar", "aria-valuemin": 0, "aria-valuemax": pace.total, "aria-valuenow": pace.done },
        h("div", { class: "ng-progress-fill", style: { width: `${(100 * pace.done) / Math.max(1, pace.total)}%` } }),
      ),
      h("div", { class: "ng-card-head ng-small" }, h("span", null, when), h("span", { class: "ng-muted" }, `${pace.done}/${pace.total} done`)),
      h("div", { class: "ng-muted ng-small" },
        pos.state === "not-started" ? `${sched.settings.weeks} wks · ${sched.settings.hours} h/wk` : `This week ${pace.weekDone}/${pace.weekTotal}`,
        pace.overdue ? h("span", { class: "ng-warn-text" }, ` · ${pace.overdue} overdue`) : null,
      ),
      todayQs.length || upNext.length
        ? h("div", { class: "ng-today" },
            h("div", { class: "ng-label" }, today.ahead ? `Today · ${today.ahead} day${today.ahead > 1 ? "s" : ""} ahead` : "Today"),
            todayQs.map((q) => questionRow(q, isDone, { compact: true })),
            upNext.length
              ? h("div", { class: "ng-muted ng-small ng-today-done" },
                  "Done for today · ",
                  h("button", { class: "ng-link", onclick: () => startNextDay(sched, isDone, today.ahead, upNext) }, "Start next day"),
                )
              : null,
          )
        : null,
      h("div", { class: "ng-row" },
        next ? h("a", { class: "ng-btn ng-btn-primary", href: problemUrl(next), target: "_blank", rel: "noopener" }, "Solve next") : null,
        h("button", { class: "ng-btn", onclick: () => { state.selected = null; openDrawer("list"); } }, "All questions"),
      ),
      sched.settings.excludedTopics?.length
        ? h("div", { class: "ng-muted ng-small" },
            `${sched.settings.excludedTopics.length} topic${sched.settings.excludedTopics.length > 1 ? "s" : ""} excluded · `,
            h("button", { class: "ng-link", onclick: () => openReplan(sched) }, "Edit"),
          )
        : null,
      companyLine(sched),
      state.ncSource === "github" ? h("div", { class: "ng-warn-text ng-small" }, "Using GitHub problem data; some links go to LeetCode.") : null,
    );
  }

  function companyLine(sched) {
    const co = companySettings(sched.settings);
    if (!co.names.length && !co.picked.length) return null;
    const names = co.names.length > 2 ? `${co.names.slice(0, 2).join(", ")} +${co.names.length - 2}` : co.names.join(", ");
    const update = state.companyUpdate;
    return h("div", { class: "ng-co-line ng-small" },
      h("div", { class: "ng-muted ng-co-summary" },
        buildingIcon(), `${sched.companyCount} company-tagged · ${names || "picked"} (${WINDOW_LABELS[co.window] ?? co.window})`,
      ),
      update
        ? h("div", { class: "ng-co-update" },
            `Company lists updated${update.date ? ` (${formatDate(update.date.slice(0, 10))})` : ""} · `,
            h("button", { class: "ng-link", onclick: (e) => applyCompanyUpdate(e.currentTarget) }, "Apply"),
          )
        : null,
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
      companyBadge(q),
      q.leetcodeOnly ? h("span", { class: "ng-tag ng-tag-lc", title: "Not on NeetCode; opens LeetCode" }, "LC") : null,
      h("span", { class: `ng-diff ${DIFF_CLASS[q.difficulty]}` }, q.difficulty),
    );
  }

  function buildingIcon() {
    return svg("svg", { class: "ng-co-icon", viewBox: "0 0 16 16", width: 12, height: 12, "aria-hidden": "true" },
      svg("path", { d: "M2 15V2.5L9 1v14M9 6l5 1.5V15M1 15h14M4.5 4.5h2M4.5 7.5h2M4.5 10.5h2M11 9.5h1M11 12h1", fill: "none", stroke: "currentColor", "stroke-width": 1.4, "stroke-linecap": "round", "stroke-linejoin": "round" }),
    );
  }

  // "🏢 Google +2", with every company and its frequency in the tooltip.
  function companyBadge(q, span = state.coWindow) {
    if (!q.companies?.length) return null;
    const title = q.companies.map((t) => `${t.company} · frequency ${Math.round(t.frequency)}`).join("\n");
    return h("span", { class: "ng-tag ng-tag-co", title: `Company-tagged${span ? ` (${span})` : ""}\n${title}` },
      buildingIcon(),
      h("span", { class: "ng-co-name" }, q.companies[0].company),
      q.companies.length > 1 ? ` +${q.companies.length - 1}` : null,
    );
  }

  function renderDrawer(sched, isDone) {
    ui.drawer.classList.toggle("ng-open", Boolean(state.drawer));
    if (!state.drawer) return fill(ui.drawer);
    const close = h("button", { class: "ng-btn ng-btn-ghost ng-icon-btn", "aria-label": "Close", onclick: closeDrawer }, "✕");
    if (state.drawer === "replan") return fill(ui.drawer, replanForm(sched, close));
    if (state.drawer === "companyPick") return fill(ui.drawer, companyPicker(sched, close));
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

  // Form values live in state.draft, so they survive re-renders and a trip to the question picker.
  function replanForm(sched, close) {
    const d = (state.draft ??= draftFrom(sched));
    const co = d.company;
    const bind = (el, fn) => (el.addEventListener("input", () => fn(el)), el);
    const weeks = bind(h("input", { class: "ng-input", type: "number", min: 1, max: 26, value: d.weeks }), (el) => (d.weeks = el.value));
    const hours = bind(h("input", { class: "ng-input", type: "number", min: 1, max: 40, value: d.hours }), (el) => (d.hours = el.value));
    const diffs = DIFFICULTIES.map((v) =>
      h("input", { type: "checkbox", value: v, checked: d.difficulty.includes(v), onchange: () => (d.difficulty = diffs.filter((cb) => cb.checked).map((cb) => cb.value)) }),
    );
    const order = h("select", { class: "ng-input", onchange: () => (d.order = order.value) }, ORDERS.map((o) => h("option", { value: o, selected: o === d.order }, ORDER_LABELS[o])));
    const grouping = h("select", { class: "ng-input", onchange: () => (d.grouping = grouping.value) }, GROUPINGS.map((g) => h("option", { value: g, selected: g === (d.grouping ?? "weeks") }, GROUPING_LABELS[g])));
    const start = bind(h("input", { class: "ng-input", type: "date", value: d.startDate }), (el) => (d.startDate = el.value));
    const excluded = new Set(d.excludedTopics ?? []);
    const topicBoxes = TOPO_LABELS.map((t) =>
      h("input", { type: "checkbox", value: t, checked: !excluded.has(t), onchange: () => (d.excludedTopics = topicBoxes.filter((cb) => !cb.checked).map((cb) => cb.value)) }),
    );
    const setAllTopics = (on) => {
      topicBoxes.forEach((cb) => (cb.checked = on));
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
          share: Math.min(100, Math.max(1, Math.round(+co.share || 50))),
        },
      };
      submit.disabled = true;
      fill(status, co.names.length ? "Loading company lists…" : "Building plan…");
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
          h("button", { type: "button", class: "ng-link", onclick: () => setAllTopics(true) }, "All"),
          h("button", { type: "button", class: "ng-link", onclick: () => setAllTopics(false) }, "None"),
        ),
      ),
      companyFields(co),
      h("p", { class: "ng-muted ng-small" }, "Company questions are picked first, then Grind 75 fills the hours left. Hours from turned-off topics go to other questions. Grind 75's own topic filter is kept."),
      h("div", { class: "ng-row" },
        submit,
        h("a", { class: "ng-btn ng-btn-ghost", target: "_blank", rel: "noopener", onclick: (e) => (e.currentTarget.href = grindLink()), href: GRIND_PAGE }, "Preview on Grind 75"),
      ),
      status,
    );
  }

  function companyFields(co) {
    const names = state.companyNames;
    // Native dropdown of every company in the source repo; type a letter to jump. Chosen ones are left out.
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
        },
      },
      h("option", { value: "", selected: true },
        !names ? "Loading companies…" : names.length ? `Add a company (${available.length} available)…` : "Couldn't load companies",
      ),
      available.map((n) => h("option", { value: n }, n)),
    );
    const windowSelect = h("select", { class: "ng-input", onchange: (e) => (co.window = e.target.value) },
      Object.keys(WINDOWS).map((w) => h("option", { value: w, selected: w === co.window }, WINDOW_LABELS[w])),
    );
    const limitSelect = h("select", { class: "ng-input", onchange: (e) => ((co.limit = e.target.value), render()) },
      Object.entries(COMPANY_LIMITS).map(([v, label]) => h("option", { value: v, selected: v === co.limit }, label)),
    );
    const share = co.limit === "share";
    const amount = h("input", {
      class: "ng-input",
      type: "number",
      min: 1,
      max: share ? 100 : 500,
      value: share ? co.share : co.count,
      oninput: (e) => (share ? (co.share = e.target.value) : (co.count = e.target.value)),
    });
    return h("fieldset", { class: "ng-field" },
      h("legend", null, "Company tags"),
      h("div", { class: "ng-row ng-co-chips" },
        co.names.map((n) =>
          h("span", { class: "ng-chip" }, n,
            h("button", { type: "button", class: "ng-chip-x", "aria-label": `Remove ${n}`, onclick: () => ((co.names = co.names.filter((x) => x !== n)), render()) }, "✕"),
          ),
        ),
        co.names.length ? null : h("span", { class: "ng-muted ng-small" }, "None. Add companies you're interviewing with."),
      ),
      picker,
      h("div", { class: "ng-grid2" },
        h("label", { class: "ng-field" }, h("span", null, "Asked in the last"), windowSelect),
        h("label", { class: "ng-field" }, h("span", null, "How many"), limitSelect),
      ),
      h("label", { class: "ng-field" }, h("span", null, share ? "% of your hours" : "Questions per company"), amount),
      h("div", { class: "ng-row" },
        h("button", {
          type: "button",
          class: "ng-btn",
          disabled: !co.names.length,
          onclick: () => ((state.drawer = "companyPick"), render(), ui.drawer.querySelector(".ng-co-search")?.focus()),
        }, "Choose questions…"),
        h("span", { class: "ng-muted ng-small" }, co.picked.length ? `${co.picked.length} picked, always included` : "Optional"),
      ),
      h("p", { class: "ng-muted ng-small" },
        "Lists from ", h("a", { href: CO_REPO_URL, target: "_blank", rel: "noopener" }, "leetcode-company-wise-problems"), ", checked daily for updates.",
      ),
    );
  }

  // Hand-pick company questions. Picks are always in the plan, whatever the filters.
  function companyPicker(sched, close) {
    const d = (state.draft ??= draftFrom(sched));
    const co = d.company;
    const key = `${co.window}|${co.names.join("\n")}`;
    if (state.picker?.key !== key) {
      state.picker = { key, rows: null, error: null };
      buildCompanyPool(co.names, co.window)
        .then(({ companyPool }) => state.picker.key === key && (state.picker.rows = companyPool))
        .catch((err) => state.picker.key === key && (state.picker.error = err.message))
        .finally(() => state.drawer === "companyPick" && render());
    }
    const back = h("button", { class: "ng-btn ng-btn-ghost", onclick: () => ((state.drawer = "replan"), render()) }, "← Back");
    const head = (sub) =>
      h("header", { class: "ng-drawer-head" },
        h("div", null, h("div", { class: "ng-card-title" }, "Choose company questions"), h("div", { class: "ng-muted ng-small" }, sub)),
        close,
      );
    const { rows, error } = state.picker;
    if (!rows) return h("div", { class: "ng-form" }, head(error ? `Failed: ${error}` : "Loading lists…"), back);

    const grind = (sched?.pool ?? planStore.load()?.pool ?? []).map((q) => mapQuestion(q, state.ncIndex));
    const tagged = withCompanies(grind, rows, state.ncIndex);
    const all = [...tagged.grind.filter((q) => q.companies), ...tagged.extra].sort((a, b) => bestFrequency(b) - bestFrequency(a));
    const picked = new Set(co.picked);
    const count = h("div", { class: "ng-muted ng-small" });
    const setCount = () => fill(count, `${picked.size} picked · ${co.names.join(", ")} · ${WINDOW_LABELS[co.window]}`);
    const list = h("div", { class: "ng-groups" });
    const LIMIT = 200;

    function renderList() {
      const query = state.pickerQuery.trim().toLowerCase();
      const diffs = new Set(d.difficulty);
      const excluded = new Set(d.excludedTopics ?? []);
      const shown = all.filter(
        (q) =>
          (picked.has(q.slug) || !state.pickerFiltered || (diffs.has(q.difficulty) && !excluded.has(q.pattern))) &&
          (!query || `${q.ncTitle ?? q.title} ${q.pattern} ${q.slug}`.toLowerCase().includes(query)),
      );
      fill(list,
        shown.slice(0, LIMIT).map((q) =>
          h("label", { class: "ng-q ng-pick" },
            h("input", {
              type: "checkbox",
              class: "ng-check",
              checked: picked.has(q.slug),
              onchange: (e) => {
                if (e.target.checked) picked.add(q.slug);
                else picked.delete(q.slug);
                co.picked = [...picked];
                setCount();
              },
            }),
            h("span", { class: "ng-q-title" }, q.ncTitle ?? q.title),
            h("span", { class: "ng-freq", title: `Frequency ${Math.round(bestFrequency(q))}` }, h("i", { style: { width: `${Math.min(100, bestFrequency(q))}%` } })),
            h("span", { class: "ng-tag" }, q.pattern),
            companyBadge(q, WINDOW_LABELS[co.window]),
            h("span", { class: `ng-diff ${DIFF_CLASS[q.difficulty]}` }, q.difficulty),
          ),
        ),
        shown.length > LIMIT ? h("div", { class: "ng-muted ng-small" }, `Showing ${LIMIT} of ${shown.length}. Search to narrow.`) : null,
        shown.length ? null : h("div", { class: "ng-muted ng-small" }, "No questions match."),
      );
    }
    setCount();
    renderList();

    return h("div", { class: "ng-form" },
      head(""),
      count,
      h("input", {
        class: "ng-input ng-co-search",
        type: "search",
        placeholder: "Search questions or topics…",
        value: state.pickerQuery,
        oninput: (e) => ((state.pickerQuery = e.target.value), renderList()),
      }),
      h("label", { class: "ng-check-label" },
        h("input", { type: "checkbox", checked: state.pickerFiltered, onchange: (e) => ((state.pickerFiltered = e.target.checked), renderList()) }),
        "Only the plan's difficulties and topics",
      ),
      h("div", { class: "ng-row" },
        back,
        h("button", { class: "ng-btn ng-btn-ghost", onclick: () => ((co.picked = []), picked.clear(), setCount(), renderList()) }, "Clear picks"),
      ),
      list,
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

  // Progress comes from NeetCode's API calls (this tab) and localStorage/GM storage (other tabs);
  // refresh when either may have changed.
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
