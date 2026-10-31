import { cp, mkdir, rm, stat } from "node:fs/promises";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, "..");
await rm(resolve(root, "dist"), { recursive: true, force: true });
await mkdir(resolve(root, "dist"), { recursive: true });
await cp(resolve(root, "src"), resolve(root, "dist"), {
  recursive: true,
  filter: (path) => !path.endsWith(".d.ts"),
});
const info = await stat(resolve(root, "dist/index.html"));
console.log(
  `Static export: dist/index.html (${info.size} bytes). Native HTML/CSS/JS; no runtime build required.`,
);
