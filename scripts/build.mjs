import { cp, mkdir, rm } from "node:fs/promises";
import { build } from "esbuild";

await rm("dist", { recursive: true, force: true });
await mkdir("dist", { recursive: true });

await cp("index.html", "dist/index.html");
await cp("styles.css", "dist/styles.css");

await build({
  entryPoints: ["src/main.js"],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  outfile: "dist/app.js",
  sourcemap: true,
});
