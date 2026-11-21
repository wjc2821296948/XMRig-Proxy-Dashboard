/** Small, deterministic XMRig Proxy summary used by browser tests. */
export function createSummary({ hashrate = 100, miners = 3, accepted = 100, rejected = 0 } = {}) {
  return {
    worker_id: "qa-worker",
    version: "qa-fixture",
    uptime: 3600,
    workers: miners,
    hashrate: { total: [hashrate, hashrate, hashrate, hashrate, hashrate, hashrate] },
    miners: { now: miners, max: Math.max(miners, 3) },
    results: { accepted, rejected, invalid: 0, expired: 0, latency: 1, hashes_total: 1000, avg_time: 1 },
    resources: { memory: { total: 1024, free: 512, resident_set_memory: 256 }, hardware_concurrency: 4, load_average: [0.1, 0.1, 0.1] },
    upstreams: { ratio: 1, active: 1, sleep: 0, error: 0, total: 1 },
  };
}
