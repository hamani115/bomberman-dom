export function addEvent(element, eventName, handler) {
  if (typeof handler !== "function") {
    throw new Error(`Handler for "${eventName}" must be a function`);
  }

  element.addEventListener(eventName, handler);
}

export function applyEvents(element, events = {}) {
  if (typeof events !== "object" || events === null) {
    throw new Error("Events must be provided as an object");
  }

  for (const [eventName, handler] of Object.entries(events)) {
    addEvent(element, eventName, handler);
  }
}
