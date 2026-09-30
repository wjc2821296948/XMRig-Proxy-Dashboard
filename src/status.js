/**
 * status.js – compatibility exports for the Dashboard.
 *
 * Status logic is now implemented by xmrig-proxy-client so other consumers
 * (bots, Workers, monitoring services) can reuse the exact same state machine.
 */

export {
  createStatusTracker,
  resetStatusTracker,
  getStatusInfo,
  getRecentMinerPeak,
  getAcceptanceRate,
} from "./xmrig-proxy-client.js";
