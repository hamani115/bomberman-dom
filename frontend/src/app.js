import { elem, createStore, createApp } from "../framework/index.js";

import { createSocket } from "./network/socket.js";

const store = createStore({
  screen: "nickname",
  connectionStatus: "connecting",
  playerId: null,
  nickname: "",
  playerCount: 0,
  players: [],
  chatMessages: [],
  error: "",
});

let chatDraft = "";

const socket = createSocket({
  onOpen: () => {
    store.setState({
      connectionStatus: "connected",
    });
  },
  onMessage: (message) => {
    if (message.type === "joined") {
      store.setState({
        playerId: message.playerId,
        nickname: message.nickname,
        screen: "waiting",
        error: "",
      });

      return;
    }

    if (message.type === "lobby") {
      store.setState({
        playerCount: message.playerCount,
        players: message.players,
      });

      return;
    }

    if (message.type === "error") {
      store.setState({
        error: message.message,
      });
    }

    if (message.type === "chat") {
      const state = store.getState();

      store.setState({
        chatMessages: [
          ...state.chatMessages,
          {
            playerId: message.playerId,
            nickname: message.nickname,
            message: message.message,
          },
        ],
      });

      return;
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

function sendChat() {
  const message = chatDraft.trim();

  if (!message) {
    return;
  }

  socket.send({
    type: "chat",
    message,
  });

  chatDraft = "";
}

function Chat(state) {
  return elem(
    "section",
    {
      class: "chat",
    },
    elem("h2", {}, "Chat"),
    elem(
      "div",
      {
        class: "chat-messages",
      },
      state.chatMessages.length === 0
        ? elem(
            "p",
            {
              class: "chat-empty",
            },
            "No messages yet.",
          )
        : state.chatMessages.map((chatMessage) => {
            const sender =
              chatMessage.playerId === state.playerId
                ? `${chatMessage.nickname} (You)`
                : chatMessage.nickname;
            return elem(
              "p",
              {
                class: "chat-message",
              },
              elem("strong", {}, `${sender}: `),
              chatMessage.message,
            );
          }),
    ),
    elem(
      "div",
      {
        class: "chat-input-row",
      },
      elem("input", {
        class: "chat-input",
        type: "text",
        placeholder: "Write a message...",
        value: chatDraft,
        autofocus: true,
        events: {
          input: (event) => {
            chatDraft = event.target.value;
          },
          keydown: (event) => {
            if (event.key === "Enter") {
              sendChat();
            }
          },
        },
      }),
      elem(
        "button",
        {
          class: "chat-send",
          events: {
            click: () => {
              sendChat();
            },
          },
        },
        "Send",
      ),
    ),
  );
}

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

function WaitingRoom(state) {
  return elem(
    "main",
    {
      class: "waiting-screen",
    },
    elem("h1", {}, "Waiting Room"),
    elem("p", {}, `Players: ${state.playerCount} / 4`),
    elem(
      "ul",
      {
        class: "player-list",
      },
      state.players.map((player) =>
        elem(
          "li",
          {},
          player.id === state.playerId
            ? `${player.nickname} (You)`
            : player.nickname,
        ),
      ),
    ),
    Chat(state),
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

  if (state.screen === "waiting") {
    return WaitingRoom(state);
  }

  return elem("main", {}, "Game");
}

const app = createApp({
  root: "#app",
  store,
  view: App,
});

app.mount();

socket.connect();
