import { listen } from "../../framework/index.js";

import {
  TILE_SIZE,
  PLAYER_SIZE,
  PLAYER_SPEED,
  PLAYER_COLLISION_SIZE,
} from "./constants.js";

const pressedKeys = new Set();

function normalizeKey(key) {
  return key.toLowerCase();
}

function isMovementKey(key) {
  return [
    "w",
    "a",
    "s",
    "d",
    "arrowup",
    "arrowdown",
    "arrowleft",
    "arrowright",
  ].includes(key);
}

function isTypingTarget(target) {
  const tag = target?.tagName;

  return tag === "INPUT" || tag === "TEXTAREA" || target?.isContentEditable;
}

function canOccupy(gameMap, x, y) {
  const halfSize = PLAYER_COLLISION_SIZE / 2;
  const epsilon = 0.001;

  const left = Math.floor(x - halfSize + epsilon);
  const right = Math.floor(x + halfSize - epsilon);
  const top = Math.floor(y - halfSize + epsilon);
  const bottom = Math.floor(y + halfSize - epsilon);

  for (let row = top; row <= bottom; row++) {
    for (let col = left; col <= right; col++) {
      const tile = gameMap.tiles[row]?.[col];

      if (tile !== "floor") {
        return false;
      }
    }
  }

  return true;
}

export function startMovement({
  gameMap,
  getPosition,
  setPosition,
  getElement,
}) {
  let animationFrame = null;
  let previousTime = performance.now();

  function handleKeyDown(event) {
    if (isTypingTarget(event.target)) {
      return;
    }

    const key = normalizeKey(event.key);

    if (!isMovementKey(key)) {
      return;
    }

    event.preventDefault();
    pressedKeys.add(key);
  }

  function handleKeyUp(event) {
    const key = normalizeKey(event.key);

    if (!isMovementKey(key)) {
      return;
    }

    event.preventDefault();
    pressedKeys.delete(key);
  }

  function clearKeys() {
    pressedKeys.clear();
  }

  function getDirection() {
    let x = 0;
    let y = 0;

    if (pressedKeys.has("a") || pressedKeys.has("arrowleft")) {
      x -= 1;
    }

    if (pressedKeys.has("d") || pressedKeys.has("arrowright")) {
      x += 1;
    }

    if (pressedKeys.has("w") || pressedKeys.has("arrowup")) {
      y -= 1;
    }

    if (pressedKeys.has("s") || pressedKeys.has("arrowdown")) {
      y += 1;
    }

    if (x !== 0 && y !== 0) {
      const diagonal = 1 / Math.sqrt(2);

      x *= diagonal;
      y *= diagonal;
    }

    return { x, y };
  }

  //! speed is based on time and not frame
  function frame(currentTime) {
    const deltaTime = Math.min((currentTime - previousTime) / 1000, 0.05);

    previousTime = currentTime;

    const direction = getDirection();
    const position = getPosition();

    if (position && (direction.x !== 0 || direction.y !== 0)) {
      let x = position.x;
      let y = position.y;

      const distance = PLAYER_SPEED * deltaTime;

      const nextX = x + direction.x * distance;

      if (canOccupy(gameMap, nextX, y)) {
        x = nextX;
      }

      const nextY = y + direction.y * distance;

      if (canOccupy(gameMap, x, nextY)) {
        y = nextY;
      }

      setPosition({
        x,
        y,
      });

      const element = getElement();

      if (element) {
        element.style.transform = `translate3d(${x * TILE_SIZE - PLAYER_SIZE / 2}px, ${y * TILE_SIZE - PLAYER_SIZE / 2}px, 0)`;
      }
    }

    animationFrame = requestAnimationFrame(frame);
  }

  const stopKeyDown = listen(window, "keydown", handleKeyDown);

  const stopKeyUp = listen(window, "keyup", handleKeyUp);

  const stopBlur = listen(window, "blur", clearKeys);

  animationFrame = requestAnimationFrame(frame);

  return function stopMovement() {
    cancelAnimationFrame(animationFrame);

    stopKeyDown();
    stopKeyUp();
    stopBlur();

    pressedKeys.clear();
  };
}
