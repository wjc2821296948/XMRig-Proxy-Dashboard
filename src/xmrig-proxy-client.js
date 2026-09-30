/**
 * Environment adapter for the reusable xmrig-proxy-client package.
 *
 * Node.js test runs resolve the exact GitHub commit through package.json.
 * Browser/static deployments resolve the same immutable commit directly from
 * GitHub's raw ES module endpoint.
 */

const isNode =
  typeof process !== "undefined" &&
  process?.versions?.node;

const PACKAGE_URL =
  "https://raw.githubusercontent.com/wjc2821296948/xmrig-proxy-client/e8a10f38dfa049bd85c708b911d1cfd49879d1c0/src/index.js";

const packageModule = await import(isNode ? "xmrig-proxy-client" : PACKAGE_URL);

export const {
  XMRigProxyClient,
  XMRigProxyError,
  createStatusTracker,
  resetStatusTracker,
  getStatusInfo,
  getRecentMinerPeak,
  getAcceptanceRate,
} = packageModule;
