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

      const smoothing = Math.min(1, deltaTime * 12);

      position.x += (target.x - position.x) * smoothing;

      position.y += (target.y - position.y) * smoothing;

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
