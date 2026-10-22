/** Register a guarded refresh when a background document becomes visible. */
export function registerVisibilityRefresh({
  documentRef,
  hasConfig,
  shouldRefresh = () => true,
  refresh,
}) {
  const onVisibilityChange = () => {
    if (documentRef.visibilityState !== "visible") return;
    if (!hasConfig() || !shouldRefresh()) return;
    // The caller owns request deduplication and error handling.
    void refresh();
  };

  documentRef.addEventListener("visibilitychange", onVisibilityChange);
  return () => documentRef.removeEventListener("visibilitychange", onVisibilityChange);
}
