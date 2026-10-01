import { TILE_SIZE, PLAYER_SIZE } from "./constants.js";

export function startRemoteMovement({
  localPlayerId,
  runtimePositions,
  remoteTargets,
  playerElements,
}) {
  let animationFrame = null;
  let previousTime = performance.now();

  function frame(currentTime) {
    const deltaTime = Math.min((currentTime - previousTime) / 1000, 0.05);

    previousTime = currentTime;

    for (const [playerId, target] of remoteTargets) {
      if (playerId === localPlayerId) {
        continue;
      }

      const position = runtimePositions.get(playerId);

      if (!position) {
        continue;
      }

      const differenceX = target.x - position.x;
      const differenceY = target.y - position.y;

      if (Math.abs(differenceX) < 0.001 && Math.abs(differenceY) < 0.001) {
        if (position.x !== target.x || position.y !== target.y) {
          position.x = target.x;
          position.y = target.y;

          const element = playerElements.get(playerId);

          if (element) {
            element.style.transform = `translate3d(${position.x * TILE_SIZE - PLAYER_SIZE / 2}px, ${position.y * TILE_SIZE - PLAYER_SIZE / 2}px, 0)`;
          }
        }

        continue;
      }

      const smoothing = Math.min(1, deltaTime * 12);

      position.x += differenceX * smoothing;
      position.y += differenceY * smoothing;

      const element = playerElements.get(playerId);

      if (element) {
        element.style.transform = `translate3d(${position.x * TILE_SIZE - PLAYER_SIZE / 2}px, ${position.y * TILE_SIZE - PLAYER_SIZE / 2}px, 0)`;
      }
    }

    animationFrame = requestAnimationFrame(frame);
  }

  animationFrame = requestAnimationFrame(frame);

  return function stop() {
    cancelAnimationFrame(animationFrame);
  };
}
