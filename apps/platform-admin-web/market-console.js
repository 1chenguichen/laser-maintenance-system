(function () {
  var root = document.getElementById("market-console"),
    token = sessionStorage.getItem("platform_admin_token"),
    base =
      window.LASER_API_BASE ||
      location.protocol + "//" + location.hostname + ":8180",
    data,
    tenants = [],
    labels = {
      cutting: "激光切割",
      welding: "激光焊接",
      marking: "激光打标",
      maintenance: "定期保养",
      installation: "安装调试",
      inspection: "设备检测",
    },
    states = {
      REQUESTED: "待安排",
      ASSIGNED: "已派单",
      ACCEPTED: "已接单",
      QUOTED: "待确认报价",
      APPROVED: "已确认报价",
      IN_SERVICE: "服务中",
      AWAITING_ACCEPTANCE: "待验收",
      COMPLETED: "已完成",
      CANCELLED: "已取消",
      PENDING: "待审核",
      REJECTED: "未通过",
      SUSPENDED: "已暂停",
      ENROLLED: "已报名",
      PASSED: "考核通过",
      FAILED: "考核未通过",
    };
  if (!token) {
    location.href = "index.html";
    return;
  }
  function e(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[c];
    });
  }
  async function api(path, body) {
    var r = await fetch(base + path, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
      v = await r.json();
    if (!r.ok) throw Error(v.message || "操作失败");
    return v;
  }
  function input(label, name, type, required) {
    return (
      "<label>" +
      label +
      '<input name="' +
      name +
      '" type="' +
      (type || "text") +
      '" ' +
      (required ? "required" : "") +
      ' maxlength="200"></label>'
    );
  }
  function category() {
    return (
      '<label>服务类别<select name="category">' +
      Object.keys(labels)
        .map((k) => '<option value="' + k + '">' + labels[k] + "</option>")
        .join("") +
      "</select></label>"
    );
  }
  function message(v) {
    document.getElementById("market-console-message").textContent = v;
  }
  async function perform(button, fn) {
    if (button.disabled) return;
    button.disabled = true;
    try {
      await fn();
      await load();
      message("操作已保存");
    } catch (err) {
      message(err.message);
      button.disabled = false;
    }
  }
  async function load() {
    data = await api("/market/platform");
    var tenantData = await api("/platform/tenants?page=1");
    tenants = tenantData.items;
    for (
      var page = 2;
      tenants.length < tenantData.total && page <= 100;
      page++
    ) {
      var more = await api("/platform/tenants?page=" + page);
      if (!more.items.length) break;
      tenants = tenants.concat(more.items);
    }
    var engineers = data.engineers.filter((p) => p.state === "APPROVED");
    var engineerOptions = engineers
      .flatMap(function (p) {
        if (p.mode === "INDEPENDENT")
          return (
            '<option value="' +
            p.person_id +
            '|">' +
            e(p.name) +
            " · 平台合作</option>"
          );
        return (p.employers || []).map(function (t) {
          return (
            '<option value="' +
            p.person_id +
            "|" +
            t.id +
            '">' +
            e(p.name) +
            " · " +
            e(t.name) +
            "</option>"
          );
        });
      })
      .join("");
    root.innerHTML =
      '<div id="market-console-message" role="status" class="console-message"></div><nav class="console-anchors"><a href="#requests">协作订单</a><a href="#engineers">工程师审核</a><a href="#offers">服务项目</a><a href="#courses">培训与考核</a></nav><section id="requests" class="console-panel"><h2>平台协作订单 · ' +
      data.requests.length +
      '</h2><p>派单会校验服务城市、有效资质与企业关系。报价确认不代表收款。</p><div class="console-table"><table><thead><tr><th>服务单</th><th>设备与城市</th><th>原关联企业 / 承接方</th><th>工程师</th><th>状态</th><th>安排</th></tr></thead><tbody>' +
      data.requests
        .map(function (r) {
          return (
            "<tr><td>" +
            e(r.number) +
            "<small>" +
            e(r.service_title) +
            "</small></td><td>" +
            e(r.device_model) +
            "<small>" +
            e(r.city) +
            (r.device_serial ? "<br>SN: " + e(r.device_serial) : "") +
            "</small></td><td>" +
            e(r.commissioner_name || "客户直接委托") +
            "<small>" +
            e(r.assigned_provider_name || r.provider_name || "平台安排") +
            "</small></td><td>" +
            e(r.engineer_name || "待安排") +
            "</td><td>" +
            e(states[r.status]) +
            "</td><td>" +
            (r.status === "REQUESTED"
              ? '<div class="assignment-control"><select aria-label="指派工程师" id="assign-' +
                r.id +
                '"><option value="">选择工程师与工作身份</option>' +
                engineerOptions +
                '</select><button data-assign="' +
                r.id +
                '">指派</button></div>'
              : "—") +
            "</td></tr>"
          );
        })
        .join("") +
      '</tbody></table></div></section><section id="engineers" class="console-panel"><h2>工程师接单审核</h2><p>审核服务经历、服务区域与合作身份；对应技能由培训考核单独授予。</p>' +
      data.engineers
        .map(function (p) {
          return (
            '<article class="console-item"><strong>' +
            e(p.name) +
            " · " +
            e(p.phone) +
            "</strong><p>" +
            e(p.mode === "INDEPENDENT" ? "平台合作工程师" : "企业工程师") +
            " · " +
            e(p.cities.join("、")) +
            " · " +
            e(p.state === "APPROVED" ? "审核通过" : states[p.state]) +
            "</p><p>" +
            e(p.introduction) +
            '</p><form data-review="' +
            p.person_id +
            '"><select name="state"><option value="APPROVED">审核通过</option><option value="REJECTED">审核未通过</option><option value="SUSPENDED">暂停接单</option></select><input name="note" required minlength="2" maxlength="500" placeholder="核实结果与审核说明"><button>保存审核结果</button></form></article>'
          );
        })
        .join("") +
      '</section><section id="offers" class="console-panel"><h2>服务项目上下架</h2><form id="offerForm" class="console-grid">' +
      input("服务名称", "title", "text", true) +
      category() +
      input("服务城市（可填全国）", "city", "text", true) +
      '<label>承接范围<select name="tenantId"><option value="">平台服务网络（开放调度）</option>' +
      tenants
        .filter((t) => t.enabled && t.provisioningStatus === "READY")
        .map((t) => '<option value="' + t.id + '">' + e(t.name) + "</option>")
        .join("") +
      '</select></label><label class="wide">服务说明<textarea name="description" required minlength="5" maxlength="2000"></textarea></label><button>发布服务项目</button></form>' +
      data.offers
        .map(
          (o) =>
            '<article class="console-item"><strong>' +
            e(o.title) +
            "</strong><p>" +
            e(labels[o.category]) +
            " · " +
            e(o.city) +
            " · " +
            e(o.provider_name || "平台服务网络") +
            '</p><button data-publish="' +
            o.id +
            '" data-resource="offers">' +
            (o.published ? "下架" : "上架") +
            "</button></article>",
        )
        .join("") +
      '</section><section id="courses" class="console-panel"><h2>培训地点与课程</h2><form id="courseForm" class="console-grid">' +
      input("课程名称", "title", "text", true) +
      category() +
      input("城市", "city", "text", true) +
      input("培训地点名称", "centerName", "text", true) +
      input("详细地址", "address", "text", true) +
      input("开课日期", "startDate", "date", true) +
      input("名额", "capacity", "number", true) +
      '<label>课程说明<textarea name="description" required minlength="5" maxlength="2000"></textarea></label><button>发布培训</button></form>' +
      data.courses
        .map(
          (c) =>
            '<article class="console-item"><strong>' +
            e(c.title) +
            "</strong><p>" +
            e(c.center_name) +
            " · " +
            e(c.city) +
            " · " +
            e(String(c.start_date).slice(0, 10)) +
            '</p><button data-publish="' +
            c.id +
            '" data-resource="courses">' +
            (c.published ? "下架" : "上架") +
            '</button><details data-course-picture="' +
            c.id +
            '"><summary>维护课程与地点图片</summary><div></div></details></article>',
        )
        .join("") +
      "<h2>报名与考核登记</h2><p>仅在实际培训、完成考核后登记结果。通过考核授予对应类别一年有效期的接单资质。</p>" +
      data.enrollments
        .map(
          (en) =>
            '<article class="console-item"><strong>' +
            e(en.name) +
            " · " +
            e(en.phone) +
            "</strong><p>" +
            e(en.title) +
            " · " +
            e(states[en.state]) +
            "</p>" +
            (en.state === "ENROLLED"
              ? '<form data-assess="' +
                en.id +
                '"><select name="result"><option value="PASSED">已完成培训，考核通过</option><option value="FAILED">考核未通过</option></select><input name="note" required minlength="2" maxlength="500" placeholder="考核依据与说明"><button>登记考核结果</button></form>'
              : "<p>" + e(en.note) + "</p>") +
            "</article>",
        )
        .join("") +
      "</section>";
    root.querySelectorAll("[data-course-picture]").forEach((details) =>
      details.addEventListener("toggle", () => {
        if (details.open && !details.dataset.loaded) {
          details.dataset.loaded = "true";
          window.VisualGallery.mount(details.querySelector("div"), {
            kind: "course",
            id: details.dataset.coursePicture,
            title: "课程封面、地点与实训图片",
          });
        }
      }),
    );
    document.getElementById("offerForm").onsubmit = function (ev) {
      ev.preventDefault();
      var form = ev.target;
      perform(form.querySelector("button"), () =>
        api("/market/platform", {
          ...Object.fromEntries(new FormData(form)),
          type: "offer",
        }),
      );
    };
    document.getElementById("courseForm").onsubmit = function (ev) {
      ev.preventDefault();
      var form = ev.target,
        values = Object.fromEntries(new FormData(form));
      perform(form.querySelector("button"), () =>
        api("/market/platform", {
          ...values,
          type: "course",
          skill: values.category,
          capacity: Number(values.capacity),
        }),
      );
    };
    root.querySelectorAll("[data-review]").forEach(
      (form) =>
        (form.onsubmit = function (ev) {
          ev.preventDefault();
          perform(form.querySelector("button"), () =>
            api("/market/platform", {
              ...Object.fromEntries(new FormData(form)),
              type: "review",
              personId: form.dataset.review,
            }),
          );
        }),
    );
    root.querySelectorAll("[data-assess]").forEach(
      (form) =>
        (form.onsubmit = function (ev) {
          ev.preventDefault();
          perform(form.querySelector("button"), () =>
            api("/market/platform", {
              ...Object.fromEntries(new FormData(form)),
              type: "assessment",
              enrollmentId: form.dataset.assess,
            }),
          );
        }),
    );
    root.querySelectorAll("[data-publish]").forEach(
      (button) =>
        (button.onclick = function () {
          var list =
              button.dataset.resource === "offers" ? data.offers : data.courses,
            item = list.find((o) => o.id === button.dataset.publish);
          perform(button, () =>
            api("/market/platform", {
              type: "publish",
              resource: button.dataset.resource,
              id: item.id,
              published: !item.published,
            }),
          );
        }),
    );
    root.querySelectorAll("[data-assign]").forEach(
      (button) =>
        (button.onclick = function () {
          var r = data.requests.find((r) => r.id === button.dataset.assign),
            v = document.getElementById("assign-" + r.id).value.split("|");
          if (!v[0]) {
            message("请先选择工程师");
            return;
          }
          perform(button, () =>
            api("/market/requests/" + r.id + "/action", {
              action: "assign",
              version: r.version,
              engineerId: v[0],
              serviceId: v[1],
            }),
          );
        }),
    );
  }
  document.getElementById("reload").onclick = () =>
    load().catch((err) => message(err.message));
  load().catch((err) => {
    root.innerHTML = '<p role="alert">' + e(err.message) + "</p>";
  });
})();
