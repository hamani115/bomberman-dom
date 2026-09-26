# Mini Framework Documentation

## Overview

This mini-framework provides a simple API for creating DOM elements, handling events, managing application state, routing between views, and rendering applications.

The public API is exported from:

```text
src/framework/index.js
```

```js
export { elem, render } from "./dom.js";
export { createStore } from "./state.js";
export { createApp } from "./app.js";
export { createRouter } from "./router.js";
```

## Creating Elements with `elem()`

Use `elem()` to describe an element:

```js
const title = elem("h1", { class: "title" }, "Hello");
```

The general form is:

```js
elem(tag, attributes, ...children);
```

`elem()` returns a JavaScript object describing the element:

```js
{
  tag: "h1",
  attrs: {
    class: "title",
  },
  children: ["Hello"],
}
```

The renderer later converts this description into a real DOM element.

### Nesting Elements

Elements can be nested by passing other `elem()` calls as children:

```js
const card = elem(
  "div",
  { class: "card" },
  elem("h2", {}, "Title"),
  elem("p", {}, "Some text"),
);
```

Arrays can also be used as children, which is useful with `map()`:

```js
const list = elem(
  "ul",
  {},
  items.map((item) => elem("li", {}, item)),
);
```

Strings and numbers are rendered as text nodes. `null`, `undefined`, and boolean children are rendered as empty text nodes.

## Attributes

Attributes are passed in the second argument:

```js
const input = elem("input", {
  class: "new-todo",
  type: "text",
  placeholder: "What needs to be done?",
});
```

Normal attributes such as `class`, `id`, `href`, `type`, `data-*`, and `aria-*` are applied to the element.

The framework handles these values as DOM properties:

```text
value
checked
disabled
selected
required
autofocus
multiple
```

Example:

```js
const checkbox = elem("input", {
  type: "checkbox",
  checked: true,
});
```

`null` and `undefined` attribute values are ignored.

### Autofocus

Use:

```js
autofocus: true;
```

when an input should receive focus after rendering.

For text inputs, the framework also places the cursor at the end of the current value.

Example:

```js
const input = elem("input", {
  value: "Edit me",
  autofocus: true,
});
```

## Event Handling

Events are declared inside an `events` object:

```js
const button = elem(
  "button",
  {
    events: {
      click: () => {
        console.log("Clicked");
      },
    },
  },
  "Click me",
);
```

The framework connects these handlers to browser events.

Multiple events can be added to the same element:

```js
const input = elem("input", {
  events: {
    keydown: (event) => {
      console.log(event.key);
    },
    blur: (event) => {
      console.log(event.target.value);
    },
  },
});
```

Examples of event names used by TodoMVC include:

```text
click
change
keydown
dblclick
blur
```

The event handler receives the normal browser event object.

## Rendering

`render()` converts an element description into real DOM and places it inside a container.

```js
render(elem("h1", {}, "Hello"), "#app");
```

The HTML needs a matching container:

```html
<div id="app"></div>
```

The rendering flow is:

```text
VNode
  ↓
createDomNode()
  ↓
real DOM element
  ↓
children are created recursively
  ↓
render() inserts the result into the container
```

Each render updates the application container with the DOM generated from the latest VNode tree.

## State Management

Create a store with `createStore()`:

```js
const store = createStore({
  count: 0,
});
```

The store provides:

```text
getState()
setState()
subscribe()
```

### Reading State

```js
const state = store.getState();
console.log(state.count);
```

### Updating State

`setState()` receives a partial state object:

```js
store.setState({
  count: 1,
});
```

The new values are merged with the existing state, then subscribers are notified.

For arrays and objects, create updated values instead of modifying the existing state directly.

Example:

```js
store.setState({
  todos: [...state.todos, newTodo],
});
```

### Subscribing to State Changes

`subscribe()` registers a function that runs whenever `setState()` updates the store.

It returns a function called `unsubscribe`, which can be called later to remove that listener.

```js
const unsubscribe = store.subscribe(() => {
  console.log("State changed");
});
```

To stop listening:

```js
unsubscribe();
```

## Creating an Application with `createApp()`

`createApp()` connects the store, view function, and renderer.

```js
function App(state) {
  return elem("p", {}, `Count: ${state.count}`);
}

const app = createApp({
  root: "#app",
  store,
  view: App,
});

app.mount();
```

When mounted, the application follows this flow:

```text
get current state
      ↓
call view(state)
      ↓
receive VNode tree
      ↓
render it
      ↓
listen for state changes
```

When `setState()` updates the store, `createApp()` renders the view again with the new state.

To stop the application from listening to state changes:

```js
app.unmount();
```

## Routing

Create a router with `createRouter()`:

```js
const router = createRouter({
  "/": () => {
    console.log("Home");
  },
  "/active": () => {
    console.log("Active");
  },
  "/completed": () => {
    console.log("Completed");
  },
});
```

A `/` route is required.

Start the router with:

```js
router.start();
```

Navigate with:

```js
router.navigate("/active");
```

The router uses hash-based URLs such as:

```text
#/
#/active
#/completed
```

It listens for hash changes, so browser Back and Forward navigation follow the registered routes.

The router also provides:

```js
router.getPath();
router.stop();
```

## Typical Application Setup

```js
import {
  elem,
  createStore,
  createApp,
  createRouter,
} from "../src/framework/index.js";

const store = createStore({
  message: "Hello",
});

const router = createRouter({
  "/": () => {},
});

function App(state) {
  return elem(
    "main",
    {},
    elem("h1", {}, state.message),
    elem(
      "button",
      {
        events: {
          click: () => {
            store.setState({
              message: "Updated",
            });
          },
        },
      },
      "Update",
    ),
  );
}

const app = createApp({
  root: "#app",
  store,
  view: App,
});

router.start();
app.mount();
```

The main application flow is:

```text
user event
   ↓
event handler
   ↓
store.setState()
   ↓
store notifies createApp()
   ↓
view(state)
   ↓
VNode tree
   ↓
render()
   ↓
updated browser DOM
```

Routing follows this flow:

```text
URL/hash change
   ↓
router
   ↓
route handler
   ↓
state update
   ↓
render
```

## TodoMVC Example

The TodoMVC application is located in:

```text
todomvc/app.js
```

It demonstrates the framework features together:

- `elem()` builds the interface
- `events` handles user interaction
- `createStore()` stores todos, filter state, and editing state
- `createRouter()` handles All, Active, and Completed routes
- `createApp()` connects the store to the view and renderer

TodoMVC uses the framework API for its DOM structure, events, state updates, routing, and rendering.

## Framework Flow

The framework is organized into small modules:

```text
dom.js: element descriptions and rendering

events.js: event handler setup

state.js: application state and subscriptions

router.js: hash-based routing

app.js: application lifecycle and rendering updates

index.js: public framework exports
```

Together, these modules provide the API used to build with the framework.
