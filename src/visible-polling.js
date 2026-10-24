/**
 * Schedule dashboard refreshes only while the document is visible.
 *
 * A single timeout is scheduled after each refresh settles rather than using
 * setInterval. This prevents timer-driven requests from overlapping when a
 * proxy responds slowly, and removes the timer entirely while the tab is
 * hidden. The caller owns refresh error reporting.
 */
export function registerVisiblePolling({
  documentRef,
  intervalMs,
  refresh,
  shouldRun = () => true,
  setTimeoutRef = setTimeout,
  clearTimeoutRef = clearTimeout,
}) {
  const delay = Number.isFinite(intervalMs)
    ? Math.max(1000, Math.min(120000, intervalMs))
    : 10000;
  let timer = null;
  let running = false;
  let disposed = false;

  const cancelTimer = () => {
    if (timer === null) return;
    clearTimeoutRef(timer);
    timer = null;
  };

  const scheduleNext = () => {
    if (disposed || running || timer !== null || documentRef.visibilityState !== "visible") return;
    timer = setTimeoutRef(async () => {
      timer = null;
      if (disposed || documentRef.visibilityState !== "visible") return;
      if (!shouldRun()) {
        scheduleNext();
        return;
      }
      running = true;
      try {
        await refresh();
      } catch {
        // The refresh owner handles errors. Keep the polling loop alive.
      } finally {
        running = false;
        scheduleNext();
      }
    }, delay);
  };

  const onVisibilityChange = () => {
    if (documentRef.visibilityState !== "visible") {
      cancelTimer();
      return;
    }
    scheduleNext();
  };

  documentRef.addEventListener("visibilitychange", onVisibilityChange);
  scheduleNext();

  return () => {
    disposed = true;
    cancelTimer();
    documentRef.removeEventListener("visibilitychange", onVisibilityChange);
  };
}
