// Floating "Send to NeetCode" panel on the Grind 75 page.

import { todayUtcISO } from "../core/daily.js";
import { GROUPING_LABELS, ORDER_LABELS, parseGrindParams, selectQuestions, totalHours } from "../core/scheduler.js";
import { chunkUrlsFromDocument, loadGrindQuestions } from "../data/grindSource.js";
import { createPlan, planStore } from "../data/planStore.js";
import { storage } from "../platform/storage.js";
import { fill, h, injectStyle } from "./dom.js";
import css from "./styles.css";



export function initGrindPanel() {
  injectStyle("neetgrind-style", css);
  let questions = null;
  let loadError = null;
  let lastSearch = null;
  let collapsed = storage.get("grindPanelCollapsed", false);
  // Follow the page's "Order by" / "Group by" until the user picks something else here.
  let orderPicked = false;
  let groupingPicked = false;

  const orderSelect = h(
    "select",
    { class: "ng-input", onchange: () => ((orderPicked = true), render()) },
    Object.entries(ORDER_LABELS).map(([value, label]) => h("option", { value }, label)),
  );
  const groupingSelect = h(
    "select",
    { class: "ng-input", onchange: () => ((groupingPicked = true), render()) },
    Object.entries(GROUPING_LABELS).map(([value, label]) => h("option", { value }, label)),
  );
  const startInput = h("input", { class: "ng-input", type: "date", value: todayUtcISO() });
  const body = h("div", { class: "ng-grind-body" });
  const status = h("div", { class: "ng-status", role: "status" });
  const sendBtn = h("button", { class: "ng-btn ng-btn-primary", onclick: send }, "Send to NeetCode");
  const toggleBtn = h("button", { class: "ng-btn ng-btn-ghost ng-icon-btn", "aria-label": "Collapse", onclick: toggle }, "–");

  const panel = h(
    "section",
    { class: "ng-root ng-grind-panel", "data-theme": "light", "aria-label": "NeetGrind" },
    h("header", { class: "ng-grind-head" }, h("strong", null, "NeetGrind"), h("span", { class: "ng-muted" }, "→ NeetCode roadmap"), toggleBtn),
    h(
      "div",
      { class: "ng-grind-content" },
      body,
      h("div", { class: "ng-grid2" },
        h("label", { class: "ng-field" }, h("span", null, "Order"), orderSelect),
        h("label", { class: "ng-field" }, h("span", null, "Group by"), groupingSelect),
      ),
      h("label", { class: "ng-field" }, h("span", null, "Start date (UTC)"), startInput),
      sendBtn,
      status,
    ),
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
    // Default to Recommended; follow the page only when its "Order by" was changed (it's in the URL).
    const explicitOrder = new URLSearchParams(location.search).get("order");
    if (!orderPicked) orderSelect.value = explicitOrder in ORDER_LABELS ? explicitOrder : "recommended";
    if (!groupingPicked) groupingSelect.value = page.grouping;
    panel.classList.toggle("ng-collapsed", collapsed);
    toggleBtn.textContent = collapsed ? "+" : "–";
    toggleBtn.setAttribute("aria-label", collapsed ? "Expand" : "Collapse");
    const s = settings();
    const diffs = s.difficulty.length === 3 ? "All difficulties" : s.difficulty.join(", ");
    const topics = s.topics ? `${s.topics.length} topics` : "All topics";
    const lines = [h("div", null, `${s.weeks} weeks · ${s.hours} h/week`), h("div", { class: "ng-muted" }, `${diffs} · ${topics}`)];
    const excluded = planStore.load()?.settings?.excludedTopics ?? [];
    if (excluded.length) {
      lines.push(h("div", { class: "ng-muted ng-small" }, `Skipping on NeetCode: ${excluded.join(", ")}. The count there will differ.`));
    }
    if (loadError) lines.push(h("div", { class: "ng-error" }, loadError));
    else if (!questions) lines.push(h("div", { class: "ng-muted" }, "Loading questions…"));
    else {
      const picked = selectQuestions(questions, s);
      lines.push(h("div", { class: "ng-big" }, `${picked.length} questions`, h("span", { class: "ng-muted" }, ` · ~${totalHours(picked)} h`)));
      const shown = document.querySelectorAll('main [role="listitem"], [role="list"] [role="listitem"]').length;
      if (s.mode === "preferences" && shown > 0 && shown !== picked.length) {
        lines.push(h("div", { class: "ng-warn" }, `Page shows ${shown}. Grind 75 may have changed its logic.`));
      }
    }
    fill(body, ...lines);
    sendBtn.disabled = !questions;
  }

  function send() {
    const s = settings();
    // Topic exclusions are made on NeetCode; keep them when a new plan is sent from here.
    const excludedTopics = planStore.load()?.settings?.excludedTopics ?? [];
    planStore.save(createPlan(questions, { ...s, excludedTopics }, startInput.value || todayUtcISO(), "grind75"));
    fill(status,
      excludedTopics.length ? "Saved. " : `Saved ${selectQuestions(questions, s).length} questions. `,
      h("a", { href: "https://neetcode.io/roadmap", target: "_blank", rel: "noopener" }, "Open NeetCode roadmap →"),
    );
  }

  // Grind 75 updates the query string with router.replace, so poll for changes.
  setInterval(() => {
    if (location.search !== lastSearch) {
      lastSearch = location.search;
      fill(status);
      render();
    }
  }, 500);

  render();

  // Chunks can still be loading right after DOMContentLoaded; retry briefly.
  (async () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        questions = await loadGrindQuestions({ urls: chunkUrlsFromDocument() });
        loadError = null;
        break;
      } catch (err) {
        loadError = err.message;
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
    render();
  })();
}
