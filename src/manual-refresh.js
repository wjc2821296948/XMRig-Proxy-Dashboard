/**
 * Add an accessible manual refresh control to the dashboard subtitle.
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
}) {
  if (!container || typeof container.appendChild !== "function") {
    notify("无法初始化手动刷新按钮：未找到仪表盘标题栏", "warning");
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
      await refresh();
      status.textContent = "监控数据刷新完成";
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
