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

syncBrowserThemeColor();

if (typeof MutationObserver !== "undefined") {
  const themeObserver = new MutationObserver(syncBrowserThemeColor);
  themeObserver.observe(root, { attributes: true, attributeFilter: ["data-theme"] });
}
