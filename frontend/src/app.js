import { elem, createStore, createApp } from "../framework/index.js";

import { createSocket } from "./network/socket.js";
import { startMovement } from "./game/movement.js";
import { startRemoteMovement } from "./game/remoteMovement.js";

import { TILE_SIZE, PLAYER_SIZE, PLAYER_SPEED } from "./game/constants.js";

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
  explosions: [],
  powerUps: [],
  winner: null,
  error: "",
});

let chatDraft = "";

const playerElements = new Map();
const runtimePositions = new Map();
const remoteTargets = new Map();
const runtimeSpeeds = new Map();
const runtimeBombs = new Map();

let runtimeGameMap = null;

let stopRemoteMovement = null;
let stopMovement = null;

let lastMoveSentAt = 0;

const MOVE_SEND_INTERVAL = 50;

function GameHud(state) {
  return elem(
    "div",
    {
      class: "game-hud",
    },
    state.gamePlayers.map((player) =>
      elem(
        "div",
        {
          class: player.alive ? "hud-player" : "hud-player eliminated",
        },
        elem(
          "div",
          {
            class: "hud-top",
          },
          elem(
            "strong",
            {},
            player.id === state.playerId
              ? `${player.nickname} (You)`
              : player.nickname,
          ),
          player.alive
            ? elem(
                "span",
                {
                  class: "hud-lives",
                },
                `Lives: ${player.lives}`,
              )
            : elem(
                "span",
                {
                  class: "hud-dead",
                },
                "DEAD",
              ),
        ),
        player.alive
          ? elem(
              "div",
              {
                class: "hud-stats",
              },
              elem(
                "span",
                {
                  class: "hud-chip",
                },
                `Bombs: ${player.maxBombs}`,
              ),
              elem(
                "span",
                {
                  class: "hud-chip",
                },
                `Flame: ${player.bombRange}`,
              ),
              elem(
                "span",
                {
                  class: "hud-chip",
                },
                `Speed: ${Number(player.speed).toFixed(1)}`,
              ),
            )
          : null,
      ),
    ),
  );
}

function applyPlayerUpdates(players, updates) {
  const updatesById = new Map(updates.map((player) => [player.id, player]));

  return players.map((player) => {
    const update = updatesById.get(player.id);

    if (!update) {
      return player;
    }

    return {
      ...player,
      ...update,
    };
  });
}

function ExplosionCell(explosionId, cell) {
  return elem("div", {
    class: "explosion",
    "data-explosion-id": explosionId,
    "data-row": cell.row,
    "data-col": cell.col,
    style: `transform: translate3d(${cell.col * TILE_SIZE}px, ${cell.row * TILE_SIZE}px, 0);`,
  });
}

function applyDestroyedBlocks(gameMap, destroyedBlocks) {
  const tiles = gameMap.tiles.map((row) => [...row]);

  for (const block of destroyedBlocks) {
    tiles[block.row][block.col] = "floor";
  }

  return {
    ...gameMap,
    tiles,
  };
}

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
    elem(
      "div",
      {
        class: "bomb-body",
      },
      elem("div", {
        class: "bomb-shine",
      }),
    ),
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
  runtimeSpeeds.clear();

  for (const player of players) {
    const position = {
      x: player.x,
      y: player.y,
    };

    runtimePositions.set(player.id, position);

    remoteTargets.set(player.id, position);

    runtimeSpeeds.set(player.id, player.speed ?? PLAYER_SPEED);
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
    getGameMap: () => runtimeGameMap,
    getBombs: () => runtimeBombs,
    getPosition: () => runtimePositions.get(state.playerId),
    setPosition: (position) => {
      runtimePositions.set(state.playerId, position);
    },
    getElement: () => playerElements.get(state.playerId),
    getSpeed: () => runtimeSpeeds.get(state.playerId) ?? PLAYER_SPEED,
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
      runtimeBombs.clear();

      const gamePlayers = message.gamePlayers.map((player) => ({
        ...player,
        maxBombs: 1,
        bombRange: 1,
        speed: PLAYER_SPEED,
      }));

      initializeRuntimePlayers(gamePlayers);

      runtimeGameMap = message.map;

      store.setState({
        screen: "game",
        lobbyPhase: "game",
        countdown: 0,
        gameMap: message.map,
        gamePlayers,
        bombs: [],
        explosions: [],
        powerUps: [],
        winner: null,
      });

      startLocalMovement();
      startRemotePlayers();

      return;
    }

    if (message.type === "player_disconnected") {
      const state = store.getState();

      runtimePositions.delete(message.playerId);
      remoteTargets.delete(message.playerId);
      runtimeSpeeds.delete(message.playerId);
      playerElements.delete(message.playerId);

      const chatMessages = [
        ...state.chatMessages,
        {
          system: true,
          message: `${message.nickname} disconnected`,
        },
      ];

      store.setState({
        gamePlayers: state.gamePlayers.filter(
          (player) => player.id !== message.playerId,
        ),

        players: state.players.filter(
          (player) => player.id !== message.playerId,
        ),

        chatMessages: chatMessages.slice(-100),
      });

      return;
    }

    if (message.type === "game_over") {
      if (stopMovement) {
        stopMovement();
        stopMovement = null;
      }

      if (stopRemoteMovement) {
        stopRemoteMovement();
        stopRemoteMovement = null;
      }

      store.setState({
        screen: "game_over",
        lobbyPhase: "game_over",
        winner: message.winner ?? null,
        countdown: message.countdown,
      });

      return;
    }

    if (message.type === "game_over_countdown") {
      store.setState({
        countdown: message.countdown,
      });

      return;
    }

    if (message.type === "lobby_reset") {
      if (stopMovement) {
        stopMovement();
        stopMovement = null;
      }

      if (stopRemoteMovement) {
        stopRemoteMovement();
        stopRemoteMovement = null;
      }

      playerElements.clear();
      runtimePositions.clear();
      remoteTargets.clear();
      runtimeSpeeds.clear();
      runtimeBombs.clear();

      runtimeGameMap = null;

      store.setState({
        screen: "waiting",
        lobbyPhase: "waiting",
        countdown: 0,
        gameMap: null,
        gamePlayers: [],
        bombs: [],
        explosions: [],
        powerUps: [],
        winner: null,
      });

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

      runtimeBombs.set(message.bomb.id, message.bomb);

      store.setState({
        bombs: [...state.bombs, message.bomb],
      });

      return;
    }

    if (message.type === "bomb_exploded") {
      const state = store.getState();

      runtimeBombs.delete(message.bomb.id);

      const explosion = {
        id: message.bomb.id,
        cells: message.explosion,
      };

      const updatedGameMap = applyDestroyedBlocks(
        state.gameMap,
        message.destroyedBlocks ?? [],
      );

      const damagedPlayers = message.damagedPlayers ?? [];
      const spawnedPowerUps = message.spawnedPowerUps ?? [];

      for (const player of damagedPlayers) {
        runtimePositions.set(player.id, {
          x: player.x,
          y: player.y,
        });

        remoteTargets.set(player.id, {
          x: player.x,
          y: player.y,
        });

        if (!player.alive) {
          playerElements.delete(player.id);
          remoteTargets.delete(player.id);
        }
      }

      const updatedPlayers = applyPlayerUpdates(
        state.gamePlayers,
        damagedPlayers,
      );

      runtimeGameMap = updatedGameMap;

      store.setState({
        bombs: state.bombs.filter((bomb) => bomb.id !== message.bomb.id),
        gameMap: updatedGameMap,
        gamePlayers: updatedPlayers,
        explosions: [...state.explosions, explosion],
        powerUps: [...state.powerUps, ...spawnedPowerUps],
      });

      const localPlayerUpdate = damagedPlayers.find(
        (player) => player.id === state.playerId,
      );

      if (localPlayerUpdate && !localPlayerUpdate.alive && stopMovement) {
        stopMovement();
        stopMovement = null;
      }

      setTimeout(() => {
        const currentState = store.getState();

        store.setState({
          explosions: currentState.explosions.filter(
            (currentExplosion) => currentExplosion.id !== explosion.id,
          ),
        });
      }, 450);

      return;
    }

    if (message.type === "power_up_collected") {
      const state = store.getState();

      const playerUpdate = {
        id: message.playerId,
        maxBombs: message.maxBombs,
        bombRange: message.bombRange,
        speed: message.speed,
      };

      runtimeSpeeds.set(message.playerId, message.speed);

      store.setState({
        powerUps: state.powerUps.filter(
          (powerUp) => powerUp.id !== message.powerUp.id,
        ),

        gamePlayers: applyPlayerUpdates(state.gamePlayers, [playerUpdate]),
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
            "No messages yet",
          )
        : state.chatMessages.map((chatMessage) => {
            if (chatMessage.system) {
              return elem(
                "p",
                {
                  class: "chat-message system-message",
                },
                chatMessage.message,
              );
            }

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
    elem("p", {}, "Enter a nickname to join the game"),
    elem(
      "div",
      {
        class: "nickname-form",
      },
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
        class: "power-up-layer",
      },
      state.powerUps.map((powerUp) => PowerUp(powerUp)),
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
        class: "explosion-layer",
      },

      state.explosions.flatMap((explosion) =>
        explosion.cells.map((cell) => ExplosionCell(explosion.id, cell)),
      ),
    ),
    elem(
      "div",
      {
        class: "player-layer",
      },
      state.gamePlayers
        .filter((player) => player.alive)
        .map((player) => Player(player, state)),
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
      GameHud(state),
      GameBoard(state),
    ),
    Chat(state),
  );
}

function GameOverScreen(state) {
  const winnerText = state.winner
    ? state.winner.id === state.playerId
      ? "You win!"
      : `${state.winner.nickname} wins!`
    : "Draw!";

  return elem(
    "main",
    {
      class: "game-over-screen",
    },
    elem("h1", {}, "Game Over"),
    elem(
      "h2",
      {
        class: "game-result",
      },
      winnerText,
    ),
    elem("p", {}, `Returning to the waiting room in ${state.countdown}...`),
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
      "div",
      {
        class: "player-face",
      },
      elem(
        "div",
        {
          class: "player-eyes",
        },
        elem("span", {
          class: "player-eye",
        }),
        elem("span", {
          class: "player-eye",
        }),
      ),
      elem("div", {
        class: "player-smile",
      }),
    ),
    elem(
      "span",
      {
        class: "player-name",
      },
      isCurrentPlayer ? `${player.nickname} (You)` : player.nickname,
    ),
  );
}

function PowerUp(powerUp) {
  const size = 28;
  const offset = (TILE_SIZE - size) / 2;

  const labels = {
    bomb: "B",
    flame: "F",
    speed: "S",
  };

  return elem(
    "div",
    {
      class: `power-up power-up-${powerUp.type}`,
      "data-power-up-id": powerUp.id,
      style: `transform: translate3d(${powerUp.col * TILE_SIZE + offset}px, ${powerUp.row * TILE_SIZE + offset}px, 0);`,
    },
    labels[powerUp.type] ?? "?",
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

  if (state.screen === "game_over") {
    return GameOverScreen(state);
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
