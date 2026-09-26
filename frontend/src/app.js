import { elem, createStore, createApp } from "../framework/index.js";

import { createSocket } from "./network/socket.js";

const store = createStore({
  screen: "nickname",
  connectionStatus: "connecting",
  nickname: "",
  error: "",
});

const socket = createSocket({
  onOpen: () => {
    store.setState({
      connectionStatus: "connected",
    });
  },
  onMessage: (message) => {
    if (message.type === "joined") {
      store.setState({
        nickname: message.nickname,
        screen: "waiting",
        error: "",
      });
    }
  },
  onClose: () => {
    store.setState({
      connectionStatus: "disconnected",
    });
  },
  onError: () => {
    store.setState({
      connectionStatus: "error",
    });
  },
});

function NicknameScreen(state) {
  let nickname = "";

  return elem(
    "section",
    {
      class: "nickname-screen",
    },
    elem("h1", {}, "Bomberman DOM"),
    elem("p", {}, "Enter a nickname to join the game."),
    elem("input", {
      type: "text",
      placeholder: "Nickname",
      autofocus: true,
      events: {
        input: (event) => {
          nickname = event.target.value;
        },
        keydown: (event) => {
          if (event.key === "Enter") {
            joinGame(nickname);
          }
        },
      },
    }),
    elem(
      "button",
      {
        events: {
          click: () => {
            joinGame(nickname);
          },
        },
      },
      "Join",
    ),
    state.error
      ? elem(
          "p",
          {
            class: "error",
          },
          state.error,
        )
      : null,
  );
}

function joinGame(rawNickname) {
  const nickname = rawNickname.trim();

  if (!nickname) {
    store.setState({
      error: "Nickname is required.",
    });

    return;
  }

  socket.send({
    type: "join",
    nickname,
  });
}

function App(state) {
  if (state.screen === "nickname") {
    return NicknameScreen(state);
  }

  return elem("main", {}, "Waiting room");
}

const app = createApp({
  root: "#app",
  store,
  view: App,
});

app.mount();

socket.connect();
