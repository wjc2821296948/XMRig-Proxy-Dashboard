/**
 * Guards async background-image processing against stale results.
 *
 * Starting a new upload or invalidating the current selection advances the
 * generation. Async work may only update the UI while its generation is current.
 */
export function createBackgroundUploadGuard() {
  let generation = 0;

  return {
    begin() {
      generation += 1;
      return generation;
    },
    isCurrent(requestId) {
      return requestId === generation;
    },
    invalidate() {
      generation += 1;
    },
  };
}
