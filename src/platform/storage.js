// Userscript storage is shared between grind75 and neetcode.io, which is how a plan
// made on one site shows up on the other. Swap this file for chrome.storage in an extension.
/* global GM_getValue, GM_setValue */

const hasGM = typeof GM_getValue === "function" && typeof GM_setValue === "function";
const PREFIX = "neetgrind:";

export const storage = {
  get(key, fallback = null) {
    try {
      if (hasGM) return GM_getValue(key, fallback);
      const raw = localStorage.getItem(PREFIX + key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      if (hasGM) GM_setValue(key, value);
      else localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch (err) {
      console.warn("[NeetGrind] storage write failed", key, err);
    }
  },
};
