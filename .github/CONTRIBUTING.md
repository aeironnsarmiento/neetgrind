# Contributing

Thanks for helping! NeetGrind is small, so the process is simple.

## How changes get in

1. **Fork** the repo and create a branch.
2. Make your change, then run:
   ```bash
   npm install
   npm run fixtures   # downloads live site data for the full test suite
   npm test
   npm run build      # updates dist/neetgrind.user.js — commit it with your change
   ```
3. **Open a pull request** against `main`.

`main` is protected. Every pull request needs an approving review from the maintainer (see [CODEOWNERS](CODEOWNERS)) before it can be merged. Pushing a new commit dismisses earlier approvals. Direct pushes and force-pushes to `main` are blocked.

## Guidelines

- Keep NeetGrind **read-only** toward NeetCode: no writes to its servers and no use of your login token.
- Don't bundle Grind 75's or NeetCode's data. Load it from the sites when the script runs.
- Put logic in `src/core/` (plain functions, no DOM) and add a test in `test/`.
- For bigger changes, open an issue first so we can agree on the approach.

## Reporting bugs

Open an [issue](https://github.com/aeironnsarmiento/neetgrind/issues) with your browser, Tampermonkey version, and what you saw. Site changes on Grind 75 or NeetCode are the most common cause of breakage.
