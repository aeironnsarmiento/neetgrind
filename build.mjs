import { build } from "esbuild";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

const header = `// ==UserScript==
// @name         NeetGrind: Grind 75 plans on NeetCode's roadmap
// @namespace    https://github.com/aeironnsarmiento/neetgrind
// @homepageURL  https://github.com/aeironnsarmiento/neetgrind
// @supportURL   https://github.com/aeironnsarmiento/neetgrind/issues
// @downloadURL  https://raw.githubusercontent.com/aeironnsarmiento/neetgrind/main/dist/neetgrind.user.js
// @updateURL    https://raw.githubusercontent.com/aeironnsarmiento/neetgrind/main/dist/neetgrind.user.js
// @license      MIT
// @icon         https://raw.githubusercontent.com/aeironnsarmiento/neetgrind/main/assets/icon-64.png
// @version      ${pkg.version}
// @description  ${pkg.description}
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
`;

await build({
  entryPoints: ["src/main.js"],
  bundle: true,
  format: "iife",
  target: "chrome110",
  loader: { ".css": "text" },
  banner: { js: header },
  outfile: "dist/neetgrind.user.js",
  logLevel: "info",
});
