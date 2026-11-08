import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
const file = new URL("../../.local-preview/iot-devices.json", import.meta.url),
  url = process.env.IOT_INGEST_URL || "http://127.0.0.1:8181/telemetry";
let stopped = false,
  round = 0;
const pending = new Map();
process.on("SIGINT", () => {
  stopped = true;
});
console.log("IoT simulator running; all telemetry is demonstration data.");
async function tick() {
  let config;
  try {
    config = JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    console.error("Run scripts/seed-iot-demo.mjs first");
    return;
  }
  let ok = 0;
  for (let i = 0; i < config.devices.length; i++) {
    const d = config.devices[i];
    if (d.behavior === "never" || d.behavior === "offline") continue;
    const t = Date.now() / 1000,
      abnormal = d.behavior === "alarm" && Math.floor(t / 45) % 2 === 0;
    const values = {
      temperature: Number(
        (abnormal
          ? 54 + Math.sin(t / 5) * 3
          : 29 + Math.sin(t / 11 + i) * 4
        ).toFixed(1),
      ),
      current: Number((17 + Math.sin(t / 13 + i) * 3).toFixed(1)),
      runtime: Number((410 + i * 11 + ((t / 3600) % 24)).toFixed(2)),
      vibration: Number((1.6 + Math.sin(t / 9 + i) * 0.3).toFixed(2)),
    };
    let item = pending.get(d.assetId);
    if (!item)
      item = {
        assetId: d.assetId,
        sampleId: randomUUID(),
        recordedAt: new Date().toISOString(),
        values,
      };
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Device-Key": d.deviceKey,
        },
        body: JSON.stringify(item),
        signal: AbortSignal.timeout(5000),
      });
      if (r.ok) {
        pending.delete(d.assetId);
        ok++;
      } else if ([401, 403, 404].includes(r.status)) {
        pending.delete(d.assetId);
      } else pending.set(d.assetId, item);
    } catch {
      pending.set(d.assetId, item);
    }
  }
  if (round++ % 6 === 0)
    console.log(
      "Simulation reports accepted:",
      ok,
      "; pending retries:",
      pending.size,
    );
}
while (!stopped) {
  await tick();
  if (process.argv.includes("--once")) break;
  await new Promise((resolve) => setTimeout(resolve, 5000));
}
