export function createRouter(routes = {}) {
  if (typeof routes["/"] !== "function") {
    throw new Error('Router requires a "/" route.');
  }

  for (const [path, handler] of Object.entries(routes)) {
    if (typeof handler !== "function") {
      throw new Error(`Route "${path}" handler must be a function.`);
    }
  }

  let started = false;

  function normalizePath(path) {
    if (!path) {
      return "/";
    }

    if (!path.startsWith("/")) {
      return `/${path}`;
    }

    return path;
  }

  function getPath() {
    const hash = window.location.hash;

    if (!hash) {
      return "/";
    }

    return normalizePath(hash.slice(1));
  }

  function handleRouteChange() {
    const path = getPath();
    const handler = routes[path];

    if (!handler) {
      navigate("/");
      return;
    }

    handler();
  }

  function navigate(path) {
    const normalizedPath = normalizePath(path);

    const targetHash = `#${normalizedPath}`;

    if (window.location.hash === targetHash) {
      handleRouteChange();
      return;
    }

    window.location.hash = normalizedPath;
  }

  function start() {
    if (started) {
      return;
    }

    window.addEventListener("hashchange", handleRouteChange);
    started = true;
    handleRouteChange();
  }

  function stop() {
    if (!started) {
      return;
    }

    window.removeEventListener("hashchange", handleRouteChange);
    started = false;
  }

  return {
    start,
    stop,
    navigate,
    getPath,
  };
}
