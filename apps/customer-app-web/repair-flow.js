window.renderDeviceRepair = async function (ui) {
  const { root, frame, personal, e, icon, api, guarded } = ui;
  const results = await Promise.allSettled([
    personal("/customer/devices"),
    personal("/customer/addresses"),
    personal("/operations/contracts"),
  ]);
  if (results[0].status === "rejected" || results[1].status === "rejected")
    throw Error("设备或地址未能读取，请重新加载后再报修。");
  const devices = results[0].value,
    addresses = results[1].value,
    contracts = results[2].status === "fulfilled" ? results[2].value : [];
  const requested = new URLSearchParams(location.search).get("deviceId");
  if (requested && !devices.some((d) => d.id === requested))
    throw Error("这台设备不存在或已不属于当前账号，请从“我的设备”重新进入。");
  const user = JSON.parse(localStorage.getItem("customer_user") || "{}"),
    key = "device-repair-draft:" + user.id;
  let draft = {};
  try {
    draft = JSON.parse(sessionStorage.getItem(key) || "{}");
  } catch {}
  let selected =
    requested ||
    (devices.some((d) => d.id === draft.deviceId) && draft.deviceId) ||
    "";
  if (requested && draft.deviceId !== requested) draft = {};
  let files = [],
    clientRequestId = draft.clientRequestId || crypto.randomUUID();
  const options = (rows, value, label) =>
    rows
      .map(
        (r) =>
          '<option value="' + e(value(r)) + '">' + e(label(r)) + "</option>",
      )
      .join("");
  frame(
    "提交报修",
    "确认设备与上门信息，平台将安排合适的工程师。",
    '<form id="repairForm"><section class="market-card repair-device"><div class="market-card-head"><h2>本次报修设备</h2><button type="button" id="changeRepairDevice" class="market-text-link">更换设备</button></div><div id="repairDeviceSummary"></div><label id="repairDeviceField" ' +
      (selected ? "hidden" : "") +
      '>选择设备<select name="deviceId" id="repairDevice" required><option value="">请选择要维修的设备</option>' +
      options(
        devices,
        (d) => d.id,
        (d) => d.model + " · SN " + d.serialNumber,
      ) +
      '</select></label><p id="deviceIdentity" class="market-note"></p>' +
      (devices.length
        ? ""
        : '<a href="devices.html?bind=1" class="market-text-link">先绑定设备</a>') +
      "</section>" +
      '<section class="market-card"><div class="repair-section-number">01 <span>描述设备问题</span></div><label>故障类型<select name="faultType" required><option value="">请选择故障类型</option>' +
      [
        "激光器故障",
        "光路故障",
        "水路故障",
        "气路故障",
        "电路故障",
        "控制系统故障",
        "机械传动故障",
        "冷却系统故障",
        "除尘系统故障",
        "其他故障",
      ]
        .map((v) => "<option>" + v + "</option>")
        .join("") +
      '</select></label><label>故障现象<textarea name="faultDescription" minlength="5" maxlength="2000" required placeholder="描述设备现象、报警代码，以及问题发生的时间。"></textarea></label><fieldset class="repair-urgency"><legend>紧急程度</legend><label><input type="radio" name="urgency" value="normal" checked><span>普通报修</span></label><label><input type="radio" name="urgency" value="urgent"><span>紧急 · 已影响生产</span></label></fieldset><label>故障图片 <small>选填，最多 5 张，每张不超过 5 MB</small><input type="file" id="repairPhotos" accept="image/jpeg,image/png,image/webp" multiple></label><div id="repairPhotoPreviews" class="repair-photo-previews"></div></section>' +
      '<section class="market-card"><div class="repair-section-number">02 <span>确认上门信息</span></div><label>服务地址<select name="addressId" required><option value="">请选择服务地址</option>' +
      options(
        addresses,
        (a) => a.id,
        (a) =>
          (a.label || "服务地址") +
          " · " +
          [a.province, a.city, a.district, a.detail].filter(Boolean).join(""),
      ) +
      '</select></label><p id="repairAddressPreview" class="repair-address-preview"></p><a href="addresses.html" id="manageRepairAddresses" class="market-text-link">管理或新增地址' +
      icon("chevron_right") +
      '</a><label>期望上门时间<select name="preferredTime"><option value="asap">尽快上门</option><option value="tomorrow">明天</option><option value="this_week">本周内</option></select></label><p class="market-note">具体上门时间由服务人员与你确认。</p></section>' +
      '<section class="market-card"><details id="repairContractDetails"><summary>已有企业服务合同？<span>按协议报修</span></summary><label>使用服务合同<select name="contractId"><option value="">不使用已有服务合同</option></select></label><p class="market-note">选择合同后，将按该企业已有协议受理，保障和结算规则保持不变。</p></details><div id="repairRoutingNote" class="repair-routing-note">' +
      icon("verified_user") +
      "<p>由平台安排服务。设备原关联企业与保修信息会一并记录，费用经核实并确认报价后确定。</p></div></section>" +
      '<div class="repair-submit-bar"><span>提交需求不会直接扣款</span><button class="market-primary" type="submit" id="submitRepair">提交报修' +
      icon("arrow_forward") +
      "</button></div></form>",
  );
  const form = document.getElementById("repairForm"),
    deviceSelect = form.elements.deviceId;
  deviceSelect.value = selected;
  ["faultType", "faultDescription", "urgency", "preferredTime"].forEach(
    (name) => {
      if (draft[name]) {
        if (name === "urgency") {
          const radio = form.querySelector(
            '[name=urgency][value="' +
              (draft[name] === "urgent" ? "urgent" : "normal") +
              '"]',
          );
          radio.checked = true;
        } else form.elements[name].value = draft[name];
      }
    },
  );
  const defaultAddress =
    addresses.find((a) => a.id === draft.addressId) ||
    addresses.find((a) => a.isDefault) ||
    addresses[0];
  if (defaultAddress) form.elements.addressId.value = defaultAddress.id;
  function save() {
    const values = Object.fromEntries(new FormData(form));
    sessionStorage.setItem(key, JSON.stringify({ ...values, clientRequestId }));
  }
  function addressPreview() {
    const a = addresses.find((a) => a.id === form.elements.addressId.value);
    document.getElementById("repairAddressPreview").textContent = a
      ? [a.province, a.city, a.district, a.detail].filter(Boolean).join(" ")
      : "请添加一个可上门的服务地址。";
  }
  const policyCache = new Map();
  let policyVersion = 0;
  async function routeNote() {
    const note = document
        .getElementById("repairRoutingNote")
        .querySelector("p"),
      version = ++policyVersion;
    if (form.elements.contractId.value) {
      note.textContent =
        "本次使用企业服务合同，由对应企业按原保障与结算协议受理。";
      return;
    }
    const device = devices.find((d) => d.id === selected);
    if (!device?.serviceId) {
      note.textContent =
        "由维保云安排平台自营或合作售后团队，承接方确定后可在服务单中查看。";
      return;
    }
    note.textContent = "正在核实设备服务企业的售后安排…";
    try {
      let policy = policyCache.get(device.serviceId);
      if (!policy) {
        policy = await api(
          "/service-policy/" + encodeURIComponent(device.serviceId),
        );
        policyCache.set(device.serviceId, policy);
      }
      if (version !== policyVersion) return;
      note.textContent =
        policy.service_mode === "SELF"
          ? policy.name + "安排自有售后团队，提交后由企业指派工程师。"
          : policy.service_mode === "OUTSOURCE"
            ? policy.name +
              "的售后由" +
              policy.contractor_name +
              "承接；对方确认后安排工程师。"
            : "由维保云调度平台自营或合作售后企业，保留设备原有关联信息。";
    } catch {
      if (version === policyVersion)
        note.textContent =
          "暂未读取售后安排，提交时将由系统核实；也可刷新页面后重试。";
    }
  }
  function deviceSummary() {
    selected = deviceSelect.value;
    const d = devices.find((d) => d.id === selected);
    document.getElementById("repairDeviceSummary").innerHTML = d
      ? '<div class="repair-device-card">' +
        (window.VisualMedia?.device(d, true) ||
          icon("precision_manufacturing")) +
        "<div><strong>" +
        e(d.model) +
        "</strong><span>SN: " +
        e(d.serialNumber) +
        "</span><small>" +
        e(d.serviceName || "设备服务商") +
        "</small></div></div>"
      : "";
    document.getElementById("deviceIdentity").textContent = d
      ? "提交时将关联这台设备的唯一编号，无需再次选择。"
      : "";
    const today = new Date().toLocaleDateString("en-CA", {
        timeZone: "Asia/Shanghai",
      }),
      previous = form.elements.contractId.value;
    const available = contracts.filter(
      (c) =>
        d &&
        c.status === "ACTIVE" &&
        c.startDate <= today &&
        c.endDate >= today &&
        (!c.serviceId || c.serviceId === d.serviceId) &&
        (!c.deviceIds?.length || c.deviceIds.includes(d.id)),
    );
    form.elements.contractId.innerHTML =
      '<option value="">不使用已有服务合同</option>' +
      options(
        available,
        (c) => c.id,
        (c) => c.title,
      );
    if (available.some((c) => c.id === (previous || draft.contractId)))
      form.elements.contractId.value = previous || draft.contractId;
    document.getElementById("repairContractDetails").hidden = !available.length;
    document.getElementById("changeRepairDevice").hidden =
      !selected || devices.length < 2;
    routeNote();
  }
  document.getElementById("changeRepairDevice").onclick = () => {
    document.getElementById("repairDeviceField").hidden = false;
    deviceSelect.focus();
  };
  deviceSelect.onchange = () => {
    deviceSummary();
    if (selected)
      history.replaceState(
        null,
        "",
        "repair-form.html?deviceId=" + encodeURIComponent(selected),
      );
    document.getElementById("repairDeviceField").hidden = !!selected;
    save();
  };
  form.elements.addressId.onchange = addressPreview;
  form.elements.contractId.onchange = routeNote;
  form.addEventListener("input", save);
  form.addEventListener("change", save);
  document.getElementById("manageRepairAddresses").onclick = save;
  function photos() {
    const container = document.getElementById("repairPhotoPreviews");
    container.replaceChildren();
    files.forEach((entry, i) => {
      const item = document.createElement("div"),
        img = document.createElement("img"),
        remove = document.createElement("button");
      img.src = entry.url;
      img.alt = "待提交的故障照片";
      remove.type = "button";
      remove.setAttribute("aria-label", "移除第" + (i + 1) + "张图片");
      remove.textContent = "×";
      remove.onclick = () => {
        URL.revokeObjectURL(entry.url);
        files.splice(i, 1);
        photos();
      };
      item.append(img, remove);
      container.append(item);
    });
  }
  document.getElementById("repairPhotos").onchange = function () {
    const picked = Array.from(this.files);
    this.value = "";
    if (files.length + picked.length > 5)
      return ui.error("最多添加 5 张故障图片。");
    if (
      picked.some(
        (f) =>
          f.size > 5 * 1024 * 1024 ||
          !["image/jpeg", "image/png", "image/webp"].includes(f.type),
      )
    )
      return ui.error("请上传不超过 5 MB 的 JPG、PNG 或 WebP 图片。");
    picked.forEach((file) =>
      files.push({ file, url: URL.createObjectURL(file) }),
    );
    photos();
  };
  window.addEventListener(
    "pagehide",
    () => files.forEach((f) => URL.revokeObjectURL(f.url)),
    { once: true },
  );
  deviceSummary();
  addressPreview();
  if (results[2].status === "rejected")
    ui.error(
      "合同信息暂未读取；可重新加载后选择企业合同，或继续提交平台报修。",
    );
  form.onsubmit = (ev) => {
    ev.preventDefault();
    guarded(document.getElementById("submitRepair"), async () => {
      const values = Object.fromEntries(new FormData(form)),
        token = localStorage.getItem("customer_token"),
        legacy = !!values.contractId;
      const uploaded = [];
      for (const entry of files) {
        let cached = legacy ? entry.legacyUrl : entry.platformId;
        if (!cached) {
          const body = new FormData();
          body.append("photo", entry.file);
          const response = await fetch(
            window.APP_API_BASE +
              (legacy
                ? "/customer/work-orders/photo?deviceId=" +
                  encodeURIComponent(values.deviceId)
                : "/market/attachments"),
            {
              method: "POST",
              headers: { Authorization: "Bearer " + token },
              body,
            },
          );
          const result = await window.readApiResponse(response);
          cached = legacy ? result.url : result.id;
          if (legacy) entry.legacyUrl = cached;
          else entry.platformId = cached;
        }
        uploaded.push(cached);
      }
      let order;
      if (legacy) {
        const response = await fetch(
          window.APP_API_BASE + "/customer/work-orders",
          {
            method: "POST",
            headers: {
              Authorization: "Bearer " + token,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              deviceId: values.deviceId,
              addressId: values.addressId,
              contractId: values.contractId,
              faultType: values.faultType,
              faultDescription: values.faultDescription,
              emergencyLevel: values.urgency === "urgent" ? 5 : 0,
              faultPhotos: uploaded,
            }),
          },
        );
        order = await window.readApiResponse(response);
      } else
        order = await api("/device-repairs", {
          ...values,
          clientRequestId,
          photoIds: uploaded,
        });
      sessionStorage.removeItem(key);
      location.href = legacy
        ? "order-progress.html#" + order.id
        : "platform-order.html?id=" + order.id;
    });
  };
};
