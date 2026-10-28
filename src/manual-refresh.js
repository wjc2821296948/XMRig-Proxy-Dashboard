/**
 * Add an accessible manual refresh control to the dashboard manual-refresh slot.
 * The refresh operation is injected so it can be tested without a browser.
 */
export function registerManualRefresh({
  documentRef,
  container,
  hasConfig,
  shouldRefresh = () => true,
  refresh,
  notify,
  onRefreshStart = () => {},
  onRefreshEnd = () => {},
  warn = message => console.warn(message),
}) {
  if (!container || typeof container.appendChild !== "function") {
    warn("Manual refresh control was not registered because #manualRefreshSlot is missing.");
    return () => {};
  }

  const button = documentRef.createElement("button");
  button.id = "refreshDashboardButton";
  button.type = "button";
  button.className = "btn btn-secondary btn-sm";
  button.textContent = "立即刷新";
  button.setAttribute("aria-label", "立即刷新监控数据");
  button.setAttribute("aria-busy", "false");
  button.setAttribute("aria-disabled", "false");
  button.title = "立即获取最新的 Proxy 监控数据";

  const status = documentRef.createElement("span");
  status.className = "sr-only";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  container.appendChild(button);
  container.appendChild(status);

  let busy = false;
  const idleText = button.textContent;
  const onClick = async () => {
    if (busy) return;
    if (!hasConfig()) {
      notify("请先连接 Proxy 后再刷新", "warning");
      return;
    }
    if (!shouldRefresh()) {
      notify("请先切换到只读视图后再刷新", "warning");
      return;
    }

    busy = true;
    button.disabled = true;
    button.setAttribute("aria-busy", "true");
    button.setAttribute("aria-disabled", "true");
    button.textContent = "刷新中…";
    status.textContent = "正在刷新监控数据";
    try {
      onRefreshStart();
      const refreshResult = await refresh();
      if (refreshResult?.status === "cancelled") {
        // An aborted request is a normal lifecycle event, not a connection failure.
        status.textContent = "刷新已取消";
      } else if (refreshResult === false || refreshResult?.status === "failed") {
        status.textContent = "手动刷新失败";
        // fetchAndRender() already shows the specific error toast itself.
        // Keep the generic fallback for injected handlers that report bare false.
        if (!refreshResult?.notified) {
          notify("手动刷新失败，请检查 Proxy 连接", "error");
        }
      } else {
        status.textContent = "监控数据刷新完成";
      }
    } catch {
      status.textContent = "手动刷新失败";
      notify("手动刷新失败，请检查 Proxy 连接", "error");
    } finally {
      try {
        onRefreshEnd();
      } catch {
        notify("无法恢复自动刷新，请刷新页面", "error");
      }
      busy = false;
      button.disabled = false;
      button.setAttribute("aria-busy", "false");
      button.setAttribute("aria-disabled", "false");
      button.textContent = idleText;
    }
  };

  button.addEventListener("click", onClick);
  return () => {
    button.removeEventListener("click", onClick);
    button.remove();
    status.remove();
  };
}
