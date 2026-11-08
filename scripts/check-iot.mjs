import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const steps = [
  [
    "Backend types",
    "backend/node_modules/typescript/bin/tsc",
    "-p",
    "backend/tsconfig.build.json",
  ],
  [
    "Enterprise frontend types",
    "apps/cs-admin/node_modules/typescript/bin/tsc",
    "--noEmit",
    "-p",
    "apps/cs-admin/tsconfig.json",
  ],
  ["Shared monitoring UI", "scripts/build-iot-web.mjs"],
  [
    "IoT permissions, lifecycle and business flow",
    "backend/test/iot-system.mjs",
  ],
  ["Mobile login and role routing", "backend/test/mobile-login-routing.mjs"],
  [
    "Enterprise mobile responsive layout",
    "backend/test/business-mobile-layout.mjs",
  ],
  ["Four role views", "backend/test/iot-browser.mjs"],
  [
    "Platform company overview and drawer",
    "backend/test/iot-fleet-browser.mjs",
  ],
  ["Map interaction and animation", "backend/test/iot-map-visual.mjs"],
  [
    "Browser actions and mobile identities",
    "backend/test/iot-acceptance-browser.mjs",
  ],
  ["Restart and telemetry recovery", "backend/test/iot-recovery.mjs"],
  [
    "Existing service delegation regression",
    "backend/test/service-network.mjs",
  ],
];
for (const [label, ...args] of steps) {
  console.log("\nCHECK " + label);
  const code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: root,
      windowsHide: true,
      stdio: "inherit",
    });
    child.once("error", reject);
    child.once("exit", resolve);
  });
  if (code !== 0) {
    process.exitCode = 1;
    break;
  }
}
if (!process.exitCode)
  console.log("\nPASS IoT simulation acceptance suite (printer excluded).");
