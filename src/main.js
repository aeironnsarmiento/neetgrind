import { recordCapture } from "./data/neetcodeProgress.js";
import { installNetHook } from "./platform/netHook.js";
import { initGrindPanel } from "./ui/grindPanel.js";
import { initRoadmapPage } from "./ui/roadmapPage.js";

// Runs at document-start so the hook sees NeetCode's first API calls, on every NeetCode page
// (problem pages are where submissions happen).
if (location.hostname === "neetcode.io") installNetHook(recordCapture);

function start() {
  const { hostname, pathname } = location;
  if (hostname.endsWith("techinterviewhandbook.org") && pathname.startsWith("/grind75")) initGrindPanel();
  else if (hostname === "neetcode.io") initRoadmapPage();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
else start();
