/**
 * Escape untrusted text before interpolating it into HTML text or quoted
 * attribute contexts. Keep this helper isolated so tests can import it
 * without evaluating the dashboard bootstrap or touching the DOM.
 * @param {string|null|undefined} str
 * @returns {string}
 */
export function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  // Replace ampersands first so generated entities are not double-encoded.
  const ENT_AMP = "&" + "amp;";
  const ENT_LT = "&" + "lt;";
  const ENT_GT = "&" + "gt;";
  const ENT_QUOT = "&" + "quot;";
  const ENT_APOS = "&" + "#039;";
  return String(str)
    .replace(/&/g, ENT_AMP)
    .replace(/</g, ENT_LT)
    .replace(/>/g, ENT_GT)
    .replace(/\\"/g, ENT_QUOT)
    .replace(/'/g, ENT_APOS);
}
