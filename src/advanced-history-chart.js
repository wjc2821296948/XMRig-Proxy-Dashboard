/**
 * Optional interactive session-history chart backed by the locally bundled
 * uPlot library. The vendor JS and CSS are fetched only after the user opts in.
 */

const SCRIPT_URL = new URL("../vendor/uplot/uPlot.iife.min.js", import.meta.url).href;
const STYLESHEET_URL = new URL("../vendor/uplot/uPlot.min.css", import.meta.url).href;

let assetsPromise = null;

/**
 * Wait until the chart container has a real width before constructing uPlot.
 * This avoids painting a guessed-size chart while a parent is still hidden.
 */
function waitForContainerWidth(container, signal) {
  const measureWidth = () => Math.floor(container.getBoundingClientRect().width);
  const currentWidth = measureWidth();
  if (currentWidth > 0) return Promise.resolve(currentWidth);

  const abortError = () => {
    const error = new Error("Chart mount was cancelled");
    error.name = "AbortError";
    return error;
  };
  if (signal?.aborted) return Promise.reject(abortError());

  return new Promise((resolve, reject) => {
    let observer = null;
    let frameId = null;
    let settled = false;

    const cleanup = () => {
      observer?.disconnect();
      if (frameId !== null) window.cancelAnimationFrame(frameId);
      signal?.removeEventListener("abort", onAbort);
    };
    const finish = width => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(width);
    };
    const onAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(abortError());
    };
    const checkWidth = () => {
      const width = measureWidth();
      if (width > 0) finish(width);
    };

    signal?.addEventListener("abort", onAbort, { once: true });
    if (typeof window.ResizeObserver === "function") {
      observer = new window.ResizeObserver(checkWidth);
      observer.observe(container);
      checkWidth();
    } else {
      const poll = () => {
        checkWidth();
        if (!settled) frameId = window.requestAnimationFrame(poll);
      };
      poll();
    }
  });
}

function loadScript() {
  if (typeof window.uPlot === "function") return Promise.resolve(window.uPlot);

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_URL;
    script.async = true;
    script.dataset.uplotScript = "true";
    script.onload = () => {
      if (typeof window.uPlot === "function") resolve(window.uPlot);
      else reject(new Error("uPlot did not expose its browser constructor"));
    };
    script.onerror = () => {
      script.remove();
      reject(new Error("Unable to load the local uPlot script"));
    };
    document.head.appendChild(script);
  });
}

function loadStylesheet() {
  return new Promise((resolve, reject) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = STYLESHEET_URL;
    link.dataset.uplotStylesheet = "true";
    link.onload = resolve;
    link.onerror = () => {
      link.remove();
      reject(new Error("Unable to load the local uPlot stylesheet"));
    };
    document.head.appendChild(link);
  });
}

async function loadUPlot() {
  if (!assetsPromise) {
    assetsPromise = Promise.all([loadScript(), loadStylesheet()])
      .then(([UPlot]) => UPlot)
      .catch(error => {
        assetsPromise = null;
        throw error;
      });
  }
  return assetsPromise;
}

/**
 * Convert session samples to uPlot's aligned [timestamps, values] format.
 * Invalid readings are ignored, samples are sorted, and duplicate timestamps
 * keep the newest occurrence. uPlot expects Unix timestamps in seconds.
 */
export function buildUPlotData(samples) {
  if (!Array.isArray(samples)) return [[], []];

  const ordered = samples
    .filter(sample => (
      sample &&
      typeof sample.timestamp === "number" &&
      Number.isFinite(sample.timestamp) &&
      sample.timestamp >= 0 &&
      typeof sample.hashrate === "number" &&
      Number.isFinite(sample.hashrate) &&
      sample.hashrate >= 0
    ))
    .map(sample => ({ timestamp: sample.timestamp, hashrate: sample.hashrate }))
    .sort((a, b) => a.timestamp - b.timestamp);

  const unique = [];
  for (const sample of ordered) {
    const last = unique[unique.length - 1];
    if (last && last.timestamp === sample.timestamp) unique[unique.length - 1] = sample;
    else unique.push(sample);
  }

  return [
    unique.map(sample => sample.timestamp / 1000),
    unique.map(sample => sample.hashrate),
  ];
}

/**
 * Mount uPlot into a supplied container. Returns a cleanup callback which
 * disconnects resize tracking and destroys the chart instance.
 */
export async function mountAdvancedHistoryChart(container, samples, formatHashrate, signal) {
  if (!container || typeof container.appendChild !== "function") {
    throw new TypeError("A chart container is required");
  }

  const data = buildUPlotData(samples);
  if (data[0].length < 2) {
    const emptyState = document.createElement("p");
    emptyState.className = "history-empty";
    emptyState.textContent = "至少需要两次成功刷新才能显示交互式趋势图";
    container.replaceChildren(emptyState);
    return () => {};
  }

  // Do not create a guessed-width plot while the container is hidden.
  await waitForContainerWidth(container, signal);
  if (signal?.aborted) {
    const error = new Error("Chart mount was cancelled");
    error.name = "AbortError";
    throw error;
  }

  const UPlot = await loadUPlot();
  const chartWidth = await waitForContainerWidth(container, signal);
  if (signal?.aborted) {
    const error = new Error("Chart mount was cancelled");
    error.name = "AbortError";
    throw error;
  }
  const rootStyles = getComputedStyle(document.documentElement);
  const accent = rootStyles.getPropertyValue("--accent-copper").trim() || "#c68b54";
  const muted = rootStyles.getPropertyValue("--text-muted").trim() || "#8b8b9a";
  const grid = rootStyles.getPropertyValue("--border-light").trim() || "rgba(128, 128, 128, 0.2)";
  const formatValue = typeof formatHashrate === "function"
    ? formatHashrate
    : value => Number(value).toLocaleString();

  const chartHeight = 190;
  const plot = new UPlot({
    width: chartWidth,
    height: chartHeight,
    legend: { show: true },
    series: [
      {},
      {
        label: "算力",
        stroke: accent,
        width: 2,
        points: { show: true, size: 4 },
        value: (_chart, value) => value == null ? "" : formatValue(value),
      },
    ],
    axes: [
      {
        stroke: muted,
        grid: { show: false },
        ticks: { stroke: grid, width: 1 },
      },
      {
        stroke: muted,
        label: "算力",
        values: (_chart, ticks) => ticks.map(value => formatValue(value)),
        grid: { stroke: grid, width: 1 },
        ticks: { stroke: grid, width: 1 },
      },
    ],
  }, data, container);

  const resizePlot = width => {
    if (Number.isFinite(width) && width > 0) {
      plot.setSize({ width: Math.max(1, Math.floor(width)), height: chartHeight });
    }
  };

  let observer = null;
  let windowResizeHandler = null;
  if (typeof window.ResizeObserver === "function") {
    observer = new window.ResizeObserver(entries => {
      resizePlot(entries[0]?.contentRect?.width);
    });
    observer.observe(container);
  } else {
    windowResizeHandler = () => resizePlot(container.getBoundingClientRect().width);
    window.addEventListener("resize", windowResizeHandler);
  }

  return () => {
    observer?.disconnect();
    if (windowResizeHandler) window.removeEventListener("resize", windowResizeHandler);
    plot.destroy();
  };
}
