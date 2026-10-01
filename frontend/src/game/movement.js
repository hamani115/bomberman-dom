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

function overlapsTile(x, y, row, col) {
  const halfSize = PLAYER_COLLISION_SIZE / 2;
  const epsilon = 0.001;

  const left = Math.floor(x - halfSize + epsilon);
  const right = Math.floor(x + halfSize - epsilon);
  const top = Math.floor(y - halfSize + epsilon);
  const bottom = Math.floor(y + halfSize - epsilon);

  return col >= left && col <= right && row >= top && row <= bottom;
}

function canCollide(gameMap, bombs, currentPosition, x, y) {
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

  for (const bomb of bombs.values()) {
    if (!overlapsTile(x, y, bomb.row, bomb.col)) {
      continue;
    }

    const alreadyOverlapping = overlapsTile(
      currentPosition.x,
      currentPosition.y,
      bomb.row,
      bomb.col,
    );

    if (alreadyOverlapping) {
      continue;
    }

    return false;
  }

  return true;
}

function moveToward(value, target, amount) {
  if (value < target) {
    return Math.min(value + amount, target);
  }

  if (value > target) {
    return Math.max(value - amount, target);
  }

  return value;
}

export function startMovement({
  getGameMap,
  getBombs,
  getPosition,
  setPosition,
  getElement,
  getSpeed,
  onMove,
  onBomb,
}) {
  let animationFrame = null;
  let previousTime = performance.now();

  function handleKeyDown(event) {
    if (isTypingTarget(event.target)) {
      return;
    }

    if (event.code === "Space") {
      if (isTypingTarget(event.target)) {
        return;
      }

      event.preventDefault();

      if (!event.repeat && onBomb) {
        onBomb();
      }

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
    const gameMap = getGameMap();
    const bombs = getBombs();

    if (position && gameMap && (direction.x !== 0 || direction.y !== 0)) {
      let x = position.x;
      let y = position.y;

      const originalX = x;
      const originalY = y;

      const speed = getSpeed ? getSpeed() : PLAYER_SPEED;

      const distance = speed * deltaTime;
      const snapDistance = (speed + 2) * deltaTime;

      if (direction.x !== 0 && direction.y === 0) {
        const centerY = Math.floor(y) + 0.5;
        const snappedY = moveToward(y, centerY, snapDistance);

        if (canCollide(gameMap, bombs, position, x, snappedY)) {
          y = snappedY;
        }
      }

      if (direction.y !== 0 && direction.x === 0) {
        const centerX = Math.floor(x) + 0.5;
        const snappedX = moveToward(x, centerX, snapDistance);

        if (canCollide(gameMap, bombs, position, snappedX, y)) {
          x = snappedX;
        }
      }

      const nextX = x + direction.x * distance;

      if (canCollide(gameMap, bombs, position, nextX, y)) {
        x = nextX;
      }

      const nextY = y + direction.y * distance;

      if (canCollide(gameMap, bombs, position, x, nextY)) {
        y = nextY;
      }

      if (x !== originalX || y !== originalY) {
        setPosition({
          x,
          y,
        });

        const element = getElement();

        if (element) {
          element.style.transform = `translate3d(${x * TILE_SIZE - PLAYER_SIZE / 2}px, ${y * TILE_SIZE - PLAYER_SIZE / 2}px, 0)`;
        }

        if (onMove) {
          onMove({
            x,
            y,
          });
        }
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
