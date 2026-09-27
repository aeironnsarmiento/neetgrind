# NeetGrind

Build a custom study plan with [Grind 75](https://www.techinterviewhandbook.org/grind75)'s scheduler (weeks × hours/week × difficulty), then work through it on [NeetCode's roadmap](https://neetcode.io/roadmap) graph. Problems link to NeetCode's editor, so solving them counts toward your NeetCode daily streak.

Tampermonkey userscript (proof of concept). The core is written to port to a Chrome/Firefox extension later.

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/). In Chrome, also turn on **Allow User Scripts** for Tampermonkey (chrome://extensions → Tampermonkey → Details).
2. `npm install && npm run build`
3. Tampermonkey dashboard → **Utilities** → **Import from file** → `dist/neetgrind.user.js` (or drag the file into the dashboard).

## Use

1. On Grind 75, set weeks, hours and difficulty as usual. A **NeetGrind** panel (bottom right) shows the same question count as the page.
2. Choose a start date (order and grouping default to the page's), then **Send to NeetCode**.
3. On neetcode.io/roadmap, switch **NeetCode → My Plan** (top left of the graph).
   - Graph: same 18 topics and edges as NeetCode. Each node shows done/total and which weeks it falls in. The current week's nodes are outlined. Topics with no questions in your plan are hidden, and the edges are joined up around them.
   - **My Plan** card (above the streak calendar): the current week, pace, today's questions, and **Solve next**.
   - Click a node or **All questions** to see the list. Group it by **Weeks**, **Topics**, **Difficulty** or **None**, the same choices as Grind 75.
   - **Re-plan** changes weeks, hours, difficulty, order, grouping or start date without going back to Grind 75.

### Defaults: same as Grind 75

- **Based on preferences, order by difficulty, grouped by week**, the same as Grind 75's page, so your weeks on NeetCode hold exactly the questions Grind 75 shows.
- The panel's **Order** and **Group by** follow the page's dropdowns until you pick something else in the panel.
- **NeetCode roadmap** order is optional. It keeps the same questions but sorts them along NeetCode's prerequisite graph (Arrays & Hashing → … → Math & Geometry, easiest first within each topic), so each week covers one area of the graph.
- The graph is always organized by topic, since each node is a topic. Grouping only changes how the question list is organized.

## How it works

- **Grind 75 data**: loaded at runtime from the site's own JS chunk. It isn't bundled, because the dataset has no license. The scheduler is a reimplementation of Grind 75's own: a greedy pick in priority order, 1.96 × duration per question, then packing into weeks. Tests check it against the site's counts (8w×8h → 75, 4×8 → 41, 26×40 → 169).
- **NeetCode data**: the problem list is parsed from neetcode.io's main bundle, with no `eval`. If that fails, it falls back to `neetcode-gh/leetcode`'s `.problemSiteData.json`.
- **Matching**: joined on LeetCode slug; 154 of 169 match. The other 15 are placed under the closest topic by hand (`src/core/mapping.js`), marked **LC**, and link to LeetCode. You tick those off locally.
- **Progress**: read-only, from NeetCode's localStorage (`synced-progress-cache` when signed in, `completed-problem-list` when signed out). NeetGrind never writes to NeetCode's servers.
- **Days** are UTC, like NeetCode's streak. Today's list is fixed for the day once it's computed, so finishing problems doesn't add more.
- **Storage**: Tampermonkey's `GM_getValue`/`GM_setValue`. This storage is shared across both sites, which is how a plan made on Grind 75 reaches NeetCode.

## Develop

```
npm test           # scheduler/mapping/daily tests (fixture tests skip without fixtures)
npm run fixtures   # download live Grind 75 + NeetCode bundles into test/fixtures/
npm run build      # dist/neetgrind.user.js
```

```
src/core/      pure logic: scheduler, roadmap graph, slug mapping, daily targets
src/data/      site data loaders, plan store, NeetCode progress reader
src/platform/  storage + HTTP (swap for chrome.storage / fetch in an extension)
src/ui/        Grind 75 panel, NeetCode roadmap toggle, SVG graph, styles
```

## Limits

- Both sites are closed source. Their hashed bundles and DOM (`app-graph`, `.right-sidebar`, `.stats-section`) can change without notice. Loaders find data by content signature, not file name, but a big redesign will need selector updates.
- Streak credit is decided by NeetCode's server. Submitting in NeetCode's editor appears to count; whether ticking the checkbox counts wasn't verified.
- Grind 75 topic filters carry over from its URL. Re-plan on NeetCode doesn't edit them.
