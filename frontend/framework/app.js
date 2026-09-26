import { render } from "./dom.js";

export function createApp({ root, store, view }) {
  if (!root) {
    throw new Error("App requires a root selector.");
  }

  if (!store) {
    throw new Error("App requires a store.");
  }

  if (typeof view !== "function") {
    throw new Error("App view must be a function.");
  }

  let unsubscribe = null;

  function update() {
    const state = store.getState();
    const vnode = view(state);
    render(vnode, root);
  }

  function mount() {
    if (unsubscribe) {
      return;
    }

    update();
    unsubscribe = store.subscribe(update);
  }

  function unmount() {
    if (!unsubscribe) {
      return;
    }

    unsubscribe();
    unsubscribe = null;
  }

  return {
    mount,
    unmount,
  };
}
