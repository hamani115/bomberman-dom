import { applyEvents } from "./events.js";

const booleanProperties = new Set([
  "checked",
  "disabled",
  "selected",
  "required",
  "autofocus",
  "multiple",
]);

export function elem(tag, attrs = {}, ...children) {
  return {
    tag,
    attrs,
    children: children.flat(Infinity),
  };
}

function applyAttribute(element, name, value) {
  if (value === null || value === undefined) {
    return;
  }

  if (name === "value") {
    element.value = value ?? "";
    return;
  }

  if (booleanProperties.has(name)) {
    element[name] = Boolean(value);
    return;
  }

  element.setAttribute(name, value);
}

export function createDomNode(
  vnode,
  context = {
    focusTarget: null,
  },
) {
  if (vnode === null || vnode === undefined || typeof vnode === "boolean") {
    return document.createTextNode("");
  }

  if (typeof vnode === "string" || typeof vnode === "number") {
    return document.createTextNode(String(vnode));
  }

  const element = document.createElement(vnode.tag);

  for (const [name, value] of Object.entries(vnode.attrs)) {
    if (name === "events") {
      applyEvents(element, value);
      continue;
    }

    if (name === "autofocus" && value) {
      context.focusTarget = element;
    }

    applyAttribute(element, name, value);
  }

  for (const child of vnode.children) {
    const childDomNode = createDomNode(child, context);
    element.appendChild(childDomNode);
  }

  return element;
}

export function render(vnode, containerSelector) {
  const container = document.querySelector(containerSelector);

  if (!container) {
    throw new Error(`Container "${containerSelector}" was not found.`);
  }

  const context = {
    focusTarget: null,
  };

  const domNode = createDomNode(vnode, context);

  container.replaceChildren(domNode);

  if (context.focusTarget) {
    const focusTarget = context.focusTarget;

    focusTarget.focus();

    if (
      typeof focusTarget.setSelectionRange === "function" &&
      typeof focusTarget.value === "string"
    ) {
      const end = focusTarget.value.length;
      focusTarget.setSelectionRange(end, end);
    }
  }
}
