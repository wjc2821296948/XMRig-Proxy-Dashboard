/**
 * Environment adapter for the reusable xmrig-proxy-client package.
 *
 * Browser deployments bundle this module during the build, so the package
 * code is served from the dashboard's own origin instead of a runtime CDN.
 */
export {
  XMRigProxyClient,
  XMRigProxyError,
  createStatusTracker,
  resetStatusTracker,
  getStatusInfo,
  getRecentMinerPeak,
  getAcceptanceRate,
} from "xmrig-proxy-client";
