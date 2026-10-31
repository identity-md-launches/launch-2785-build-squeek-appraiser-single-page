import { readdir, readFile, stat } from "node:fs/promises";
import { resolve, relative, sep } from "node:path";
const root = resolve(import.meta.dirname, "..");
const budget = JSON.parse(
  await readFile(resolve(root, "artifacts/bundle-budget.json"), "utf8"),
);
const inputs = [
  "src",
  "dist",
  "scripts",
  "test",
  "artifacts",
  "README.md",
  "DESIGN.md",
  ".gitignore",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
];
const banned = new Set([
  "node_modules",
  ".npm",
  ".cache",
  ".playwright",
  "playwright-report",
  "test-results",
]);
const files = [];
async function walk(path) {
  const rel = relative(root, path).split(sep).join("/");
  if (rel === "test/scratch" || rel.startsWith("test/scratch/")) return;
  const s = await stat(path);
  if (s.isDirectory()) {
    if (banned.has(path.split(sep).at(-1)))
      throw Error(
        `Generated dependency/cache directory in deliverables: ${rel}`,
      );
    for (const entry of await readdir(path, { withFileTypes: true })) {
      if (entry.isSymbolicLink())
        throw Error(
          `Symlink is not a static deliverable: ${rel}/${entry.name}`,
        );
      await walk(resolve(path, entry.name));
    }
  } else {
    if (/\.tgz$|\.tsbuildinfo$/.test(rel))
      throw Error(`Unnecessary dependency/cache artifact: ${rel}`);
    files.push({ path: rel, bytes: s.size });
  }
}
for (const input of inputs) await walk(resolve(root, input));
const total = files.reduce((sum, f) => sum + f.bytes, 0);
if (total > budget.maximumSubmissionBytes)
  throw Error(`Submission ${total} exceeds ${budget.maximumSubmissionBytes}`);
for (const [path, limit] of Object.entries(budget.pathBudgetsBytes)) {
  const group =
    path === "documentationAndConfiguration"
      ? files.filter((f) => !f.path.includes("/") && f.path !== ".gitignore")
      : files.filter((f) => f.path === path || f.path.startsWith(path));
  const size = group.reduce((sum, f) => sum + f.bytes, 0);
  if (size > limit)
    throw Error(`${path}: ${size} exceeds explicit budget ${limit}`);
}
for (const f of files.filter(
  (f) => f.path.startsWith("src/") && !f.path.endsWith(".d.ts"),
)) {
  const exported = await readFile(
    resolve(root, f.path.replace(/^src\//, "dist/")),
  );
  const source = await readFile(resolve(root, f.path));
  if (!source.equals(exported)) throw Error(`Stale export: ${f.path}`);
}
const html = await readFile(resolve(root, "dist/index.html"), "utf8");
for (const match of html.matchAll(/(?:src|href|content)="(\.\/[^"]+)"/g)) {
  const path = match[1].split("#")[0];
  await stat(resolve(root, "dist", path));
}
const report = {
  checkedAt: new Date().toISOString(),
  maximumBytes: budget.maximumSubmissionBytes,
  totalBytes: total,
  files: files.length,
  sourceMatchesExport: true,
  relativeAssetsExist: true,
  dependencyTreesIncluded: false,
  perPath: files,
};
await writeFileSafe(report);
console.log(
  `Bundle: ${total.toLocaleString("en-US")} / ${budget.maximumSubmissionBytes.toLocaleString("en-US")} bytes; ${files.length} files. Source/export match; relative assets exist; no dependency trees.`,
);
async function writeFileSafe(report) {
  const { writeFile } = await import("node:fs/promises");
  await writeFile(
    resolve(root, "artifacts/bundle-check.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
}
