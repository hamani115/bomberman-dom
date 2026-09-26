export function createStore(initialState = {}) {
  let state = {
    ...initialState,
  };

  const listeners = [];

  function getState() {
    return {
      ...state,
    };
  }

  function setState(partialState) {
    state = {
      ...state,
      ...partialState,
    };

    notify();
  }

  function subscribe(listener) {
    if (typeof listener !== "function") {
      throw new Error("Store subscriber must be a function");
    }

    listeners.push(listener);

    return function unsubscribe() {
      const index = listeners.indexOf(listener);

      if (index !== -1) {
        listeners.splice(index, 1);
      }
    };
  }

  function notify() {
    for (const listener of listeners) {
      listener();
    }
  }

  return {
    getState,
    setState,
    subscribe,
  };
}
