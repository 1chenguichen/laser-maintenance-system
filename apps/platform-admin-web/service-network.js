(function () {
  const token = sessionStorage.getItem("platform_admin_token"),
    base =
      window.LASER_API_BASE ||
      location.protocol + "//" + location.hostname + ":8180",
    root = document.getElementById("network-root");
  if (!token) {
    location.href = "index.html";
    return;
  }
  const kinds = {
      MERCHANT: "设备企业 / 自有团队",
      PLATFORM_SERVICE: "平台自营服务企业",
      OUTSOURCE: "外包售后企业",
    },
    modes = {
      SELF: "企业自营",
      PLATFORM: "平台托管调度",
      OUTSOURCE: "合作企业承接",
    },
    delegation = {
      NONE: "未委托",
      PENDING: "待承接企业确认",
      ACCEPTED: "企业已承接",
      REJECTED: "承接企业已拒绝",
    },
    agreementStates = {
      PENDING: "待对方确认",
      ACTIVE: "合作中",
      REJECTED: "已拒绝",
      ENDED: "已终止",
    };
  const requestStates={REQUESTED:'待调度',ASSIGNED:'待工程师确认',ACCEPTED:'已接单',QUOTED:'待确认报价',APPROVED:'报价已确认',IN_SERVICE:'服务中',AWAITING_ACCEPTANCE:'待客户验收',COMPLETED:'已完成',CANCELLED:'已取消'};
  let data,
    market,
    busy = false;
  const e = (v) =>
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
  async function api(path, body) {
    const r = await fetch(base + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Authorization: "Bearer " + token,
        "Content-Type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const v = await r.json();
    if (!r.ok) throw Error(v.message || "操作失败");
    return v;
  }
  const options = (rows) =>
    rows
      .map((p) => '<option value="' + e(p.id) + '">' + e(p.name) + "</option>")
      .join("");
  const categoryList = [
    "cutting",
    "welding",
    "marking",
    "maintenance",
    "installation",
    "inspection",
  ];
  async function run(fn) {
    if (busy) return;
    busy = true;
    root.querySelectorAll("button").forEach((b) => (b.disabled = true));
    try {
      await fn();
      await load();
      document.getElementById("notice").textContent = "操作已保存";
    } catch (err) {
      document.getElementById("notice").textContent = err.message;
      root.querySelectorAll("button").forEach((b) => (b.disabled = false));
    } finally {
      busy = false;
    }
  }
  async function load() {
    [data, market] = await Promise.all([
      api("/market/service-network"),
      api("/market/platform"),
    ]);
    const providers = data.profiles.filter((p) => p.kind !== "MERCHANT");
    root.innerHTML =
      '<section class="console-panel"><h2>服务组织</h2><p>平台运营账号负责治理与调度；平台自营服务企业只管理自己的工程师与库存。两者权限独立。</p><form id="profileForm" class="network-row"><label>企业<select name="tenantId" required>' +
      options(data.profiles) +
      '</select></label><label>组织类型<select name="kind">' +
      Object.entries(kinds)
        .map(([v, l]) => '<option value="' + v + '">' + l + "</option>")
        .join("") +
      '</select></label><label>售后方式<select name="serviceMode">' +
      Object.entries(modes)
        .map(([v, l]) => '<option value="' + v + '">' + l + "</option>")
        .join("") +
      '</select></label><label>外包承接企业<select name="contractorId"><option value="">不指定</option>' +
      options(providers) +
      '</select></label><label>可服务城市<input name="cities" value="全国" required placeholder="深圳市，东莞市"></label><button>保存组织配置</button></form><div class="console-table"><table><thead><tr><th>企业</th><th>组织类型</th><th>售后方式</th><th>合作承接方</th><th>覆盖区域</th><th>已审核工程师</th></tr></thead><tbody>' +
      data.profiles
        .map(
          (p) =>
            "<tr><td>" +
            e(p.name) +
            "</td><td>" +
            e(kinds[p.kind]) +
            "</td><td>" +
            e(modes[p.service_mode]) +
            "</td><td>" +
            e(p.contractor_name || "—") +
            "</td><td>" +
            e((p.cities || ["全国"]).join(" / ")) +
            "</td><td>" +
            market.engineers.filter(
              (w) =>
                w.state === "APPROVED" &&
                (w.employers || []).some((t) => t.tenantId === p.id),
            ).length +
            "</td></tr>",
        )
        .join("") +
      "</tbody></table></div></section>" +
      '<section class="console-panel"><h2>企业外包关系</h2><p>由委托方发起、承接方在企业后台确认；登记范围用于业务路由，不代替正式合同。</p><form id="agreementForm" class="network-row"><label>委托企业<select name="clientId">' +
      options(data.profiles) +
      '</select></label><label>承接企业<select name="providerId" required><option value="">请选择</option>' +
      options(providers) +
      '</select></label><label>服务城市<input name="cities" value="全国" required></label><button>发起合作邀请</button></form><div class="console-table"><table><thead><tr><th>委托企业</th><th>承接企业</th><th>城市 / 类别</th><th>状态</th><th>操作</th></tr></thead><tbody>' +
      data.agreements
        .map(
          (a) =>
            "<tr><td>" +
            e(a.client_name) +
            "</td><td>" +
            e(a.provider_name) +
            "</td><td>" +
            e(a.cities.join(" / ")) +
            " · " +
            a.categories.length +
            " 类</td><td>" +
            e(agreementStates[a.state]) +
            "</td><td>" +
            (["PENDING", "ACTIVE"].includes(a.state)
              ? '<button data-end="' + a.id + '">终止合作</button>'
              : "—") +
            "</td></tr>",
        )
        .join("") +
      "</tbody></table></div></section>" +
      '<section class="console-panel"><h2>平台服务委托</h2><p>无关联设备企业的客户先进入平台调度，由运营选择平台自营或外包服务企业。企业确认承接后，再派本企业员工；也可通过工程师审核页直接指派符合资格的人员。</p><div class="console-table"><table><thead><tr><th>单号 / 设备</th><th>设备关联企业</th><th>本次承接方</th><th>委托 / 履约状态</th><th>执行工程师</th><th>安排</th></tr></thead><tbody>' +
      market.requests
        .map(
          (r) =>
            "<tr><td>" +
            e(r.number) +
            "<small>" +
            e(r.device_model) +
            " · " +
            e(r.city) +
            "</small></td><td>" +
            e(r.commissioner_name || "平台直接客户") +
            "</td><td>" +
            e(r.assigned_provider_name || r.provider_name || "待安排") +
            "</td><td>" +
            e(delegation[r.delegation_state] || "未委托") +
            "<small>" +
            e(requestStates[r.status]||r.status) +
            "</small></td><td>" +
            e(r.engineer_name || "待企业指派") +
            "</td><td>" +
            (r.status === "REQUESTED" && !r.engineer_id
              ? (["NONE", "REJECTED"].includes(r.delegation_state)
                  ? '<form data-delegate="' +
                    r.id +
                    '"><select name="providerId" required><option value="">选择承接企业</option>' +
                    options(
                      providers.filter(
                        (p) => !r.provider_id || p.id === r.provider_id,
                      ),
                    ) +
                    '</select><input name="note" required minlength="2" maxlength="500" placeholder="安排说明"><button>发送服务委托</button></form>'
                  : "") +
                (["PENDING", "ACCEPTED", "REJECTED"].includes(
                  r.delegation_state,
                )
                  ? '<button data-withdraw="' + r.id + '">撤回委托</button>'
                  : "")
              : "已进入履约，保留承接与派单记录") +
            "</td></tr>",
        )
        .join("") +
      "</tbody></table></div></section>";
    const form = document.getElementById("profileForm");
    function pick() {
      const p = data.profiles.find(
        (p) => p.id === form.elements.tenantId.value,
      );
      form.elements.kind.value = p.kind;
      form.elements.serviceMode.value = p.service_mode;
      form.elements.contractorId.value = p.contractor_id || "";
      form.elements.cities.value = (p.cities || ["全国"]).join("，");
    }
    form.elements.tenantId.onchange = pick;
    pick();
    form.onsubmit = (ev) => {
      ev.preventDefault();
      const b = Object.fromEntries(new FormData(form));
      run(() =>
        api("/market/service-network", {
          ...b,
          type: "profile",
          categories: categoryList,
          cities: b.cities
            .split(/[,，]/)
            .map((v) => v.trim())
            .filter(Boolean),
        }),
      );
    };
    document.getElementById("agreementForm").onsubmit = (ev) => {
      ev.preventDefault();
      const b = Object.fromEntries(new FormData(ev.target));
      run(() =>
        api("/market/service-network", {
          ...b,
          type: "agreement",
          categories: categoryList,
          cities: b.cities
            .split(/[,，]/)
            .map((v) => v.trim())
            .filter(Boolean),
        }),
      );
    };
    root.querySelectorAll("[data-end]").forEach(
      (b) =>
        (b.onclick = () => {
          if (confirm("终止合作仅影响后续安排，已派任务继续履约。"))
            run(() =>
              api("/market/service-network", {
                type: "agreement-state",
                id: b.dataset.end,
                state: "ENDED",
              }),
            );
        }),
    );
    root.querySelectorAll("[data-delegate]").forEach(
      (f) =>
        (f.onsubmit = (ev) => {
          ev.preventDefault();
          const r = market.requests.find((r) => r.id === f.dataset.delegate);
          run(() =>
            api("/market/requests/" + r.id + "/action", {
              ...Object.fromEntries(new FormData(f)),
              action: "delegate",
              version: r.version,
            }),
          );
        }),
    );
    root.querySelectorAll("[data-withdraw]").forEach(
      (b) =>
        (b.onclick = () => {
          const r = market.requests.find((r) => r.id === b.dataset.withdraw);
          run(() =>
            api("/market/requests/" + r.id + "/action", {
              action: "delegate-withdraw",
              version: r.version,
              note: "平台撤回安排并重新调度",
            }),
          );
        }),
    );
  }
  document.getElementById("reload").onclick = () =>
    load().catch(
      (err) => (document.getElementById("notice").textContent = err.message),
    );
  load().catch(
    (err) => (document.getElementById("notice").textContent = err.message),
  );
})();
