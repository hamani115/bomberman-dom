import { elem, createStore, createApp } from "../framework/index.js";

import { createSocket } from "./network/socket.js";
import { startMovement } from "./game/movement.js";
import { startRemoteMovement } from "./game/remoteMovement.js";

import { TILE_SIZE, PLAYER_SIZE } from "./game/constants.js";

const store = createStore({
  screen: "nickname",
  connectionStatus: "connecting",
  playerId: null,
  nickname: "",
  playerCount: 0,
  players: [],
  chatMessages: [],
  lobbyPhase: "waiting",
  countdown: 0,
  gameMap: null,
  gamePlayers: [],
  bombs: [],
  error: "",
});

let chatDraft = "";

const playerElements = new Map();
const runtimePositions = new Map();
const remoteTargets = new Map();

let stopRemoteMovement = null;
let stopMovement = null;

let lastMoveSentAt = 0;

const MOVE_SEND_INTERVAL = 50;

function placeBomb() {
  socket.send({
    type: "place_bomb",
  });
}

function Bomb(bomb) {
  const size = 28;
  const offset = (TILE_SIZE - size) / 2;

  return elem(
    "div",
    {
      class: "bomb",
      "data-bomb-id": bomb.id,
      style: `transform: translate3d(${bomb.col * TILE_SIZE + offset}px, ${bomb.row * TILE_SIZE + offset}px, 0);`,
    },
    elem("div", {
      class: "bomb-body",
    }),
  );
}

function setPlayerPosition(playerId, position) {
  runtimePositions.set(playerId, {
    x: position.x,
    y: position.y,
  });

  const element = playerElements.get(playerId);

  if (element) {
    element.style.transform = `translate3d(${position.x * TILE_SIZE - PLAYER_SIZE / 2}px, ${position.y * TILE_SIZE - PLAYER_SIZE / 2}px, 0)`;
  }
}

function startRemotePlayers() {
  if (stopRemoteMovement) {
    stopRemoteMovement();
  }

  const state = store.getState();

  stopRemoteMovement = startRemoteMovement({
    localPlayerId: state.playerId,
    runtimePositions,
    remoteTargets,
    playerElements,
  });
}

function sendLocalPosition(position) {
  const now = performance.now();

  if (now - lastMoveSentAt < MOVE_SEND_INTERVAL) {
    return;
  }

  lastMoveSentAt = now;

  socket.send({
    type: "move",
    x: position.x,
    y: position.y,
  });
}

function initializeRuntimePlayers(players) {
  playerElements.clear();
  runtimePositions.clear();
  remoteTargets.clear();

  for (const player of players) {
    const position = {
      x: player.x,
      y: player.y,
    };

    runtimePositions.set(player.id, position);

    remoteTargets.set(player.id, position);
  }

  lastMoveSentAt = 0;
}

function startLocalMovement() {
  if (stopMovement) {
    stopMovement();
  }

  const state = store.getState();

  const localPlayer = state.gamePlayers.find(
    (player) => player.id === state.playerId,
  );

  if (!localPlayer || !state.gameMap) {
    return;
  }

  stopMovement = startMovement({
    gameMap: state.gameMap,
    getPosition: () => runtimePositions.get(state.playerId),
    setPosition: (position) => {
      runtimePositions.set(state.playerId, position);
    },
    getElement: () => playerElements.get(state.playerId),
    onMove: sendLocalPosition,
    onBomb: placeBomb,
  });
}

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
        lobbyPhase: message.phase,
        countdown: message.countdown || 0,
      });

      return;
    }

    if (message.type === "game_start") {
      initializeRuntimePlayers(message.gamePlayers);

      store.setState({
        screen: "game",
        lobbyPhase: "game",
        countdown: 0,
        gameMap: message.map,
        gamePlayers: message.gamePlayers,
        bombs: [],
      });

      startLocalMovement();
      startRemotePlayers();

      return;
    }

    if (message.type === "player_move") {
      const state = store.getState();

      if (message.playerId === state.playerId) {
        return;
      }

      remoteTargets.set(message.playerId, {
        x: message.x,
        y: message.y,
      });

      return;
    }

    if (message.type === "player_correction") {
      const state = store.getState();

      if (message.playerId !== state.playerId) {
        return;
      }

      setPlayerPosition(message.playerId, {
        x: message.x,
        y: message.y,
      });

      return;
    }

    if (message.type === "bomb_placed") {
      const state = store.getState();

      store.setState({
        bombs: [...state.bombs, message.bomb],
      });

      return;
    }

    if (message.type === "bomb_removed") {
      const state = store.getState();

      store.setState({
        bombs: state.bombs.filter((bomb) => bomb.id !== message.bomb.id),
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

      const chatMessages = [
        ...state.chatMessages,
        {
          playerId: message.playerId,
          nickname: message.nickname,
          message: message.message,
        },
      ];

      store.setState({
        chatMessages: chatMessages.slice(-100),
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

function Chat(state, autofocus = false) {
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
        autofocus,
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
    state.lobbyPhase === "countdown"
      ? elem(
          "p",
          {
            class: "countdown",
          },
          `Game starts in ${state.countdown}`,
        )
      : elem(
          "p",
          {
            class: "waiting-message",
          },
          state.playerCount < 2
            ? "Waiting for another player..."
            : "Waiting for more players...",
        ),
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
    Chat(state, true),
  );
}

function GameBoard(state) {
  const gameMap = state.gameMap;

  if (!gameMap) {
    return elem("p", {}, "Loading map...");
  }

  return elem(
    "div",
    {
      class: "game-board",
    },
    elem(
      "div",
      {
        class: "map-layer",
      },
      gameMap.tiles.flatMap((row, rowIndex) =>
        row.map((tile, colIndex) =>
          elem("div", {
            class: `tile tile-${tile}`,
            "data-row": rowIndex,
            "data-col": colIndex,
          }),
        ),
      ),
    ),
    elem(
      "div",
      {
        class: "bomb-layer",
      },
      state.bombs.map((bomb) => Bomb(bomb)),
    ),
    elem(
      "div",
      {
        class: "player-layer",
      },
      state.gamePlayers.map((player) => Player(player, state)),
    ),
  );
}

function GameScreen(state) {
  return elem(
    "main",
    {
      class: "game-screen",
    },
    elem(
      "section",
      {
        class: "game-area",
      },
      elem("h1", {}, "Bomberman"),
      GameBoard(state),
    ),
    Chat(state),
  );
}

function Player(player, state) {
  const isCurrentPlayer = player.id === state.playerId;

  const position = runtimePositions.get(player.id) ?? {
    x: player.x,
    y: player.y,
  };

  return elem(
    "div",
    {
      class: isCurrentPlayer ? "player current-player" : "player",

      "data-player-id": player.id,
      ref: (element) => {
        playerElements.set(player.id, element);
      },
      style: `transform: translate3d(${position.x * TILE_SIZE - PLAYER_SIZE / 2}px, ${position.y * TILE_SIZE - PLAYER_SIZE / 2}px, 0);`,
    },
    elem(
      "span",
      {
        class: "player-name",
      },
      isCurrentPlayer ? `${player.nickname} (You)` : player.nickname,
    ),
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

  if (state.screen === "game") {
    return GameScreen(state);
  }

  return elem("main", {}, "Unknown screen");
}
const app = createApp({
  root: "#app",
  store,
  view: App,
});

app.mount();

socket.connect();
