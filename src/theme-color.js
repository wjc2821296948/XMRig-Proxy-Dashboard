/* Keep browser chrome synchronized with the active dashboard theme.
 * main.js owns theme preference and updates data-theme; observing that single
 * attribute also covers settings changes and OS-driven theme changes.
 */
const THEME_COLORS = Object.freeze({
  dark: "#0e0f1a",
  light: "#f4eee5",
});

const root = document.documentElement;
const themeColorMeta = document.querySelector('meta[name="theme-color"]');

function syncBrowserThemeColor() {
  if (!themeColorMeta) return;
  const theme = root.getAttribute("data-theme") === "light" ? "light" : "dark";
  const color = THEME_COLORS[theme];
  if (themeColorMeta.getAttribute("content") !== color) {
    themeColorMeta.setAttribute("content", color);
  }
}

// Modules are evaluated in document order, but defer the first paint sync
// until the next animation frame so main.js has finished applying the saved
// preference before browser chrome is updated. The observer still handles
// later changes immediately.
if (typeof requestAnimationFrame === "function") {
  requestAnimationFrame(syncBrowserThemeColor);
} else {
  syncBrowserThemeColor();
}

if (typeof MutationObserver !== "undefined") {
  const themeObserver = new MutationObserver(syncBrowserThemeColor);
  themeObserver.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
}
