(function () {
  const role = document.body.dataset.role || "customer",
    page = location.pathname.split("/").pop();
  if (role !== "engineer") return;
  let pendingDevice = null;
  const css = document.createElement("style");
  css.textContent =
    ".iot-entry{display:block;background:#fff;border:1px solid #e1e9f3;border-radius:16px;padding:18px 20px;margin:18px 0;text-decoration:none;color:#20364d}.iot-entry strong{display:block;font-size:15px;font-weight:600}.iot-entry small{display:block;font-size:12px;line-height:1.8;color:#7c8fa6;margin-top:5px}.iot-entry .iot-snapshot{display:flex;gap:16px;flex-wrap:wrap;margin-top:12px}.iot-snapshot span{font-size:12px;color:#71839a}.iot-snapshot b{display:block;font-size:18px;font-weight:500;color:#20364d}";
  document.head.append(css);
  function add(container, title, subtitle, href, snapshot) {
    if (!container || document.getElementById("iot-device-entry")) return;
    const a = document.createElement("a");
    a.id = "iot-device-entry";
    a.className = "iot-entry";
    a.href = href;
    const strong = document.createElement("strong");
    strong.textContent = title;
    const small = document.createElement("small");
    small.textContent = subtitle;
    a.append(strong, small);
    if (pendingDevice && ["task-detail.html", "platform-order.html"].includes(page)) {
      a.textContent = "打开完整设备监测 →";
      const section = document.createElement("section");
      section.className = "iot-entry iot-order-monitor";
      section.id = "iot-device-entry";
      a.removeAttribute("id");
      a.className = "iot-order-full";
      strong.textContent = "本单设备监测";
      small.textContent = "查看设备指标、运行趋势与告警；仅限当前任务授权范围。";
      if (!pendingDevice.id || ["COMPLETED", "CANCELLED", "REFUSED"].includes(pendingDevice.status)) {
        small.textContent = !pendingDevice.id
          ? "本单尚未关联具体设备，暂无法展示物联网数据。"
          : "工单已结束，实时监测查看授权已结束；维修过程请查看本单服务记录。";
        section.append(strong, small);
        const anchor = container.querySelector(".flow-summary,.market-heading");
        if (anchor) anchor.after(section); else container.prepend(section);
        return;
      }
      const expand = document.createElement("details");
      const summary = document.createElement("summary");
      summary.textContent = "展开运行数据与统计图";
      expand.append(summary);
      expand.addEventListener("toggle", () => {
        if (expand.open && !expand.querySelector("iframe")) {
          const frame = document.createElement("iframe");
          frame.title = "本单设备物联网数据与运行趋势";
          frame.src = href + "&embedded=1";
          frame.style.cssText = "width:100%;height:780px;border:0;display:block;background:#fff";
          expand.append(frame);
        } else if (!expand.open) expand.querySelector("iframe")?.remove();
      });
      section.append(strong, small, expand, a);
      const anchor = container.querySelector(".flow-summary,.market-heading");
      if (anchor) anchor.after(section); else container.prepend(section);
      return;
    }
    if (snapshot) {
      const box = document.createElement("div");
      box.className = "iot-snapshot";
      for (const [key, value] of Object.entries(snapshot).slice(0, 4)) {
        const span = document.createElement("span");
        span.textContent =
          {
            temperature: "冷却液温度（℃）",
            current: "工作电流（A）",
            runtime: "累计运行（h）",
            vibration: "振动速度（mm/s）",
          }[key] || key;
        const b = document.createElement("b");
        b.textContent = String(value);
        span.append(b);
        box.append(span);
      }
      a.append(box);
    }
    container.append(a);
  }
  function mount() {
    const root =
      document.getElementById("market-root") ||
      document.getElementById("detailContent") ||
      document.querySelector("main");
    if (!root) return;
    if (pendingDevice) {
      add(
        root,
        "设备诊断数据",
        pendingDevice.snapshot
          ? "查看实时趋势与故障前后数据；下方为报修时留存快照。"
          : "按当前任务权限查看设备运行数据与告警记录。",
        "iot/monitor.html?deviceId=" + encodeURIComponent(pendingDevice.id) + "&task=" + encodeURIComponent(page + location.search + location.hash),
        pendingDevice.snapshot,
      );
      return;
    }
    if (page === "device-detail.html") {
      const id = new URLSearchParams(location.search).get("id");
      if (id)
        add(
          root,
          "设备运行监控",
          "查看最近上报、运行趋势与异常告警。",
          "iot/monitor.html?deviceId=" + encodeURIComponent(id),
        );
    } else if (
      role === "engineer" &&
      ["workbench.html", "profile.html"].includes(page)
    ) {
      add(
        root,
        "设备诊断数据",
        "仅显示当前任务授权设备；数据用于辅助排查，不代替现场诊断。",
        "iot/monitor.html",
      );
    }
  }
  document.addEventListener("iot-device-context", (e) => {
    if (e.detail) {
      document.getElementById("iot-device-entry")?.remove();
      pendingDevice = e.detail;
      mount();
    }
  });
  document.addEventListener("mobile-screen-rendered", mount);
  document.addEventListener("DOMContentLoaded", () => {
    mount();
    const root = document.querySelector("main");
    if (root) new MutationObserver(mount).observe(root, { childList: true });
  });
})();
