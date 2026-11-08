// Optional local simulator. Ctrl+C stops only the processes started here.
import fs from "node:fs/promises";
import net from "node:net";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const children = [];
function listening(port) {
  return new Promise((resolve) => {
    const s = net.connect({ host: "127.0.0.1", port });
    s.setTimeout(1200);
    s.once("connect", () => {
      s.destroy();
      resolve(true);
    });
    s.once("error", () => resolve(false));
    s.once("timeout", () => {
      s.destroy();
      resolve(false);
    });
  });
}
function start(file) {
  const child = spawn(process.execPath, [file], {
    cwd: root,
    windowsHide: true,
    stdio: "inherit",
  });
  children.push(child);
  child.on("exit", (code) => {
    if (code) console.error(file + " exited with " + code);
  });
  return child;
}
if (!(await listening(8180)))
  throw Error("Start the four application previews first (backend port 8180).");
try {
  await fs.access(
    new URL("../.local-preview/iot-devices.json", import.meta.url),
  );
} catch {
  throw Error("Run node scripts/seed-iot-demo.mjs once before the simulator.");
}
if (await listening(8181))
  throw Error(
    "Port 8181 is already running. Close the previous IoT demo window first to avoid duplicate simulation.",
  );
start("apps/iot-ingest/http-gateway.mjs");
for (let n = 0; n < 20 && !(await listening(8181)); n++)
  await new Promise((r) => setTimeout(r, 100));
if (!(await listening(8181))) throw Error("IoT gateway failed to start.");
start("apps/iot-ingest/simulator.mjs");
console.log(
  "IoT demonstration is active. Keep this window open; Ctrl+C stops simulation.",
);
function stop() {
  for (const child of children) child.kill();
}
process.on("SIGINT", () => {
  stop();
  process.exit(0);
});
process.on("SIGTERM", () => {
  stop();
  process.exit(0);
});
process.on("exit", stop);
