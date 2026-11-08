/* Source of truth for all IoT web views. Build with scripts/build-iot-web.mjs. */
(function () {
  "use strict";
  const scriptBase = new URL("./", document.currentScript.src).href;
  const esc = (v) =>
    String(v ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const time = (v) =>
    v ? new Date(v).toLocaleString("zh-CN", { hour12: false }) : "从未上报";
  const status = {
    ONLINE: "在线",
    OFFLINE: "离线",
    NEVER: "未上报",
    DISABLED: "已停用",
  };
  const fmt = (v) =>
    typeof v === "number" ? Number(v.toFixed(2)).toLocaleString("zh-CN") : "—";
  let geoPromise;
  function mapData() {
    return (geoPromise ||= fetch(scriptBase + "assets/china-display.json").then(
      (r) => r.json(),
    ));
  }
  function icon() {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="3" y="4" width="18" height="15" rx="3"/><path d="M7 9h5v6H7zM16 8v1m0 3v1m0 3v1M8 22h8"/></svg>';
  }
  function mount(root, config) {
    const mapId = "iot-map-" + Math.random().toString(36).slice(2, 9);
    let mapObserver = null,
      observedMap = null;
    function observeMap() {
      const element = root.querySelector(".iot-map-studio");
      if (observedMap && observedMap !== element) {
        mapObserver?.unobserve(observedMap);
        observedMap = null;
      }
      if (!element || observedMap === element) return;
      observedMap = element;
      element.dataset.observed = "true";
      element.classList.add("is-offscreen");
      mapObserver ??= new IntersectionObserver(
        (entries) => {
          for (const entry of entries)
            entry.target.classList.toggle(
              "is-offscreen",
              !entry.isIntersecting || document.hidden,
            );
        },
        { rootMargin: "80px" },
      );
      mapObserver.observe(element);
    }
    function mapVisibility() {
      const element = root.querySelector(".iot-map-studio");
      if (element) {
        const r = element.getBoundingClientRect();
        element.classList.toggle(
          "is-offscreen",
          document.hidden || r.bottom < -80 || r.top > innerHeight + 80,
        );
      }
    }
    document.addEventListener("visibilitychange", mapVisibility);
    let selectionVersion = 0;
    let analytics = null,
      listScroll = 0,
      listAlarmPage = 1;
    async function backToList() {
      selectionVersion++;
      selected = null;
      detail = null;
      metric = "";
      alarmPage = listAlarmPage;
      await render();
      window.scrollTo(0, listScroll);
      refresh();
    }
    function requestBack() {
      backToList();
    }
    root.addEventListener("iot-request-back", requestBack);
    let mapEffects = true;
    let platformView = "summary",
      companyId = "",
      companyName = "",
      companyPage = 1,
      companyGroups = { companies: [], total: 0 },
      drawer = null,
      drawerDeviceId = "";
    let page = 1,
      deviceTotal = 0,
      alarmPage = 1,
      alarmTotal = 0,
      watchId = 0,
      searchTimer = null,
      requestVersion = 0,
      availableProvinces = [],
      currentMembers = [],
      alive = true,
      devices = [],
      alarms = [],
      tenants = [],
      context = {},
      selected = config.deviceId || null,
      detail = null,
      history = null,
      metric = "",
      tab = "devices",
      query = "",
      filter = "",
      province = "",
      geography = null,
      stale = false,
      overview = null,
      hours = 24,
      socket = null,
      timer = null,
      refreshing = false,
      dialog = null;
    const mode = config.mode || "customer",
      platform = mode === "platform",
      company = mode === "company",
      business = config.business === true;
    const workspace = config.workspace || "",
      api = config.apiBase.replace(/\/$/, ""),
      token = config.token,
      readOnly = !platform && !company;
    let role = company ? "admin" : "viewer";
    const suffix = (path) =>
      path +
      (workspace
        ? (path.includes("?") ? "&" : "?") +
          "workspace=" +
          encodeURIComponent(workspace)
        : "");
    async function call(path, body) {
      const r = await fetch(api + suffix("/iot" + path), {
        method: body === undefined ? "GET" : "POST",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const data = await r.json();
      if (!r.ok) {
        const e = Error(
          Array.isArray(data.message)
            ? data.message.join("；")
            : data.message || "请求失败",
        );
        e.status = r.status;
        throw e;
      }
      return data;
    }
    function error(message) {
      const box = root.querySelector(".iot-notice");
      if (box) {
        box.hidden = !message;
        box.textContent = message;
      }
    }
    function recoveryLink(status) {
      if (status !== 401 && status !== 403) return;
      const box = root.querySelector(".iot-notice");
      if (!box) return;
      const a = document.createElement("a");
      a.className = "iot-btn sm";
      a.href = business
        ? "../business/choose.html"
        : company
          ? "/login"
          : platform
            ? "/login.html"
            : "../login.html";
      a.textContent =
        status === 401 ? "重新登录" : business ? "切换身份" : "返回登录";
      box.append(" ", a);
    }
    const mayManage = () =>
        platform || (company && ["admin", "operator"].includes(role)),
      mayAdmin = () => platform || (company && role === "admin");
    function skeleton() {
      root.innerHTML =
        '<div class="iot-console ' +
        (platform ? "iot-platform" : "") +
        " " +
        (business ? "iot-business" : "") +
        '"><header class="iot-heading"><div><span class="iot-eyebrow">' +
        (platform
          ? "PLATFORM · DEVICE NETWORK"
          : company
            ? "DEVICE OPERATIONS"
            : "DEVICE INSIGHTS") +
        "</span><h1>" +
        (platform ? "全国设备监测" : company ? "设备监控" : "设备运行数据") +
        "</h1><p>" +
        (platform
          ? "从全国分布到每台设备，掌握接入状态与异常。"
          : company
            ? "设备状态、运行趋势与告警，在同一个工作空间查看。"
            : "查看有权限的设备监测信息，辅助使用和维修。") +
        '</p></div><div class="iot-heading-actions">' +
        (config.backUrl
          ? '<a class="iot-btn" href="' +
            esc(config.backUrl) +
            '">' +
            esc(config.backLabel || "返回") +
            "</a>"
          : "") +
        '<button class="iot-btn" data-action="refresh">刷新</button><span class="iot-sync" role="status">正在连接…</span></div></header><div class="iot-notice" role="status" hidden></div><div class="iot-toolbar"><input aria-label="搜索监控设备" placeholder="搜索设备型号 / SN" id="iot-query"><select aria-label="监控设备状态" id="iot-filter"><option value="">全部状态</option><option value="ONLINE">在线</option><option value="OFFLINE">离线</option><option value="NEVER">未上报</option><option value="DISABLED">已停用</option><option value="ALARM">当前告警</option></select><select aria-label="设备所在省份" id="iot-province"><option value="">全国地区</option></select><div class="iot-tabs"><button data-action="tab" data-tab="devices" class="active">设备监控</button><button data-action="tab" data-tab="alarms">告警中心</button>' +
        (platform
          ? '<button data-action="tab" data-tab="tenants">企业开通</button>'
          : company
            ? '<button data-action="tab" data-tab="members">手机授权</button>'
            : "") +
        '</div><span id="iot-main-actions"></span></div><main class="iot-live" aria-live="polite"><div class="iot-loading" role="status">正在读取设备监测数据…</div></main><footer class="iot-footer">在线状态基于最近心跳；设备详情保留采集与接收时间。标记“模拟”的设备仅用于流程演示。</footer></div>';
    }
    function visible() {
      return devices;
    }
    function filters() {
      return {
        page,
        pageSize: platform ? 20 : 24,
        search: query,
        status: filter,
        province,
        companyId: platform ? companyId : undefined,
      };
    }
    function listQuery() {
      return new URLSearchParams(
        Object.entries(filters()).filter(([, v]) => v !== undefined),
      ).toString();
    }
    function watch() {
      socket?.emit("watch", {
        workspace: workspace || undefined,
        query: filters(),
        watchId: ++watchId,
      });
    }
    function pager(kind, total, current) {
      const pages = Math.max(
        1,
        Math.ceil(
          total /
            (kind === "company" ? 8 : kind === "device" && platform ? 20 : 24),
        ),
      );
      return (
        '<nav class="iot-pagination" aria-label="' +
        (kind === "device" ? "设备" : kind === "company" ? "企业" : "告警") +
        '分页"><span>共 ' +
        total +
        " 条 · 第 " +
        current +
        " / " +
        pages +
        ' 页</span><button class="iot-btn sm" data-action="' +
        kind +
        '-page" data-page="' +
        (current - 1) +
        '" ' +
        (current <= 1 ? "disabled" : "") +
        '>上一页</button><button class="iot-btn sm" data-action="' +
        kind +
        '-page" data-page="' +
        (current + 1) +
        '" ' +
        (current >= pages ? "disabled" : "") +
        ">下一页</button></nav>"
      );
    }
    function metricsCard(d, all = false) {
      return (
        '<div class="iot-metrics">' +
        d.metrics
          .slice(0, all ? 24 : 3)
          .map(
            (m) =>
              '<div title="' +
              esc(
                d.metricTimes?.[m.key]
                  ? "采集：" + time(d.metricTimes[m.key])
                  : "该指标的采集时间尚未记录",
              ) +
              '"><span>' +
              esc(m.label) +
              "</span><strong>" +
              fmt(d.latest[m.key]) +
              "<small>" +
              esc(m.unit) +
              "</small></strong></div>",
          )
          .join("") +
        "</div>"
      );
    }
    function tile(d) {
      return (
        '<article class="iot-device-card"><div class="iot-device-top"><span class="iot-device-icon">' +
        icon() +
        '</span><div><button class="iot-device-title" data-action="device" data-id="' +
        d.id +
        '">' +
        esc(d.model) +
        "</button><small>SN " +
        esc(d.serialNumber) +
        '</small></div><span class="iot-badge ' +
        d.connectivity.toLowerCase() +
        '">' +
        status[d.connectivity] +
        '</span></div><div class="iot-device-meta"><span>' +
        esc(d.companyName) +
        "</span><span>" +
        esc(d.city || "位置未登记") +
        "</span>" +
        (d.simulated ? '<span class="iot-demo">模拟</span>' : "") +
        "</div>" +
        metricsCard(d) +
        '<div class="iot-device-bottom"><span>' +
        (d.latestAt ? "采集 " + time(d.latestAt) : "等待首次数据上报") +
        '</span><button data-action="device" data-id="' +
        d.id +
        '">' +
        (d.alarmCount ? "<b>" + d.alarmCount + " 条告警</b>" : "查看详情") +
        " ›</button></div></article>"
      );
    }
    function stats(rows) {
      const summary = overview?.summary || {};
      const counts = [
        [
          "接入设备",
          summary.total ?? rows.length,
          "当前筛选范围，包含全部分页",
        ],
        ["在线设备", summary.online ?? 0, "最近心跳正常"],
        ["当前告警", summary.alarms ?? 0, "异常与在线状态分别统计"],
        ["待接入 / 离线", summary.offline ?? 0, "未上报或心跳已超时"],
      ];
      return (
        '<section class="iot-stats">' +
        counts
          .map(
            (r, i) =>
              "<article><span>" +
              r[0] +
              '</span><strong class="stat-' +
              i +
              '">' +
              r[1] +
              "</strong><small>" +
              r[2] +
              "</small></article>",
          )
          .join("") +
        "</section>"
      );
    }
    function projection(point) {
      return [
        ((point[0] - 73) / 63) * 790 + 25,
        ((55 - point[1]) / 52) * 545 + 20,
      ];
    }
    function mapLocations() {
      return (overview?.locations || [])
        .filter((d) => d.longitude !== null && d.latitude !== null)
        .sort((a, b) =>
          (a.province + a.city + a.longitude).localeCompare(
            b.province + b.city + b.longitude,
          ),
        );
    }
    function mapNodes(locations) {
      return locations
        .map((d, i) => {
          const p = projection([d.longitude, d.latitude]),
            kind = d.alarms ? "alarm" : d.online > 0 ? "online" : "offline";
          const cityName = d.city.replace(/市$/, "");
          const offset =
            cityName === "深圳"
              ? [13, 19, "start"]
              : cityName === "广州"
                ? [-12, -13, "end"]
                : cityName === "杭州"
                  ? [-10, 20, "end"]
                  : [11, -12, "start"];
          const label =
            d.city +
            " · " +
            d.total +
            " 台设备 / " +
            d.online +
            " 台在线 / " +
            d.alarms +
            " 条告警";
          return (
            '<g class="iot-map-node is-' +
            kind +
            '" style="--node-delay:-' +
            (i * 0.61).toFixed(2) +
            's"><g class="iot-node-ripples" aria-hidden="true">' +
            (kind !== "offline"
              ? '<circle class="iot-node-wave" cx="' +
                p[0] +
                '" cy="' +
                p[1] +
                '" r="7"/><circle class="iot-node-wave second" cx="' +
                p[0] +
                '" cy="' +
                p[1] +
                '" r="7"/>'
              : "") +
            '</g><circle class="iot-node-halo" cx="' +
            p[0] +
            '" cy="' +
            p[1] +
            '" r="12" aria-hidden="true"/><circle class="iot-node-core map-' +
            kind +
            '" data-action="province" data-province="' +
            esc(d.province) +
            '" data-map-info="' +
            esc(label) +
            '" cx="' +
            p[0] +
            '" cy="' +
            p[1] +
            '" r="' +
            (kind === "alarm" ? 6 : 4) +
            '" role="button" tabindex="0" aria-label="' +
            esc(label) +
            '"><title>' +
            esc(label) +
            '</title></circle><text class="iot-node-label" x="' +
            (p[0] + offset[0]) +
            '" y="' +
            (p[1] + offset[1]) +
            '" text-anchor="' +
            offset[2] +
            '">' +
            esc(d.city.replace(/市$/, "")) +
            "</text></g>"
          );
        })
        .join("");
    }
    function updateMap(element) {
      const regions = overview?.provinces || [],
        locations = mapLocations(),
        counts = Object.fromEntries(regions.map((p) => [p.province, p.total]));
      element.classList.toggle("effects-off", !mapEffects);
      const button = element.querySelector(".iot-map-effect-toggle");
      button.textContent = "动效 " + (mapEffects ? "开" : "关");
      button.setAttribute("aria-pressed", String(mapEffects));
      element.querySelectorAll(".iot-province").forEach((el) => {
        const name = el.dataset.province,
          count = counts[name] || 0;
        el.classList.toggle("has-devices", count > 0);
        el.classList.toggle("selected", province === name);
        el.dataset.mapInfo = name + " · " + count + " 台接入设备";
        el.setAttribute("aria-label", "筛选" + name + "，" + count + "台设备");
        el.querySelector("title").textContent = el.dataset.mapInfo;
      });
      const signature = JSON.stringify(locations);
      if (element.dataset.nodes !== signature) {
        element.querySelector(".iot-map-nodes").innerHTML = mapNodes(locations);
        element.dataset.nodes = signature;
      }
      const registered = locations.reduce((sum, d) => sum + d.total, 0);
      element.querySelector(".iot-map-readout strong").innerHTML =
        registered + "<small> 台已定位</small>";
      element.querySelector(".iot-map-unlocated").textContent =
        "位置未登记 " +
        Math.max(0, (overview?.connectedCount || 0) - registered) +
        " 台";
    }
    function map(rows) {
      if (!geography)
        return '<section class="iot-map"><p>正在加载离线地图资源…</p></section>';
      const regions = overview?.provinces || [],
        locations = (overview?.locations || [])
          .filter((d) => d.longitude !== null && d.latitude !== null)
          .sort((a, b) =>
            (a.province + a.city + a.longitude).localeCompare(
              b.province + b.city + b.longitude,
            ),
          );
      const counts = Object.fromEntries(
        regions.map((p) => [p.province, p.total]),
      );
      const signature = JSON.stringify({
        province,
        effects: mapEffects,
        regions,
        locations: locations.map((d) => ({
          province: d.province,
          city: d.city,
          longitude: d.longitude,
          latitude: d.latitude,
          total: d.total,
        })),
      });
      const prefix = mapId,
        defs = [],
        land = [],
        depth = [],
        clip = [];
      for (const [index, f] of geography.regions.entries()) {
        const path = f.path,
          name = f.name,
          id = prefix + "-region-" + index;
        defs.push('<path id="' + id + '" d="' + path + '"/>');
        clip.push('<use href="#' + id + '"/>');
        depth.push('<use href="#' + id + '"/>');
        land.push(
          '<use href="#' +
            id +
            '" class="iot-province ' +
            (counts[name] ? "has-devices " : "") +
            (province === name ? "selected" : "") +
            '" data-action="province" data-province="' +
            esc(name) +
            '" data-map-info="' +
            esc(name + " · " + (counts[name] || 0) + " 台接入设备") +
            '" role="button" tabindex="0" aria-label="' +
            esc("筛选" + name + "，" + (counts[name] || 0) + "台设备") +
            '"><title>' +
            esc(name) +
            " · " +
            (counts[name] || 0) +
            " 台接入设备</title></use>",
        );
      }
      const points = mapNodes(locations);
      const registered = locations.reduce((sum, d) => sum + d.total, 0),
        unlocated = Math.max(0, (overview?.connectedCount || 0) - registered);
      return (
        '<section class="iot-map iot-map-studio ' +
        (mapEffects ? "" : "effects-off") +
        '" data-signature="' +
        esc(signature) +
        '"><div class="iot-section-head"><div><span class="iot-eyebrow">NATIONWIDE · DEVICE NETWORK</span><h2>全国设备分布</h2></div><div class="iot-map-controls"><span class="iot-map-live"><i></i>接入分布</span><button class="iot-map-effect-toggle" data-action="map-effects" aria-pressed="' +
        mapEffects +
        '">动效 ' +
        (mapEffects ? "开" : "关") +
        '</button></div></div><div class="iot-map-stage"><div class="iot-map-grid" aria-hidden="true"></div><div class="iot-map-corner top-left" aria-hidden="true"></div><div class="iot-map-corner bottom-right" aria-hidden="true"></div><svg viewBox="0 0 850 590" role="group" aria-label="全国设备监测分布地图"><defs>' +
        defs.join("") +
        '<linearGradient id="' +
        prefix +
        '-land" x1="0" y1="0" x2="0.3" y2="1"><stop stop-color="#153c66"/><stop offset=".5" stop-color="#174b73"/><stop offset="1" stop-color="#092b4e"/></linearGradient><linearGradient id="' +
        prefix +
        '-active" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#1d6696"/><stop offset="1" stop-color="#144363"/></linearGradient><linearGradient id="' +
        prefix +
        '-scan"><stop stop-color="#63e4ff" stop-opacity="0"/><stop offset=".5" stop-color="#9befff" stop-opacity=".24"/><stop offset="1" stop-color="#63e4ff" stop-opacity="0"/></linearGradient><pattern id="' +
        prefix +
        '-dots" width="8" height="8" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".55" fill="#72c3ee" opacity=".3"/></pattern><filter id="' +
        prefix +
        '-glow" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="2"/></filter><clipPath id="' +
        prefix +
        '-clip">' +
        clip.join("") +
        '</clipPath></defs><g class="iot-map-orbits" aria-hidden="true"><ellipse cx="440" cy="355" rx="332" ry="155"/><ellipse cx="440" cy="355" rx="369" ry="173" class="outer"/><path d="M80 355H800M440 183V527"/></g><g class="iot-map-depth" transform="translate(0 9)" aria-hidden="true">' +
        depth.join("") +
        '</g><g class="iot-map-rim" filter="url(#' +
        prefix +
        '-glow)" aria-hidden="true">' +
        depth.join("") +
        '</g><g class="iot-map-land" style="--map-land:url(#' +
        prefix +
        "-land);--map-active:url(#" +
        prefix +
        '-active)">' +
        land.join("") +
        '</g><g clip-path="url(#' +
        prefix +
        '-clip)" aria-hidden="true" class="iot-map-surface"><rect width="850" height="590" fill="url(#' +
        prefix +
        '-dots)"/><rect class="iot-map-scan" x="-220" y="0" width="220" height="590" fill="url(#' +
        prefix +
        '-scan)"/></g><g class="iot-map-nodes">' +
        points +
        '</g></svg><div class="iot-scan-light" aria-hidden="true"></div><div class="iot-map-tooltip" hidden role="status"></div><div class="iot-map-readout" aria-hidden="true"><span>NETWORK COVERAGE</span><strong>' +
        registered +
        '<small> 台已定位</small></strong></div></div><div class="iot-map-bottom"><div class="iot-map-legend"><span><i class="online"></i>在线</span><span><i class="alarm"></i>告警</span><span><i class="offline"></i>离线 / 未上报</span></div><span class="iot-map-unlocated">位置未登记 ' +
        unlocated +
        " 台</span></div></section>"
      );
    }
    function alarmTable(rows) {
      if (!rows.length)
        return '<div class="iot-empty"><strong>暂无告警记录</strong><p>设备触发规则后，将在这里展示异常与处理过程。</p></div>';
      return (
        '<div class="iot-table-wrap"><table><thead><tr><th>设备 / 企业</th><th>异常指标</th><th>检测时间</th><th>状态</th><th>处理</th></tr></thead><tbody>' +
        rows
          .map(
            (a) =>
              '<tr><td><button class="iot-text-btn" data-action="device" data-id="' +
              a.deviceId +
              '">' +
              esc(a.model) +
              "</button><small>" +
              esc(a.serialNumber) +
              " · " +
              esc(a.companyName) +
              "</small></td><td>" +
              esc(a.label) +
              " <strong>" +
              fmt(a.value) +
              "</strong><small>" +
              esc(a.threshold) +
              "</small></td><td>" +
              time(a.startedAt) +
              '</td><td><span class="iot-badge ' +
              (a.recoveredAt ? "recovered" : "alarm") +
              '">' +
              (a.recoveredAt
                ? a.resolutionReason === "RULE_CHANGED"
                  ? "规则已调整"
                  : a.resolutionReason === "DEVICE_DISABLED"
                    ? "设备已停用"
                    : "已恢复"
                : "告警中") +
              "</span><small>" +
              (a.acknowledgedAt ? "已确认" : "待确认") +
              "</small></td><td>" +
              (a.ticketNumber
                ? '<span class="iot-ticket">服务单 ' +
                  esc(a.ticketNumber) +
                  "</span>"
                : mayManage()
                  ? '<button class="iot-btn sm" data-action="ticket" data-id="' +
                    a.id +
                    '">生成平台服务单</button>'
                  : "") +
              (mayManage()
                ? '<button class="iot-text-btn" data-action="ack" data-id="' +
                  a.id +
                  '">记录处理</button>'
                : "") +
              "</td></tr>",
          )
          .join("") +
        "</tbody></table></div>"
      );
    }
    function chart() {
      const points = history?.points || [];
      if (!points.length)
        return '<div class="iot-chart-empty">所选时间段暂无监测数据</div>';
      const width = 800,
        height = 220,
        values = points.map((p) => p.value),
        min = Math.min(...values),
        max = Math.max(...values),
        span = Math.max(max - min, 1);
      const poly = points
        .map(
          (p, i) =>
            (
              ((new Date(p.at) - new Date(points[0].at)) /
                Math.max(
                  new Date(points.at(-1).at) - new Date(points[0].at),
                  1,
                )) *
                760 +
              20
            ).toFixed(1) +
            "," +
            (190 - ((p.value - min) / span) * 160).toFixed(1),
        )
        .join(" ");
      return (
        '<div class="iot-chart"><div><span>' +
        fmt(max) +
        "</span><span>" +
        fmt(min) +
        '</span></div><svg viewBox="0 0 ' +
        width +
        " " +
        height +
        '" role="img" aria-label="' +
        esc(history.metric) +
        '历史趋势"><path d="M20 30H780M20 110H780M20 190H780" stroke="currentColor" opacity=".1"/><polyline fill="none" stroke="var(--iot-accent)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" points="' +
        poly +
        '"/></svg></div><div class="iot-chart-times"><span>' +
        time(points[0].at) +
        "</span><span>" +
        time(points.at(-1).at) +
        "</span></div>"
      );
    }
    function companyCharts() {
      if (!company || !analytics) return "";
      analytics.statuses.sort(
        (a, b) =>
          ["ONLINE", "OFFLINE", "NEVER", "DISABLED"].indexOf(a.status) -
          ["ONLINE", "OFFLINE", "NEVER", "DISABLED"].indexOf(b.status),
      );
      const colors = analytics.statuses.map(
        (r) =>
          ({
            ONLINE: "#2274e5",
            OFFLINE: "#93a4b8",
            NEVER: "#cbd5e1",
            DISABLED: "#78889b",
          })[r.status] || "#78889b",
      );
      const total = analytics.statuses.reduce((n, r) => n + r.total, 0);
      let offset = 0;
      const segments = analytics.statuses.map((r, i) => {
        const start = offset;
        offset += total ? (r.total / total) * 100 : 0;
        return colors[i % colors.length] + " " + start + "% " + offset + "%";
      });
      const legend = analytics.statuses
        .map(
          (r, i) =>
            '<li><i style="background:' +
            colors[i % colors.length] +
            '"></i><span>' +
            esc(status[r.status] || r.status) +
            "</span><strong>" +
            fmt(r.total) +
            " 台</strong></li>",
        )
        .join("");
      function bars(rows, label, suffix) {
        const max = Math.max(1, ...rows.map((r) => r.total));
        return (
          '<div class="iot-analytics-bars">' +
          rows
            .map(
              (r, i) =>
                '<div class="iot-analytics-bar" title="' +
                esc(label(r)) +
                "：" +
                r.total +
                suffix +
                '"><span>' +
                fmt(r.total) +
                '</span><i style="height:' +
                Math.max(r.total ? 3 : 0, (r.total / max) * 95) +
                'px"></i><small>' +
                esc(label(r)) +
                "</small></div>",
            )
            .join("") +
          "</div>"
        );
      }
      const types = analytics.types
        .map(
          (r) =>
            "<li><div><span>" +
            esc(r.label) +
            "</span><strong>" +
            fmt(r.total) +
            ' 台</strong></div><meter min="0" max="' +
            Math.max(total, 1) +
            '" value="' +
            r.total +
            '">' +
            r.total +
            "</meter></li>",
        )
        .join("");
      const sum = (rows) => rows.reduce((n, r) => n + r.total, 0);
      return (
        '<section class="iot-company-analytics" aria-label="企业设备统计"><div class="iot-analytics-heading"><h2>运行统计</h2><span>当前筛选 · 全部分页 · 北京时间</span></div><div class="iot-analytics-grid">' +
        '<article class="iot-panel iot-analytics-card"><h3>设备状态分布</h3><p>当前接入设备 ' +
        total +
        ' 台</p><div class="iot-status-chart"><div class="iot-status-donut" style="background:conic-gradient(' +
        (segments.join(",") || "#e6edf5 0% 100%") +
        ')"><strong>' +
        total +
        "<small>台设备</small></strong></div><ul>" +
        (legend || "<li>暂无接入设备</li>") +
        "</ul></div></article>" +
        '<article class="iot-panel iot-analytics-card"><h3>设备类型分布</h3><p>按设备档案中的类型汇总</p><ul class="iot-type-bars">' +
        (types || "<li>暂无接入设备</li>") +
        "</ul></article>" +
        '<article class="iot-panel iot-analytics-card"><h3>近7天告警趋势 <strong>' +
        sum(analytics.alarms) +
        "<small> 次</small></strong></h3><p>按告警发生日期统计，含已恢复告警</p>" +
        bars(analytics.alarms, (r) => r.day.slice(5), " 次告警") +
        "</article>" +
        '<article class="iot-panel iot-analytics-card"><h3>近24小时上报量 <strong>' +
        fmt(sum(analytics.activity)) +
        "<small> 条</small></strong></h3><p>按采集时间统计；每根柱代表一小时</p>" +
        bars(
          analytics.activity,
          (r) =>
            new Date(r.at)
              .toLocaleTimeString("zh-CN", {
                hour: "2-digit",
                timeZone: "Asia/Shanghai",
                hour12: false,
              })
              .replace("时", "") + "时",
          " 条上报",
        ) +
        "</article></div></section>"
      );
    }
    function deviceDetail() {
      if (!detail) return '<div class="iot-empty">正在读取设备数据…</div>';
      const d = devices.find((x) => x.id === detail.id) || detail;
      return (
        '<button class="iot-text-btn iot-back" data-action="back">‹ 返回设备列表</button><section class="iot-panel iot-detail-head"><div class="iot-section-head"><div><span class="iot-eyebrow">' +
        esc(d.companyName) +
        (d.simulated ? " · 模拟设备" : "") +
        "</span><h2>" +
        esc(d.model) +
        "</h2><p>SN " +
        esc(d.serialNumber) +
        " · " +
        esc(d.city || "位置未登记") +
        '</p></div><span class="iot-badge ' +
        d.connectivity.toLowerCase() +
        '">' +
        status[d.connectivity] +
        "</span></div>" +
        metricsCard(d, true) +
        '<div class="iot-detail-meta"><span>采集：' +
        time(d.latestAt) +
        "</span><span>接收：" +
        time(d.lastReceivedAt) +
        "</span></div>" +
        (d.connectivity !== "ONLINE" || d.dataStale
          ? '<p class="iot-stale">当前数值为最近留存记录，不代表设备此刻的状态。</p>'
          : "") +
        '<div class="iot-detail-actions">' +
        (mayAdmin()
          ? '<button class="iot-btn" data-action="configure">监控配置</button><button class="iot-btn" data-action="credential">轮换设备凭证</button>'
          : "") +
        (mode === "customer"
          ? '<a class="iot-btn primary" href="../repair-form.html?deviceId=' +
            esc(detail.deviceRef) +
            '">报修这台设备</a>'
          : "") +
        '</div></section><section class="iot-panel"><div class="iot-section-head"><h2>运行趋势</h2><select id="iot-hours" aria-label="历史时间范围">' +
        [
          [1, "最近1小时"],
          [24, "最近24小时"],
          [72, "最近3天"],
          [168, "最近7天"],
          [720, "最近30天"],
        ]
          .map(
            (r) =>
              '<option value="' +
              r[0] +
              '" ' +
              (hours === r[0] ? "selected" : "") +
              ">" +
              r[1] +
              "</option>",
          )
          .join("") +
        '</select><select id="iot-metric" aria-label="监测指标">' +
        d.metrics
          .map(
            (m) =>
              '<option value="' +
              m.key +
              '" ' +
              (metric === m.key ? "selected" : "") +
              ">" +
              esc(m.label) +
              " (" +
              esc(m.unit) +
              ")</option>",
          )
          .join("") +
        "</select></div>" +
        chart() +
        '</section><section class="iot-panel"><div class="iot-section-head"><h2>设备告警与处理记录</h2><span>告警不是维修诊断结论</span></div>' +
        alarmTable(alarms.filter((a) => a.deviceId === d.id)) +
        pager("alarm", alarmTotal, alarmPage) +
        "</section>"
      );
    }
    function deviceTable(rows) {
      return (
        '<div class="iot-table-wrap iot-fleet-table"><table><thead><tr><th>设备 / 序列号</th><th>所属企业</th><th>城市</th><th>连接状态</th><th>当前告警</th><th>最近采集</th><th>操作</th></tr></thead><tbody>' +
        rows
          .map(
            (d) =>
              '<tr data-device-row="' +
              d.id +
              '"><td><button class="iot-text-btn" data-action="device" data-id="' +
              d.id +
              '">' +
              esc(d.model) +
              "</button><small>SN " +
              esc(d.serialNumber) +
              (d.simulated ? " · 模拟" : "") +
              "</small></td><td>" +
              esc(d.companyName) +
              "</td><td>" +
              esc(d.city || "未登记") +
              '</td><td><span class="iot-badge ' +
              d.connectivity.toLowerCase() +
              '">' +
              status[d.connectivity] +
              "</span></td><td>" +
              (d.alarmCount
                ? '<span class="iot-fleet-warning">' +
                  d.alarmCount +
                  " 条</span>"
                : '<span class="iot-fleet-quiet">—</span>') +
              "</td><td>" +
              time(d.latestAt) +
              '</td><td><button class="iot-btn sm" data-action="device" data-id="' +
              d.id +
              '">查看详情</button></td></tr>',
          )
          .join("") +
        "</tbody></table>" +
        (!rows.length
          ? '<div class="iot-empty">当前条件下暂无设备，请调整搜索或筛选条件。</div>'
          : "") +
        "</div>"
      );
    }
    function platformSummary() {
      const companies = companyGroups.companies || [],
        attention = overview?.attention || [];
      return (
        '<div class="iot-platform-summary-grid"><section class="iot-panel"><div class="iot-section-head"><div><h2>企业接入概况</h2><p>先看企业整体运行情况，再查看旗下设备。</p></div><span>' +
        companyGroups.total +
        ' 家企业</span></div><div class="iot-table-wrap iot-company-table"><table><thead><tr><th>入驻企业</th><th>设备</th><th>在线率</th><th>告警</th><th>离线 / 未上报</th></tr></thead><tbody>' +
        companies
          .map(
            (c) =>
              '<tr class="iot-company-row"><td><button class="iot-company-name" data-action="company-devices" data-id="' +
              c.id +
              '" data-name="' +
              esc(c.name) +
              '">' +
              esc(c.name) +
              "</button><small>停用 " +
              c.disabled +
              " 台</small></td><td>" +
              c.total +
              ' 台</td><td><span class="iot-rate">' +
              c.onlineRate +
              '%<i style="--online-rate:' +
              c.onlineRate +
              '%"></i></span><small>' +
              c.online +
              " 台在线</small></td><td>" +
              (c.alarms
                ? '<button class="iot-text-btn iot-fleet-warning" data-action="company-devices" data-id="' +
                  c.id +
                  '" data-name="' +
                  esc(c.name) +
                  '" data-status="ALARM">' +
                  c.alarms +
                  " 条</button>"
                : "—") +
              "</td><td>" +
              c.offline +
              " / " +
              c.never +
              "</td></tr>",
          )
          .join("") +
        "</tbody></table>" +
        (!companies.length
          ? '<div class="iot-empty">当前筛选下暂无接入企业</div>'
          : "") +
        "</div>" +
        pager("company", companyGroups.total, companyPage) +
        '</section><section class="iot-panel iot-attention-panel"><div class="iot-section-head"><div><h2>需要关注</h2><p>优先展示告警、离线和未上报，最多6台。</p></div></div><div class="iot-attention-list">' +
        (attention.length
          ? attention
              .map(
                (d) =>
                  '<article class="iot-attention-item"><div><button class="iot-company-name" data-action="device" data-id="' +
                  d.id +
                  '">' +
                  esc(d.model) +
                  "</button><small>" +
                  esc(d.companyName) +
                  " · " +
                  esc(d.city || "位置未登记") +
                  "</small><small>SN " +
                  esc(d.serialNumber) +
                  '</small></div><div><span class="iot-badge ' +
                  (d.alarmCount ? "alarm" : d.connectivity.toLowerCase()) +
                  '">' +
                  (d.alarmCount
                    ? d.alarmCount + " 条告警"
                    : status[d.connectivity]) +
                  '</span><button class="iot-text-btn" data-action="device" data-id="' +
                  d.id +
                  '">查看详情</button></div></article>',
              )
              .join("")
          : '<div class="iot-empty"><strong>暂无需要关注的设备</strong><p>当前筛选范围内设备运行正常。</p></div>') +
        "</div></section></div>"
      );
    }
    function preserveMap(previousMap, updatedMap) {
      const oldNodes = previousMap.querySelectorAll(".iot-map-node");
      updatedMap.querySelectorAll(".iot-map-node").forEach((node, i) => {
        const old = oldNodes[i];
        if (!old) return;
        if (old.getAttribute("class") !== node.getAttribute("class")) {
          old.replaceWith(node.cloneNode(true));
          return;
        }
        const target = old.querySelector(".iot-node-core"),
          fresh = node.querySelector(".iot-node-core");
        target.dataset.mapInfo = fresh.dataset.mapInfo;
        target.setAttribute("aria-label", fresh.getAttribute("aria-label"));
        target.querySelector("title").textContent =
          fresh.querySelector("title").textContent;
      });
    }
    function renderPlatform(live) {
      const next = document.createElement("div"),
        previousMap = live.querySelector(".iot-map-studio");
      const regional =
        '<section class="iot-panel iot-region-panel"><div class="iot-section-head"><h2>区域接入概况</h2></div>' +
        (overview?.provinces || [])
          .map(
            (g) =>
              '<button class="iot-region" data-action="province" data-province="' +
              esc(g.province) +
              '"><span>' +
              esc(g.province || "位置未登记") +
              "</span><strong>" +
              g.total +
              ' <small>台</small></strong><i style="width:' +
              Math.max(4, (g.total / Math.max(deviceTotal, 1)) * 100) +
              '%"></i></button>',
          )
          .join("") +
        '<div class="iot-data-label">' +
        (overview?.simulatedCount || 0) +
        " 台模拟设备</div></section>";
      next.innerHTML =
        stats(devices) +
        (platformView === "summary"
          ? '<div class="iot-national-grid">' +
            (previousMap
              ? '<div class="iot-map-placeholder"></div>'
              : map(devices)) +
            regional +
            "</div>"
          : "") +
        '<section class="iot-platform-lower"><div class="iot-fleet-heading"><div><h2>' +
        (platformView === "summary" ? "设备运营概况" : "设备查询") +
        "</h2><p>" +
        (platformView === "summary"
          ? "按企业汇总，重点关注异常。"
          : "搜索定位设备，点击详情查看指标与趋势。") +
        '</p></div><button class="iot-btn ' +
        (platformView === "summary" ? "primary" : "") +
        '" data-action="platform-view" data-view="' +
        (platformView === "summary" ? "devices" : "summary") +
        '">' +
        (platformView === "summary" ? "查看全部设备" : "返回全国总览") +
        "</button></div>" +
        (companyId
          ? '<div class="iot-company-filter">当前企业：<strong>' +
            esc(companyName) +
            '</strong><button class="iot-text-btn" data-action="clear-company">清除企业筛选</button></div>'
          : "") +
        (platformView === "summary"
          ? platformSummary()
          : '<section class="iot-panel"><div class="iot-section-head"><h2>全部设备</h2><span>共 ' +
            deviceTotal +
            " 台 · 每页20台</span></div>" +
            deviceTable(devices) +
            pager("device", deviceTotal, page) +
            "</section>") +
        "</section>";
      if (previousMap && platformView === "summary") {
        updateMap(previousMap);
        for (const selector of [
          ".iot-stats",
          ".iot-region-panel",
          ".iot-platform-lower",
        ]) {
          const old = live.querySelector(selector),
            fresh = next.querySelector(selector);
          if (old && fresh) old.replaceWith(fresh);
        }
      } else live.replaceChildren(...next.childNodes);
      observeMap();
    }
    function renderDrawer() {
      if (!platform) return;
      if (!selected) {
        if (drawer) {
          const old = drawer;
          drawer = null;
          old.close();
          old.remove();
        }
        return;
      }
      if (!drawer) {
        drawer = document.createElement("dialog");
        drawer.className = "iot-device-drawer";
        drawer.setAttribute("aria-label", "设备运行详情");
        drawer.innerHTML =
          '<header class="iot-drawer-header"><div><span>DEVICE INSIGHTS</span><h2>设备运行详情</h2></div><button class="iot-btn sm" data-action="close-drawer" aria-label="关闭设备详情">关闭</button></header><div class="iot-drawer-content"></div>';
        root.append(drawer);
        drawerDeviceId = selected;
        const current = drawer;
        current.addEventListener("close", () => {
          if (drawer === current) {
            drawer = null;
            selectionVersion++;
            selected = null;
            detail = null;
            history = null;
            current.remove();
            root
              .querySelector(
                '[data-action="device"][data-id="' + drawerDeviceId + '"]',
              )
              ?.focus({ preventScroll: true });
          }
        });
        current.addEventListener("click", (e) => {
          if (e.target === current) current.close();
        });
        current.showModal();
      }
      const focusId = drawer.contains(document.activeElement)
        ? document.activeElement.id
        : null;
      drawer.querySelector(".iot-drawer-content").innerHTML = deviceDetail();
      if (focusId)
        drawer.querySelector("#" + focusId)?.focus({ preventScroll: true });
    }
    async function render() {
      if (!alive) return;
      const live = root.querySelector(".iot-live");
      if (!live) return;
      config.onViewChange?.({ detail: !!selected });
      root
        .querySelectorAll("[data-tab]")
        .forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
      root.querySelector("#iot-main-actions").innerHTML =
        mayAdmin() && company
          ? '<button class="iot-btn primary" data-action="enroll">接入现有设备</button>'
          : "";
      const provinceEl = root.querySelector("#iot-province"),
        known = [
          ...(overview?.provinces || []).map((p) => p.province).filter(Boolean),
        ].sort();
      if (!province) availableProvinces = known;
      const choices = availableProvinces.length ? availableProvinces : known;
      if (provinceEl.dataset.options !== JSON.stringify(choices)) {
        provinceEl.innerHTML =
          '<option value="">全国地区</option>' +
          choices.map((p) => "<option>" + esc(p) + "</option>").join("");
        provinceEl.value = province;
        provinceEl.dataset.options = JSON.stringify(choices);
      }
      if (selected && !platform) {
        live.innerHTML = deviceDetail();
        return;
      }
      if (platform && !selected) renderDrawer();
      const rows = visible();
      if (tab === "tenants") {
        live.innerHTML =
          '<section class="iot-panel"><div class="iot-section-head"><div><h2>企业物联网开通</h2><p>开通范围同时约束设备接入、查询与实时订阅。</p></div></div><div class="iot-table-wrap"><table><thead><tr><th>企业</th><th>物联网状态</th><th>设备上限</th><th>历史查询</th><th>有效期</th><th>操作</th></tr></thead><tbody>' +
          tenants
            .map(
              (t) =>
                "<tr><td>" +
                esc(t.name) +
                '</td><td><span class="iot-badge ' +
                (t.subscription.enabled &&
                (!t.subscription.expires_at ||
                  new Date(t.subscription.expires_at) > new Date())
                  ? "online"
                  : "offline") +
                '">' +
                (t.subscription.expires_at &&
                new Date(t.subscription.expires_at) <= new Date()
                  ? "已到期"
                  : t.subscription.enabled
                    ? "已开通"
                    : "未开通") +
                "</span></td><td>" +
                t.subscription.device_limit +
                "</td><td>" +
                t.subscription.retention_days +
                " 天</td><td>" +
                (t.subscription.expires_at
                  ? time(t.subscription.expires_at)
                  : "不限期") +
                '</td><td><button class="iot-btn sm" data-action="subscription" data-id="' +
                t.id +
                '">配置服务</button></td></tr>',
            )
            .join("") +
          "</tbody></table></div></section>";
        return;
      }
      if (tab === "members") {
        try {
          const members = await call("/members");
          currentMembers = members;
          if (!alive || tab !== "members") return;
          live.innerHTML =
            '<section class="iot-panel"><div class="iot-section-head"><div><h2>企业手机授权</h2><p>授权后，员工使用手机号登录客户端即可选择企业工作台。</p></div>' +
            (mayAdmin()
              ? '<button class="iot-btn primary" data-action="member">授权员工</button>'
              : "") +
            '</div><div class="iot-table-wrap"><table><thead><tr><th>员工</th><th>手机号</th><th>权限</th><th>状态</th><th>操作</th></tr></thead><tbody>' +
            members
              .map(
                (m) =>
                  "<tr><td>" +
                  esc(m.person?.name) +
                  "</td><td>" +
                  esc(m.person?.phone) +
                  "</td><td>" +
                  {
                    viewer: "仅查看",
                    operator: "告警处理",
                    admin: "物联网管理",
                  }[m.role] +
                  "</td><td>" +
                  (m.enabled ? "已授权" : "已停用") +
                  '</td><td><button class="iot-btn sm" data-action="revoke" data-phone="' +
                  esc(m.person?.phone) +
                  '" data-role="' +
                  m.role +
                  '" data-enabled="' +
                  !m.enabled +
                  '">' +
                  (m.enabled ? "停用授权" : "恢复授权") +
                  "</button></td></tr>",
              )
              .join("") +
            "</tbody></table></div></section>";
        } catch (e) {
          live.innerHTML =
            '<div class="iot-empty">' + esc(e.message) + "</div>";
        }
        return;
      }
      if (tab === "alarms") {
        const ids = new Set(rows.map((d) => d.id));
        live.innerHTML =
          stats(rows) +
          '<section class="iot-panel"><div class="iot-section-head"><h2>告警中心</h2><span>确认、恢复与转单分别记录</span></div>' +
          alarmTable(alarms) +
          pager("alarm", alarmTotal, alarmPage) +
          "</section>";
        return;
      }
      if (platform) {
        renderPlatform(live);
        renderDrawer();
        return;
      }
      const previousMap = live.querySelector(".iot-map-studio");
      const nextView = document.createElement("div");
      nextView.innerHTML =
        (platform && overview
          ? '<div class="iot-coverage">设备档案 ' +
            overview.inventoryCount +
            " 台 · 当前筛选已接入 " +
            overview.connectedCount +
            " 台 · 覆盖企业 " +
            overview.companyCount +
            " 家 · 模拟设备 " +
            overview.simulatedCount +
            " 台</div>"
          : "") +
        stats(rows) +
        companyCharts() +
        (platform
          ? '<div class="iot-national-grid">' +
            map(rows) +
            '<section class="iot-panel iot-region-panel"><div class="iot-section-head"><h2>区域接入概况</h2></div>' +
            (overview?.provinces || [])
              .map(
                (group) =>
                  '<button class="iot-region" data-action="province" data-province="' +
                  esc(group.province) +
                  '"><span>' +
                  esc(group.province || "位置未登记") +
                  "</span><strong>" +
                  group.total +
                  ' <small>台</small></strong><i style="width:' +
                  Math.max(4, (group.total / Math.max(deviceTotal, 1)) * 100) +
                  '%"></i></button>',
              )
              .join("") +
            '<div class="iot-data-label">' +
            (overview?.simulatedCount || 0) +
            " 台模拟设备 · " +
            (deviceTotal - (overview?.simulatedCount || 0)) +
            " 台真实接入</div></section></div>"
          : "") +
        '<div class="iot-section-head iot-list-heading"><h2>' +
        (platform ? "设备明细" : "设备列表") +
        "</h2><span>" +
        deviceTotal +
        ' 台</span></div><section class="iot-device-grid">' +
        (rows.length
          ? rows.map(tile).join("")
          : '<div class="iot-empty"><strong>暂无可查看的监测设备</strong><p>' +
            (company
              ? "先为设备开通接入，并配置采集凭证。"
              : "设备未接入监测，或当前身份尚无查看权限。") +
            "</p></div>") +
        "</section>" +
        pager("device", deviceTotal, page);
      const updatedMap = nextView.querySelector(".iot-map-studio");
      if (
        previousMap &&
        updatedMap &&
        previousMap.dataset.signature === updatedMap.dataset.signature
      ) {
        const oldNodes = previousMap.querySelectorAll(".iot-map-node");
        updatedMap.querySelectorAll(".iot-map-node").forEach((node, i) => {
          const old = oldNodes[i];
          if (!old) return;
          if (old.getAttribute("class") !== node.getAttribute("class")) {
            old.replaceWith(node.cloneNode(true));
            return;
          }
          const target = old.querySelector(".iot-node-core"),
            fresh = node.querySelector(".iot-node-core");
          target.dataset.mapInfo = fresh.dataset.mapInfo;
          target.setAttribute("aria-label", fresh.getAttribute("aria-label"));
          target.querySelector("title").textContent =
            fresh.querySelector("title").textContent;
        });
        // Update siblings in place: detaching a live map would restart its CSS timeline.
        for (const selector of [
          ".iot-coverage",
          ".iot-stats",
          ".iot-region-panel",
          ".iot-list-heading",
          ".iot-device-grid",
          ".iot-pagination",
        ]) {
          const old = live.querySelector(selector),
            fresh = nextView.querySelector(selector);
          if (old && fresh) old.replaceWith(fresh);
        }
      } else {
        live.replaceChildren(...nextView.childNodes);
      }
    }
    async function select(id) {
      const revision = ++selectionVersion;
      if (!selected) {
        listScroll = window.scrollY;
        listAlarmPage = alarmPage;
      }
      selected = id;
      if (config.business) window.scrollTo(0, 0);
      alarmPage = 1;
      detail = null;
      history = null;
      await render();
      try {
        const loadedDetail = await call("/devices/" + id);
        if (!alive || revision !== selectionVersion || !selected) return;
        detail = loadedDetail;
        selected = detail.id;
        if (!detail.metrics.some((m) => m.key === metric))
          metric = detail.metrics[0]?.key;
        if (metric)
          history = await call(
            "/devices/" +
              selected +
              "/history?hours=" +
              hours +
              "&metric=" +
              encodeURIComponent(metric),
          );
        const alarmResult = await call(
          "/alarms?page=" + alarmPage + "&pageSize=24&deviceId=" + selected,
        );
        if (!alive || revision !== selectionVersion || !selected) return;
        alarms = alarmResult.alarms;
        alarmTotal = alarmResult.total;
        await render();
        error("");
      } catch (e) {
        if (revision !== selectionVersion) return;
        selected = null;
        await render();
        error(e.message);
      }
    }
    async function refresh() {
      if (!alive) return;
      if (refreshing) {
        requestVersion++;
        return;
      }
      refreshing = true;
      try {
        const revision = ++requestVersion;
        const [v, a, o, groups, charts] = await Promise.all([
          call("/devices?" + listQuery()),
          call(
            "/alarms?page=" +
              alarmPage +
              "&pageSize=24" +
              (selected ? "&deviceId=" + selected : "") +
              "&search=" +
              encodeURIComponent(query) +
              "&status=" +
              filter +
              "&province=" +
              encodeURIComponent(province) +
              (platform && companyId
                ? "&companyId=" + encodeURIComponent(companyId)
                : ""),
          ),
          call("/overview?" + listQuery()),
          platform
            ? call(
                "/companies?" +
                  new URLSearchParams({
                    page: companyPage,
                    pageSize: 8,
                    search: query,
                    status: filter,
                    province,
                    companyId,
                  }).toString(),
              )
            : Promise.resolve(null),
          company ? call("/analytics?" + listQuery()) : Promise.resolve(null),
        ]);
        if (!alive || revision !== requestVersion) {
          setTimeout(refresh, 0);
          return;
        }
        devices = v.devices;
        deviceTotal = v.total;
        alarms = a.alarms;
        alarmTotal = a.total;
        overview = o;
        analytics = charts;
        if (groups) companyGroups = groups;
        if (platform) tenants = await call("/tenants");
        if (selected) {
          detail = await call("/devices/" + selected);
          if (!detail.metrics.some((m) => m.key === metric))
            metric = detail.metrics[0]?.key;
          if (metric)
            history = await call(
              "/devices/" +
                detail.id +
                "/history?hours=" +
                hours +
                "&metric=" +
                encodeURIComponent(metric),
            );
        }
        stale = false;
        if (!dialog && document.activeElement?.tagName !== "INPUT")
          await render();
        const sync = root.querySelector(".iot-sync");
        if (sync)
          sync.textContent =
            "更新于 " +
            new Date().toLocaleTimeString("zh-CN", { hour12: false });
        error("");
      } catch (e) {
        stale = true;
        if ([401, 403, 404].includes(e.status)) {
          devices = [];
          alarms = [];
          detail = null;
          selected = null;
          overview = null;
          analytics = null;
          deviceTotal = 0;
          alarmTotal = 0;
          closeDialog();
          await render();
          socket?.disconnect();
        }
        error(e.message);
        recoveryLink(e.status);
      } finally {
        refreshing = false;
      }
    }
    function closeDialog() {
      if (dialog) {
        dialog.close();
        dialog.remove();
        dialog = null;
      }
    }
    function showDialog(title, content, save) {
      closeDialog();
      dialog = document.createElement("dialog");
      dialog.className = "iot-dialog";
      dialog.innerHTML =
        "<form><header><h2>" +
        esc(title) +
        '</h2><button type="button" data-close aria-label="关闭">×</button></header><div class="iot-dialog-body">' +
        content +
        '<p class="iot-form-error" role="alert"></p></div><footer><button type="button" class="iot-btn" data-close>取消</button><button class="iot-btn primary" type="submit">保存</button></footer></form>';
      document.body.append(dialog);
      dialog
        .querySelectorAll("[data-close]")
        .forEach((b) => (b.onclick = closeDialog));
      const currentDialog = dialog;
      currentDialog.addEventListener("close", () => {
        currentDialog.remove();
        if (dialog === currentDialog) dialog = null;
      });
      dialog.querySelector("form").onsubmit = async (ev) => {
        ev.preventDefault();
        const form = ev.target,
          button = form.querySelector("[type=submit]");
        button.disabled = true;
        try {
          const v = await save(Object.fromEntries(new FormData(form)));
          closeDialog();
          if (v?.deviceKey) showSecret(v.deviceKey);
          await refresh();
        } catch (e) {
          if (form.isConnected) {
            form.querySelector(".iot-form-error").textContent = e.message;
            button.disabled = false;
          }
        }
      };
      dialog.showModal();
      dialog.addEventListener("click", (e) => {
        if (e.target === dialog) closeDialog();
      });
    }
    const field = (label, name, value = "", type = "text", extra = "") =>
      "<label>" +
      esc(label) +
      '<input name="' +
      name +
      '" type="' +
      type +
      '" value="' +
      esc(value) +
      '" ' +
      extra +
      "></label>";
    function showSecret(key) {
      showDialog(
        "设备接入凭证（仅显示一次）",
        '<p>请将凭证配置到该设备或采集网关。它不同于设备二维码，不要发给普通客户。</p><textarea readonly aria-label="设备接入凭证">' +
          esc(key) +
          "</textarea>",
        async () => {},
      );
      dialog.querySelector("[type=submit]").textContent = "完成";
    }
    async function action(ev) {
      const el = ev.target.closest("[data-action]");
      if (!el || !root.contains(el)) return;
      const name = el.dataset.action,
        id = el.dataset.id;
      try {
        if (
          name === "device-page" ||
          name === "alarm-page" ||
          name === "company-page"
        ) {
          if (name === "device-page") page = Number(el.dataset.page);
          else if (name === "company-page")
            companyPage = Number(el.dataset.page);
          else alarmPage = Number(el.dataset.page);
          await refresh();
          watch();
          return;
        }
        if (name === "close-drawer") {
          drawer?.close();
          return;
        }
        if (name === "platform-view") {
          platformView = el.dataset.view;
          selected = null;
          detail = null;
          if (platformView === "summary") {
            companyId = "";
            companyName = "";
            page = 1;
            companyPage = 1;
            await refresh();
            watch();
          }
          await render();
          root.querySelector(".iot-platform-lower")?.scrollIntoView({
            block: "start",
            behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
              ? "auto"
              : "smooth",
          });
          return;
        }
        if (name === "company-devices") {
          companyId = id;
          companyName = el.dataset.name;
          platformView = "devices";
          page = 1;
          companyPage = 1;
          filter = el.dataset.status || "";
          root.querySelector("#iot-filter").value = filter;
          await refresh();
          watch();
          root
            .querySelector(".iot-platform-lower")
            ?.scrollIntoView({ block: "start" });
          return;
        }
        if (name === "clear-company") {
          companyId = "";
          companyName = "";
          page = 1;
          companyPage = 1;
          await refresh();
          watch();
          return;
        }
        if (name === "map-effects") {
          mapEffects = !mapEffects;
          await render();
          return;
        }
        if (name === "refresh") {
          await refresh();
          return;
        }
        if (name === "tab") {
          selectionVersion++;
          selected = null;
          detail = null;
          tab = el.dataset.tab;
          alarmPage = 1;
          await refresh();
          await render();
          return;
        }
        if (name === "device") {
          await select(id);
          return;
        }
        if (name === "back") {
          await backToList();
          return;
        }
        if (name === "province") {
          province = el.dataset.province;
          page = 1;
          alarmPage = 1;
          companyPage = 1;
          root.querySelector("#iot-province").value = province;
          await refresh();
          watch();
          return;
        }
        if (name === "subscription") {
          const t = tenants.find((t) => t.id === id),
            s = t.subscription;
          showDialog(
            "物联网服务 · " + t.name,
            "<p>已接入 " +
              t.connectedCount +
              ' 台。调低额度不会停用已有设备，但会限制继续接入。缩短历史保留天数后，超期原始样本将定期清理，告警和服务单快照继续保留。</p><label>服务状态<select name="enabled"><option value="true" ' +
              (s.enabled ? "selected" : "") +
              '>开通</option><option value="false" ' +
              (!s.enabled ? "selected" : "") +
              ">停用</option></select></label>" +
              field(
                "接入设备上限",
                "deviceLimit",
                s.device_limit,
                "number",
                'min="1" max="100000" required',
              ) +
              field(
                "历史保留天数",
                "retentionDays",
                s.retention_days,
                "number",
                'min="1" max="3650" required',
              ) +
              field(
                "有效期（留空不限期）",
                "expiresAt",
                s.expires_at
                  ? new Date(s.expires_at).toISOString().slice(0, 10)
                  : "",
                "date",
              ),
            (b) =>
              call("/subscriptions", {
                tenantId: id,
                enabled: b.enabled === "true",
                deviceLimit: Number(b.deviceLimit),
                retentionDays: Number(b.retentionDays),
                expiresAt: b.expiresAt ? b.expiresAt + "T23:59:59+08:00" : null,
              }),
          );
          return;
        }
        if (name === "enroll") {
          const result = await call(
              "/assets?page=1&pageSize=100&available=true",
            ),
            assets = result.assets;
          showDialog(
            "接入现有设备",
            field(
              "查找设备序列号",
              "assetSearch",
              "",
              "search",
              'maxlength="100" placeholder="输入序列号搜索全部设备档案"',
            ) +
              '<p class="iot-asset-hint">共 ' +
              result.total +
              ' 台未接入设备；最多显示100条，请输入序列号缩小范围。</p><label>设备档案<select name="assetId" required><option value="">请选择</option>' +
              assets
                .map(
                  (a) =>
                    '<option value="' +
                    a.id +
                    '">SN ' +
                    esc(a.serial) +
                    "</option>",
                )
                .join("") +
              "</select></label>" +
              field(
                "安装省份",
                "province",
                "",
                "text",
                'placeholder="例如：广东省"',
              ) +
              field("安装城市", "city") +
              field("安装地址", "address") +
              "<p>接入后使用独立凭证上传数据，默认不会产生模拟数据。</p>",
            (b) =>
              call("/devices", {
                ...b,
                simulated: false,
                metrics: context.defaultMetrics,
              }),
          );
          const enrollment = dialog;
          let searchTimer,
            searchVersion = 0;
          enrollment.querySelector("[name=assetSearch]").oninput = (ev) => {
            const value = ev.target.value,
              version = ++searchVersion;
            clearTimeout(searchTimer);
            searchTimer = setTimeout(async () => {
              try {
                const result = await call(
                  "/assets?page=1&pageSize=100&available=true&search=" +
                    encodeURIComponent(value),
                );
                if (!enrollment.isConnected || version !== searchVersion)
                  return;
                enrollment.querySelector("[name=assetId]").innerHTML =
                  '<option value="">请选择</option>' +
                  result.assets
                    .map(
                      (a) =>
                        '<option value="' +
                        a.id +
                        '">SN ' +
                        esc(a.serial) +
                        "</option>",
                    )
                    .join("");
                enrollment.querySelector(".iot-asset-hint").textContent =
                  "找到 " + result.total + " 台未接入设备，显示前100条。";
              } catch (e) {
                if (enrollment.isConnected)
                  enrollment.querySelector(".iot-form-error").textContent =
                    e.message;
              }
            }, 250);
          };
          return;
        }
        if (name === "configure") {
          const d = detail;
          showDialog(
            "设备监控配置",
            field("省份", "province", d.province) +
              field("城市", "city", d.city) +
              field("安装地址", "address", d.address) +
              field(
                "经度",
                "longitude",
                d.longitude ?? "",
                "number",
                'step="any" min="-180" max="180"',
              ) +
              field(
                "纬度",
                "latitude",
                d.latitude ?? "",
                "number",
                'step="any" min="-90" max="90"',
              ) +
              field(
                "离线判断（秒）",
                "offlineAfterSeconds",
                d.offlineAfterSeconds,
                "number",
                'min="10" max="86400" required',
              ) +
              '<label>监测状态<select name="enabled"><option value="true" ' +
              (d.enabled ? "selected" : "") +
              '>启用</option><option value="false" ' +
              (!d.enabled ? "selected" : "") +
              ">停用</option></select></label><p>修改规则后，原规则告警将结束并保留记录；新规则从后续数据重新判断。</p><h3>指标与告警规则</h3>" +
              d.metrics
                .map(
                  (m, i) =>
                    "<fieldset><legend>" +
                    esc(m.label) +
                    " / " +
                    esc(m.unit) +
                    "</legend>" +
                    field(
                      "下限",
                      "min" + i,
                      m.min ?? "",
                      "number",
                      'step="any"',
                    ) +
                    field(
                      "上限",
                      "max" + i,
                      m.max ?? "",
                      "number",
                      'step="any"',
                    ) +
                    field(
                      "持续秒数",
                      "duration" + i,
                      m.durationSeconds || 0,
                      "number",
                      'min="0" max="86400" required',
                    ) +
                    '<label><input type="checkbox" name="public' +
                    i +
                    '" ' +
                    (m.customerVisible ? "checked" : "") +
                    ">允许客户查看</label></fieldset>",
                )
                .join(""),
            (b) =>
              call("/devices/" + d.id + "/config", {
                province: b.province,
                city: b.city,
                address: b.address,
                longitude: b.longitude === "" ? null : Number(b.longitude),
                latitude: b.latitude === "" ? null : Number(b.latitude),
                offlineAfterSeconds: Number(b.offlineAfterSeconds),
                enabled: b.enabled === "true",
                metrics: d.metrics.map((m, i) => ({
                  ...m,
                  min: b["min" + i] === "" ? undefined : Number(b["min" + i]),
                  max: b["max" + i] === "" ? undefined : Number(b["max" + i]),
                  durationSeconds: Number(b["duration" + i]),
                  customerVisible: b["public" + i] === "on",
                })),
              }),
          );
          return;
        }
        if (name === "credential") {
          showDialog(
            "轮换设备凭证",
            "<p>保存后旧凭证立即失效，设备或采集网关需要配置新凭证。</p>",
            () => call("/devices/" + detail.id + "/credential", {}),
          );
          return;
        }
        if (name === "member") {
          showDialog(
            "授权企业手机工作台",
            field("员工姓名", "name", "", "text", 'required maxlength="40"') +
              field(
                "员工手机号",
                "phone",
                "",
                "tel",
                'required pattern="1[3-9][0-9]{9}"',
              ) +
              '<label>权限<select name="role"><option value="viewer">仅查看设备</option><option value="operator">查看并处理告警</option><option value="admin">物联网管理</option></select></label><label>设备范围<select name="scope"><option value="all">本企业全部监测设备</option><option value="selected">仅下方勾选设备（当前列表）</option></select></label><div class="iot-device-choices">' +
              devices
                .map(
                  (d) =>
                    '<label><input type="checkbox" name="asset_' +
                    d.id +
                    '">' +
                    esc(d.model) +
                    " / " +
                    esc(d.serialNumber) +
                    "</label>",
                )
                .join("") +
              "</div>",
            (b) =>
              call("/members", {
                phone: b.phone,
                name: b.name,
                role: b.role,
                enabled: true,
                assetIds:
                  b.scope === "all"
                    ? null
                    : Object.keys(b)
                        .filter((k) => k.startsWith("asset_"))
                        .map((k) => k.slice(6)),
              }),
          );
          return;
        }
        if (name === "revoke") {
          await call("/members", {
            phone: el.dataset.phone,
            role: el.dataset.role,
            enabled: el.dataset.enabled === "true",
            assetIds:
              currentMembers.find((m) => m.person?.phone === el.dataset.phone)
                ?.asset_ids ?? null,
          });
          await render();
          return;
        }
        if (name === "ack") {
          showDialog(
            "告警处理记录",
            '<label>处理说明<textarea name="note" required minlength="2" maxlength="500" placeholder="记录核实情况及下一步安排"></textarea></label>',
            (b) => call("/alarms/" + id + "/acknowledge", b),
          );
          return;
        }
        if (name === "ticket") {
          const a = alarms.find((a) => a.id === id),
            d =
              devices.find((d) => d.id === a.deviceId) ||
              (await call("/devices/" + a.deviceId));
          showDialog(
            "确认生成平台服务单",
            "<p>设备：" +
              esc(d.model) +
              " · " +
              esc(d.serialNumber) +
              "。系统按设备绑定的客户及现有售后关系受理，不会自动确诊故障。</p>" +
              field("服务城市", "city", d.city, "text", "required") +
              field(
                "上门地址",
                "address",
                d.address,
                "text",
                'required minlength="3"',
              ) +
              '<label>故障说明<textarea name="note" required minlength="5" maxlength="1000">' +
              esc(a.label + "异常，请核实设备运行情况。") +
              "</textarea></label>",
            (b) => call("/alarms/" + id + "/ticket", b),
          );
          return;
        }
      } catch (e) {
        error(e.message);
      }
    }
    function onInput(ev) {
      if (ev.target.id === "iot-query") {
        query = ev.target.value;
        companyPage = 1;
        page = 1;
        alarmPage = 1;
        clearTimeout(searchTimer);
        searchTimer = setTimeout(async () => {
          await refresh();
          await render();
          watch();
        }, 300);
      }
    }
    async function onChange(ev) {
      if (ev.target.id === "iot-filter") {
        filter = ev.target.value;
        companyPage = 1;
        page = 1;
        alarmPage = 1;
        await refresh();
        watch();
      }
      if (ev.target.id === "iot-province") {
        province = ev.target.value;
        companyPage = 1;
        page = 1;
        alarmPage = 1;
        await refresh();
        watch();
      }
      if (ev.target.id === "iot-metric" || ev.target.id === "iot-hours") {
        if (ev.target.id === "iot-hours") hours = Number(ev.target.value);
        else metric = ev.target.value;
        try {
          history = await call(
            "/devices/" +
              selected +
              "/history?hours=" +
              hours +
              "&metric=" +
              encodeURIComponent(metric),
          );
          await render();
        } catch (e) {
          error(e.message);
        }
      }
    }
    function mapInfo(ev) {
      const target = ev.target.closest?.("[data-map-info]");
      const box = root.querySelector(".iot-map-tooltip");
      if (!box) return;
      box.hidden = !target;
      if (target) box.textContent = target.dataset.mapInfo;
    }
    function hideMapInfo(ev) {
      if (ev.relatedTarget?.closest?.("[data-map-info]")) return;
      const box = root.querySelector(".iot-map-tooltip");
      if (box) box.hidden = true;
    }
    function mapKeyboard(ev) {
      if (
        (ev.key === "Enter" || ev.key === " ") &&
        ev.target.matches?.(".iot-map [data-action][role=button]")
      ) {
        ev.preventDefault();
        ev.target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      }
    }
    root.addEventListener("pointerover", mapInfo);
    root.addEventListener("focusin", mapInfo);
    root.addEventListener("pointerout", hideMapInfo);
    root.addEventListener("focusout", hideMapInfo);
    root.addEventListener("keydown", mapKeyboard);
    root.addEventListener("click", action);
    root.addEventListener("input", onInput);
    root.addEventListener("change", onChange);
    function realtime() {
      if (!alive) return;
      const attach = () => {
        if (!alive || !window.io) return;
        const origin = new URL(api).origin;
        socket = window.io(origin + "/iot", {
          auth: { token },
          transports: ["websocket", "polling"],
        });
        socket.on("connect", () => watch());
        socket.on("snapshot", (snapshot) => {
          if (!alive) return;
          if (snapshot.watchId !== watchId) return;
          devices = snapshot.devices;
          deviceTotal = snapshot.total;
          overview = snapshot.overview;
          if (
            !dialog &&
            document.activeElement?.closest?.(".iot-live,.iot-device-drawer") ==
              null
          )
            render();
          const sync = root.querySelector(".iot-sync");
          if (sync)
            sync.textContent =
              "实时连接 · " +
              new Date(snapshot.serverTime).toLocaleTimeString("zh-CN", {
                hour12: false,
              });
        });
        socket.on("disconnect", () => {
          const sync = root.querySelector(".iot-sync");
          if (sync) sync.textContent = "实时连接已断开，正在重连…";
        });
        socket.on("connect_error", () => {
          const sync = root.querySelector(".iot-sync");
          if (sync) sync.textContent = "实时暂不可用，定时刷新中";
        });
        socket.on("iot-error", (message) => {
          devices = [];
          alarms = [];
          detail = null;
          selected = null;
          overview = null;
          analytics = null;
          deviceTotal = 0;
          alarmTotal = 0;
          closeDialog();
          render();
          error(message.message);
          recoveryLink(message.status);
        });
      };
      if (window.io) attach();
      else {
        const script = document.createElement("script");
        script.src = api + "/socket.io/socket.io.js";
        script.onload = attach;
        document.head.append(script);
      }
    }
    skeleton();
    (async () => {
      try {
        context = await call("/context");
        if (company && workspace)
          role =
            context.workspaces.find((w) => w.id === workspace)?.role ||
            "viewer";
        if (!mayAdmin()) {
          root.querySelector('[data-tab="members"]')?.remove();
        }
        if (platform) {
          mapData()
            .then((data) => {
              geography = data;
              if (!selected && alive && overview) render();
            })
            .catch(() => error("地图暂不可用，设备列表与统计仍可查看"));
        }
        await refresh();
        if (selected && !detail) await select(selected);
        realtime();
        timer = setInterval(() => {
          if (!document.hidden && !dialog) refresh();
        }, 15000);
      } catch (e) {
        error(e.message);
      }
    })();
    return () => {
      alive = false;
      root.removeEventListener("iot-request-back", requestBack);
      selectionVersion++;
      clearInterval(timer);
      clearTimeout(searchTimer);
      socket?.disconnect();
      mapObserver?.disconnect();
      document.removeEventListener("visibilitychange", mapVisibility);
      if (drawer) {
        const old = drawer;
        drawer = null;
        old.close();
        old.remove();
      }
      closeDialog();
      root.removeEventListener("pointerover", mapInfo);
      root.removeEventListener("focusin", mapInfo);
      root.removeEventListener("pointerout", hideMapInfo);
      root.removeEventListener("focusout", hideMapInfo);
      root.removeEventListener("keydown", mapKeyboard);
      root.removeEventListener("click", action);
      root.removeEventListener("input", onInput);
      root.removeEventListener("change", onChange);
      root.replaceChildren();
    };
  }
  window.IoTConsole = { mount };
})();
