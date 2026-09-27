<p align="center">
  <img src="assets/icon.png" width="112" alt="NeetGrind icon">
</p>

<h1 align="center">NeetGrind</h1>

<p align="center">
  Build a study plan on <a href="https://www.techinterviewhandbook.org/grind75">Grind 75</a>, then follow it on <a href="https://neetcode.io/roadmap">NeetCode's roadmap</a>.
  <br>
  A free, open-source userscript. Solving problems in NeetCode's editor keeps your daily streak going.
</p>

<p align="center">
  <img src="docs/screenshot.png" width="820" alt="NeetGrind plan on NeetCode's roadmap">
</p>

## Features

- **Your plan, NeetCode's graph.** Pick weeks, hours and difficulty on Grind 75. The same questions show up on NeetCode's roadmap, with progress for each topic.
- **Today's questions.** A card above NeetCode's streak calendar shows what to solve today, the week you're in, and whether you're behind.
- **Research-backed order.** The default order starts each topic on its own, then mixes topics together and spaces out reviews. See [how it works](docs/research.md).
- **Your choice of topics.** Turn off topics you don't need (e.g. Bit Manipulation), and their hours go to other questions.
- **Read-only.** NeetGrind reads your NeetCode progress from your browser and never writes to NeetCode.

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/). In Chrome, also turn on **Allow User Scripts** for it (`chrome://extensions` → Tampermonkey → Details).
2. **[Install NeetGrind](https://raw.githubusercontent.com/aeironnsarmiento/neetgrind/main/dist/neetgrind.user.js)**. Tampermonkey opens an install page; click **Install**.

Updates install automatically through Tampermonkey.

## Use

1. **Make a plan.** Open [Grind 75](https://www.techinterviewhandbook.org/grind75) and set your weeks, hours and difficulty. Pick a start date in the **NeetGrind** panel (bottom right) and click **Send to NeetCode**.
2. **Open [neetcode.io/roadmap](https://neetcode.io/roadmap)** and switch **NeetCode → My Plan** (top left).
3. **Solve.** Click **Solve next**, or click a topic to see its questions. Your progress updates as you solve problems on NeetCode.

You can also change weeks, hours, difficulty, order, grouping or topics any time with **Re-plan** on NeetCode.

### Reading the graph

| | Meaning |
|---|---|
| Purple outline | Topic in today's questions |
| Green outline | Topic complete |
| White outline | Topic you clicked |
| `2/6 · W1–4` | 2 of 6 done, scheduled in weeks 1–4 |

Topics with no questions in your plan are hidden.

### Orders

| Order | What you get |
|---|---|
| **Recommended** (default) | Each topic starts with 2–3 easy questions, then comes back later as mixed, spaced review. The last week is fully mixed, like an interview. Review questions show "Review" instead of their topic, so you practise spotting the pattern. |
| Difficulty (Grind 75 default) | Exactly Grind 75's weeks: all Easies, then Mediums, then Hards. |
| Topics (Grind 75) | Grind 75 grouped by its own topics. |
| All rounded | Grind 75's priority order. |
| NeetCode roadmap | One topic at a time, in roadmap order, with no review. |

Every order uses the same questions, chosen by Grind 75. Only when each one comes up changes.

## FAQ

**Does this count toward my NeetCode streak?**
Solving a problem in NeetCode's editor counts. Every NeetGrind link opens the NeetCode problem page. The 15 Grind 75 questions NeetCode doesn't have are marked **LC**, link to LeetCode, and are ticked off inside NeetGrind.

**Does it change my NeetCode account?**
No. NeetGrind only reads the progress NeetCode already stores in your browser.

**Where is my plan stored?**
In Tampermonkey's storage on your machine. That storage is shared between Grind 75 and NeetCode, which is how the plan gets from one to the other.

**It stopped working after a site update.**
Grind 75 and NeetCode are closed source and change without notice. Please [open an issue](https://github.com/aeironnsarmiento/neetgrind/issues).

## Development

```bash
npm install
npm test           # unit tests (tests that need downloaded site data are skipped until you run the next line)
npm run fixtures   # download the live Grind 75 + NeetCode data for tests
npm run build      # → dist/neetgrind.user.js
```

```
src/core/      scheduling logic: Grind 75 scheduler, Recommended order, roadmap graph, topic matching, daily targets
src/data/      site data loaders, saved plan, NeetCode progress reader
src/platform/  storage + HTTP (swap these to port to a browser extension)
src/ui/        Grind 75 panel, NeetCode roadmap view, styles
```

How it works:
- Grind 75's question list is read from its site when the script runs. It isn't bundled, because it has no license.
- Its scheduler is re-implemented and tested against the site's own results.
- NeetCode's problem list is read from its site.
- Questions are matched by LeetCode slug: 154 of 169 match. The other 15 are placed by hand.

Pull requests are welcome. Please run `npm test` and `npm run build` and commit `dist/` with your change.

## Credits

Question selection and time estimates come from [Grind 75](https://www.techinterviewhandbook.org/grind75) by Yangshun Tay. The roadmap graph and problems are from [NeetCode](https://neetcode.io). NeetGrind is not affiliated with either.

## License

[MIT](LICENSE)
