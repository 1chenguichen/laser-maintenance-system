import { mkdir, copyFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url)),
  source = path.join(root, "packages/iot-web");
for (const app of [
  "apps/platform-admin-web",
  "apps/customer-app-web",
  "apps/engineer-app-web",
  "apps/cs-admin/public",
]) {
  const target = path.join(root, app, "iot");
  await mkdir(path.join(target, "assets"), { recursive: true });
  for (const file of ["console.js", "console.css", "entry.js"])
    await copyFile(path.join(source, file), path.join(target, file));
  await copyFile(
    path.join(source, "assets/china-display.json"),
    path.join(target, "assets/china-display.json"),
  );
  await writeFile(
    path.join(target, "GENERATED.md"),
    "Generated from packages/iot-web by scripts/build-iot-web.mjs. Edit source and rebuild.\n",
  );
}
console.log("Built shared IoT UI for four web applications.");
