/**
 * Build and locally download an allowlisted dashboard metrics snapshot.
 * Proxy URLs and credentials are intentionally never copied into the export.
 */
const HASHRATE_LABELS = ["10 seconds", "1 minute", "15 minutes", "1 hour", "12 hours", "24 hours"];

function nonNegativeFinite(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function safeText(value) {
  if (typeof value === "string") return value.slice(0, 256);
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function metric(value) {
  return nonNegativeFinite(value);
}

export function createDashboardSnapshot(data, exportedAt = new Date()) {
  const source = data && typeof data === "object" ? data : {};
  const resources = source.resources && typeof source.resources === "object" ? source.resources : {};
  const memory = resources.memory && typeof resources.memory === "object" ? resources.memory : {};
  const upstreams = source.upstreams && typeof source.upstreams === "object" ? source.upstreams : {};
  const results = source.results && typeof source.results === "object" ? source.results : {};
  const miners = source.miners && typeof source.miners === "object" ? source.miners : {};
  const rawHashrates = Array.isArray(source.hashrate?.total) ? source.hashrate.total : [];
  const rawLoadAverage = Array.isArray(resources.load_average) ? resources.load_average : [];

  return {
    format: "xmrig-proxy-dashboard-metrics",
    version: 1,
    exportedAt: new Date(exportedAt).toISOString(),
    worker: {
      id: safeText(source.worker_id),
      proxyVersion: safeText(source.version),
    },
    metrics: {
      hashrate: {
        unit: "KH/s",
        labels: HASHRATE_LABELS,
        values: rawHashrates.slice(0, HASHRATE_LABELS.length).map(metric),
      },
      miners: {
        current: metric(miners.now),
        peak: metric(miners.max),
      },
      workers: metric(source.workers),
      uptimeSeconds: metric(source.uptime),
      resources: {
        memoryTotalBytes: metric(memory.total),
        memoryFreeBytes: metric(memory.free),
        residentSetMemoryBytes: metric(memory.resident_set_memory),
        loadAverage: rawLoadAverage.slice(0, 3).map(metric),
        hardwareConcurrency: metric(resources.hardware_concurrency),
      },
      upstreams: {
        active: metric(upstreams.active),
        sleep: metric(upstreams.sleep),
        errors: metric(upstreams.error),
        total: metric(upstreams.total),
        minerRatio: metric(upstreams.ratio),
      },
      shares: {
        accepted: metric(results.accepted),
        rejected: metric(results.rejected),
        invalid: metric(results.invalid),
        expired: metric(results.expired),
        totalHashes: metric(results.hashes_total),
        latencyMs: metric(results.latency),
        averageTimeSeconds: metric(results.avg_time),
      },
    },
  };
}

export function buildSnapshotFilename(date = new Date()) {
  const timestamp = new Date(date).toISOString().replace(/[:.]/g, "-");
  return "xmrig-proxy-dashboard-snapshot-" + timestamp + ".json";
}

export function registerSnapshotExport({
  documentRef,
  container,
  getData,
  notify,
  now = () => new Date(),
  BlobCtor = Blob,
  urlApi = URL,
  setTimeoutRef = setTimeout,
}) {
  const button = documentRef.createElement("button");
  button.id = "exportMetricsSnapshotButton";
  button.type = "button";
  button.className = "btn btn-secondary btn-sm";
  button.textContent = "导出快照";
  button.setAttribute("aria-label", "导出当前监控指标为 JSON 文件");
  button.title = "下载当前指标快照；不包含 Proxy URL 或 Token";
  container.appendChild(button);

  const onClick = () => {
    const data = getData();
    if (!data) {
      notify("暂无可导出的监控数据，请先连接 Proxy", "warning");
      return;
    }
    let objectUrl;
    try {
      const date = new Date(now());
      const snapshot = createDashboardSnapshot(data, date);
      const json = JSON.stringify(snapshot, null, 2);
      const blob = new BlobCtor([json], { type: "application/json;charset=utf-8" });
      objectUrl = urlApi.createObjectURL(blob);
      const link = documentRef.createElement("a");
      link.href = objectUrl;
      link.download = buildSnapshotFilename(date);
      link.hidden = true;
      documentRef.body.appendChild(link);
      link.click();
      link.remove();
      setTimeoutRef(() => urlApi.revokeObjectURL(objectUrl), 30000);
      notify("监控快照已导出；文件不包含 Proxy URL 或 Token", "success");
    } catch {
      if (objectUrl) {
        try { urlApi.revokeObjectURL(objectUrl); } catch { /* best-effort cleanup */ }
      }
      notify("导出监控快照失败，请重试", "error");
    }
  };

  button.addEventListener("click", onClick);
  return () => {
    button.removeEventListener("click", onClick);
    button.remove();
  };
}
