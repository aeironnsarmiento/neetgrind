const SVG_NS = "http://www.w3.org/2000/svg";

function apply(el, props) {
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value == null || value === false) continue;
    if (key === "class") el.setAttribute("class", value);
    else if (key === "style" && typeof value === "object") Object.assign(el.style, value);
    else if (key.startsWith("on") && typeof value === "function") el.addEventListener(key.slice(2), value);
    else if (key in el && !(el instanceof SVGElement)) el[key] = value;
    else el.setAttribute(key, value === true ? "" : value);
  }
}

function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

export function h(tag, props, ...children) {
  const el = document.createElement(tag);
  apply(el, props);
  append(el, children);
  return el;
}

export function s(tag, props, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  apply(el, props);
  append(el, children);
  return el;
}

export function injectStyle(id, css) {
  if (document.getElementById(id)) return;
  document.head.append(h("style", { id }, css));
}

export const DIFF_CLASS = { Easy: "ng-easy", Medium: "ng-medium", Hard: "ng-hard" };

export function formatDate(iso) {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
}

// replaceChildren, but skipping null/false like h() does (the native one renders "null").
export function fill(el, ...children) {
  el.replaceChildren();
  append(el, children);
  return el;
}
