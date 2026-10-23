/** Register a guarded refresh when a background document becomes visible. */
export function registerVisibilityRefresh({
  documentRef,
  hasConfig,
  shouldRefresh = () => true,
  refresh,
}) {
  let refreshing = false;
  const onVisibilityChange = async () => {
    if (documentRef.visibilityState !== "visible") return;
    if (!hasConfig() || !shouldRefresh() || refreshing) return;
    refreshing = true;
    try {
      await refresh();
    } catch {
      // The refresh owner handles user-facing errors; avoid an unhandled
      // rejection escaping from an event listener.
    } finally {
      refreshing = false;
    }
  };

  documentRef.addEventListener("visibilitychange", onVisibilityChange);
  return () => documentRef.removeEventListener("visibilitychange", onVisibilityChange);
}
