// A transport-only process. Device identity is validated by the IoT ingest service.
import http from "node:http";
const target = process.env.IOT_API_BASE || "http://127.0.0.1:8180";
http
  .createServer(async (req, res) => {
    if (req.url !== "/telemetry" || req.method !== "POST") {
      res.writeHead(404);
      return res.end();
    }
    let size = 0;
    const chunks = [];
    try {
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 65536) {
          res.writeHead(413);
          res.end("Payload too large");
          return;
        }
        chunks.push(chunk);
      }
      const body = Buffer.concat(chunks);
      JSON.parse(body.toString());
      const upstream = await fetch(target + "/iot/ingest", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Device-Key": String(req.headers["x-device-key"] || ""),
        },
        body,
        signal: AbortSignal.timeout(10000),
      });
      res.writeHead(upstream.status, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      res.end(await upstream.text());
    } catch {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({ message: "采集服务暂不可用，请按相同消息编号重试" }),
      );
    }
  })
  .listen(
    Number(process.env.IOT_INGEST_PORT || 8181),
    process.env.IOT_INGEST_HOST || "127.0.0.1",
    () =>
      console.log(
        "IoT HTTP gateway ready on port " +
          (process.env.IOT_INGEST_PORT || 8181),
      ),
  );
