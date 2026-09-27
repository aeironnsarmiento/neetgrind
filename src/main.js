import { initGrindPanel } from "./ui/grindPanel.js";
import { initRoadmapPage } from "./ui/roadmapPage.js";

function start() {
  const { hostname, pathname } = location;
  if (hostname.endsWith("techinterviewhandbook.org") && pathname.startsWith("/grind75")) initGrindPanel();
  else if (hostname === "neetcode.io") initRoadmapPage();
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
else start();
