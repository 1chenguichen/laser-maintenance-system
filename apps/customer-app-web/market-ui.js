(function () {
  var root = document.getElementById("market-root"),
    role = document.body.dataset.role,
    screen = document.body.dataset.screen,
    token = localStorage.getItem(role + "_token");
  if (!token) {
    location.replace("login.html");
    return;
  }
  var apiBase = window.APP_API_BASE,
    offers = [],
    me = null;
  var labels = {
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
      APPROVED: "报价已确认",
      IN_SERVICE: "服务中",
      AWAITING_ACCEPTANCE: "待验收",
      COMPLETED: "已完成",
      CANCELLED: "已取消",
      PENDING: "待审核",
      APPROVED_PROFILE: "审核通过",
      REJECTED: "未通过",
      SUSPENDED: "已暂停",
      ENROLLED: "已报名",
      PASSED: "考核通过",
      FAILED: "考核未通过",
      PENDING_PAYMENT: "待付款",
      PENDING_FINAL_PAYMENT: "待付尾款",
    };
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
    var r = await fetch(apiBase + "/market" + path, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          Authorization: "Bearer " + token,
          "Content-Type": "application/json",
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      }),
      data = await r.json();
    if (!r.ok)
      throw Error(
        Array.isArray(data.message)
          ? data.message.join("；")
          : data.message || "操作失败",
      );
    return data;
  }
  function alertBox(message) {
    var dialog = document.querySelector("dialog[open]");
    if (dialog) {
      var notice = dialog.querySelector("[data-dialog-message]");
      if (!notice) {
        notice = document.createElement("div");
        notice.className = "market-message";
        notice.dataset.dialogMessage = "";
        notice.setAttribute("role", "alert");
        notice.tabIndex = -1;
        dialog.querySelector("form").prepend(notice);
      }
      notice.textContent = message;
      notice.focus();
      return;
    }
    var box = document.getElementById("market-message");
    box.textContent = message;
    box.hidden = false;
    box.focus();
  }
  function frame(title, description, html) {
    root.innerHTML =
      '<header class="market-heading"><small>' +
      (role === "customer" ? "激光设备服务平台" : "工程师服务工作台") +
      "</small><h1>" +
      e(title) +
      "</h1><p>" +
      e(description) +
      '</p></header><div id="market-message" class="market-message" role="status" tabindex="-1" hidden></div>' +
      html;
    document.dispatchEvent(new CustomEvent("mobile-screen-rendered"));
  }
  function field(label, name, type, required, value) {
    return (
      "<label>" +
      e(label) +
      '<input name="' +
      name +
      '" type="' +
      (type || "text") +
      '" ' +
      (required ? "required" : "") +
      ' maxlength="' +
      (name === "description" || name === "report" ? 2000 : 200) +
      '" value="' +
      e(value || "") +
      '"></label>'
    );
  }
  function icon(name) {
    return (
      '<span class="material-symbols-outlined" aria-hidden="true">' +
      name +
      "</span>"
    );
  }
  function empty(text, href, label) {
    return (
      '<div class="market-empty">' +
      icon("inbox") +
      "<strong>" +
      e(text) +
      "</strong>" +
      (href
        ? '<a class="market-text-link" href="' +
          e(href) +
          '">' +
          e(label) +
          "</a>"
        : "") +
      "</div>"
    );
  }
  function sectionTitle(title, href, label) {
    return (
      '<div class="section-heading"><h2>' +
      e(title) +
      "</h2>" +
      (href
        ? '<a href="' +
          href +
          '">' +
          e(label || "查看全部") +
          icon("chevron_right") +
          "</a>"
        : "") +
      "</div>"
    );
  }
  function time(value) {
    return new Date(value).toLocaleString("zh-CN", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  async function personal(path) {
    var r = await fetch(apiBase + path, {
      headers: { Authorization: "Bearer " + token },
    });
    return window.readApiResponse(r);
  }
  async function home() {
    var results = await Promise.allSettled([
      personal("/customer/devices"),
      personal("/customer/work-orders"),
      api("/requests"),
    ]);
    var devices = results[0].status === "fulfilled" ? results[0].value : [],
      old = results[1].status === "fulfilled" ? results[1].value : [],
      orders = results[2].status === "fulfilled" ? results[2].value : [];
    var user = {};
    try {
      user = JSON.parse(localStorage.getItem("customer_user") || "{}");
    } catch {}
    var pending = orders.filter((r) =>
      ["QUOTED", "AWAITING_ACCEPTANCE"].includes(r.status),
    );
    var legacy = old.filter(
      (r) =>
        ["PENDING_PAYMENT", "PENDING_FINAL_PAYMENT"].includes(r.status) ||
        (r.status === "COMPLETED" && r.reviewed === false),
    );
    var active = orders.filter(
      (r) => !["COMPLETED", "CANCELLED"].includes(r.status),
    );
    var oldActive = old
      .filter((r) => !["COMPLETED", "CANCELLED"].includes(r.status))
      .map((r) => ({
        id: r.id,
        detailHref: "order-progress.html#" + r.id,
        status:
          {
            PENDING: "REQUESTED",
            DISPATCHED: "ASSIGNED",
            REPAIRING: "IN_SERVICE",
          }[r.status] || r.status,
        device_model: r.device?.model || "设备维修",
        service_title: r.faultType || "设备售后",
        number: r.orderNo,
        city: r.address?.city || "设备售后",
        provider_name: r.serviceName || "设备服务商",
      }));
    var allActive = active.concat(oldActive);
    frame(
      "设备服务，随时在身边",
      "您好，" + (user.name || "欢迎回来"),
      '<section class="home-intro home-visual"><img src="/media/service-visuals/hero.webp" alt="激光设备车间场景示意，AI生成" width="1200" height="675" fetchpriority="high" decoding="async"><span class="hero-image-label">AI 场景示意</span><div><span class="eyebrow">设备售后 · 一站服务</span><h2>让设备恢复好状态。</h2><p>从故障维修到日常保养，找到合适的服务。</p><a class="market-primary" href="services.html">寻找售后服务' +
        icon("arrow_forward") +
        "</a></div></section>" +
        '<div class="home-quicklinks"><a href="' +
        (devices.length ? "repair-form.html" : "devices.html?bind=1") +
        '">' +
        icon("build") +
        '<strong>设备报修</strong><small>已有设备售后</small></a><a href="devices.html?bind=1">' +
        icon("add_circle") +
        '<strong>绑定设备</strong><small>管理设备档案</small></a><a href="chat.html">' +
        icon("support_agent") +
        "<strong>联系服务</strong><small>沟通维修需求</small></a></div>" +
        sectionTitle("今天，有什么需要处理？") +
        '<section class="home-todos">' +
        (pending
          .map(
            (r) =>
              '<a class="customer-todo" href="platform-order.html?id=' +
              e(r.id) +
              '"><div>' +
              icon("notifications") +
              "<span><strong>" +
              e(r.status === "QUOTED" ? "确认服务报价" : "验收本次服务") +
              "</strong><small>" +
              e(r.device_model) +
              "</small></span></div>" +
              icon("chevron_right") +
              "</a>",
          )
          .join("") +
          legacy
            .slice(0, 3)
            .map(
              (r) =>
                '<a class="customer-todo" href="order-progress.html#' +
                e(r.id) +
                '"><div>' +
                icon("receipt_long") +
                "<span><strong>" +
                e(
                  r.status === "PENDING_PAYMENT"
                    ? r.customerConfirm
                      ? "完成定金支付"
                      : "查看并确认维修报价"
                    : r.status === "PENDING_FINAL_PAYMENT"
                      ? "核对维修结果与结算"
                      : "评价本次服务",
                ) +
                "</strong><small>" +
                e(r.device?.model || r.faultType) +
                " · " +
                e(r.serviceName || "设备服务商") +
                "</small></span></div>" +
                icon("chevron_right") +
                "</a>",
            )
            .join("") ||
          '<div class="all-clear">' +
            icon("check_circle") +
            (results[1].status === "rejected" ||
            results[2].status === "rejected"
              ? "<div><strong>待办信息暂未完整读取</strong><small>请稍后重新加载，或进入订单查看。</small></div></div>"
              : "<div><strong>暂时没有待确认事项</strong><small>有新的报价或服务进度，会在这里显示。</small></div></div>")) +
        "</section>" +
        sectionTitle("我的设备", "devices.html", "我的设备") +
        '<section class="home-device-list">' +
        (devices
          .slice(0, 3)
          .map(
            (d) =>
              '<a class="device-row" href="devices.html">' +
              (window.VisualMedia?.device(d, true) ||
                icon("precision_manufacturing")) +
              "<div><strong>" +
              e(d.model) +
              "</strong><small>" +
              e(d.serviceName || "设备服务商待确认") +
              '</small><small class="serial">' +
              e(d.serialNumber) +
              "</small></div>" +
              icon("chevron_right") +
              "</a>",
          )
          .join("") ||
          (results[0].status === "rejected"
            ? empty("设备暂未读取成功，请重新加载。")
            : empty(
                "绑定设备，开启售后服务",
                "devices.html?bind=1",
                "绑定第一台设备",
              ))) +
        "</section>" +
        sectionTitle("正在进行的服务", "market-orders.html") +
        (allActive.length
          ? allActive.slice(0, 3).map(orderCard).join("")
          : empty(
              "当前没有进行中的平台服务",
              "orders.html",
              "查看设备售后记录",
            )) +
        (results.some((r) => r.status === "rejected")
          ? '<div class="market-message">部分服务信息未能读取。<button type="button" onclick="location.reload()">重新加载</button></div>'
          : ""),
    );
  }

  function badge(text) {
    return '<span class="market-badge">' + e(text) + "</span>";
  }
  function options(values) {
    return values
      .map(function (v) {
        return '<option value="' + e(v.id) + '">' + e(v.name) + "</option>";
      })
      .join("");
  }
  function serviceOrigin(r) {
    if (r.source === "company" || r.dispatch_source === "ENTERPRISE_SELF")
      return "enterprise";
    if (r.service_kind === "PLATFORM_SERVICE") return "platform";
    if (
      r.service_kind === "OUTSOURCE" ||
      r.dispatch_source === "ENTERPRISE_OUTSOURCE"
    )
      return "outsourced";
    return "platform";
  }
  function serviceTeam(r) {
    return {
      enterprise: "企业自有团队",
      platform: "平台服务团队",
      outsourced: "外包售后团队",
    }[serviceOrigin(r)];
  }
  function dispatchBy(r) {
    if (r.source === "company") return "企业指派";
    if (r.dispatcher_kind === "engineer") return "工程师领取";
    if (r.dispatcher_kind === "company")
      return (
        (r.dispatch_source === "PLATFORM_DELEGATED" ? "平台委托 · " : "") +
        "承接企业指派"
      );
    if (r.dispatcher_kind === "platform") return "平台直接指派";
    return (
      {
        PENDING: "等待服务企业确认",
        ACCEPTED: "等待承接企业安排",
        REJECTED: "承接企业已退回",
      }[r.delegation_state] || "等待平台调度"
    );
  }
  function orderCard(r) {
    var hints = {
      ASSIGNED: role === "customer" ? "查看工程师安排" : "确认接单",
      ACCEPTED: role === "customer" ? "查看服务进度" : "提交服务报价",
      QUOTED: role === "customer" ? "查看并确认报价" : "等待客户确认",
      APPROVED: role === "customer" ? "等待工程师服务" : "准备开始服务",
      IN_SERVICE: role === "customer" ? "查看维修进度" : "记录服务进展",
      AWAITING_ACCEPTANCE:
        role === "customer" ? "核对记录并验收" : "等待客户验收",
    };
    return (
      '<a class="market-card market-order-card status-' +
      e(r.status) +
      '" href="' +
      e(r.detailHref || "platform-order.html?id=" + r.id) +
      '"><div class="market-card-head"><span class="order-category">' +
      e(labels[r.category] || "设备服务") +
      (r.sourceLabel
        ? '<span class="order-source">' + e(r.sourceLabel) + "</span>"
        : "") +
      '</span><span class="market-badge">' +
      e(states[r.status] || r.status) +
      "</span></div><h3>" +
      e(r.device_model) +
      '</h3><p class="order-description">' +
      (r.device_serial ? "SN: " + e(r.device_serial) + "<br>" : "") +
      e(r.service_title) +
      '</p><div class="order-meta">' +
      icon("location_on") +
      e(r.city) +
      "<span>·</span>" +
      e(
        r.assigned_provider_name ||
          r.provider_name ||
          (r.engineer_id ? "平台合作工程师" : "平台服务网络"),
      ) +
      '</div><div class="order-card-bottom"><small>' +
      e(r.number) +
      "</small><span>" +
      e(hints[r.status] || "查看服务记录") +
      icon("arrow_forward") +
      "</span></div></a>"
    );
  }

  async function guarded(button, fn) {
    if (button.disabled) return;
    button.disabled = true;
    try {
      await fn();
    } catch (err) {
      alertBox(err.message);
    } finally {
      if (button.isConnected) button.disabled = false;
    }
  }
  function confirmAction(label) {
    return new Promise((resolve) => {
      var dialog = document.createElement("dialog");
      dialog.className = "market-dialog";
      dialog.innerHTML =
        '<form method="dialog" class="market-card"><h2>' +
        e(label) +
        '</h2><p>请核对当前服务信息，确认后更新服务进度。</p><button class="market-primary" value="confirm">确认继续</button><button class="market-secondary" value="cancel">返回详情</button></form>';
      dialog.addEventListener(
        "close",
        () => {
          var confirmed = dialog.returnValue === "confirm";
          dialog.remove();
          resolve(confirmed);
        },
        { once: true },
      );
      root.append(dialog);
      dialog.showModal();
    });
  }
  async function catalog() {
    offers = await api("/catalog");
    frame(
      "找售后服务",
      "告诉我们设备和城市，让合适的服务找到你。",
      '<form id="searchForm" class="market-search"><label class="search-city">' +
        icon("location_on") +
        '<input name="city" placeholder="输入服务城市" aria-label="服务城市筛选"></label><button class="market-primary" type="submit">查找</button><select name="category" aria-label="服务类别" hidden><option value="">全部服务</option>' +
        Object.keys(labels)
          .map((k) => '<option value="' + k + '">' + labels[k] + "</option>")
          .join("") +
        "</select></form>" +
        '<div class="category-tabs" role="group" aria-label="服务类别"><button type="button" data-category="" aria-pressed="true">全部服务</button>' +
        Object.keys(labels)
          .map(
            (k) =>
              '<button type="button" data-category="' +
              k +
              '" aria-pressed="false">' +
              labels[k] +
              "</button>",
          )
          .join("") +
        '</div><div class="section-heading"><h2>适合你的设备服务</h2><span id="offerCount"></span></div><p class="visual-source-note">图片为 AI 生成的场景示意，服务范围以项目说明为准。</p><div id="offerList"></div><dialog id="requestDialog" class="market-dialog"><div class="dialog-top"><h2>提交服务需求</h2><button type="button" data-close-dialog aria-label="关闭需求表单">' +
        icon("close") +
        '</button></div><section id="requestPanel"></section></dialog>',
    );
    function render() {
      document.getElementById("offerCount").textContent =
        offers.length + " 项服务";
      document.getElementById("offerList").innerHTML = offers.length
        ? offers
            .map(
              (o) =>
                '<article class="market-card service-offer">' +
                (window.VisualMedia?.service(o.category) || "") +
                '<div class="service-offer-top"><span class="service-icon">' +
                icon(
                  {
                    welding: "construction",
                    cutting: "content_cut",
                    maintenance: "build_circle",
                    installation: "settings",
                    inspection: "fact_check",
                    marking: "edit_square",
                  }[o.category] || "build",
                ) +
                '</span><div><span class="eyebrow">' +
                e(labels[o.category]) +
                "</span><h2>" +
                e(o.title) +
                "</h2></div></div><p>" +
                e(o.description) +
                '</p><div class="service-offer-footer"><div class="market-provider">' +
                (o.logo
                  ? '<img src="' + e(o.logo) + '" alt="服务企业Logo">'
                  : icon("verified_user")) +
                "<div>" +
                (o.tenant_id
                  ? '<a class="visual-company-link" href="company.html?id=' +
                    e(o.tenant_id) +
                    '">' +
                    e(o.provider_name) +
                    "</a>"
                  : e("平台服务网络")) +
                "<small>" +
                icon("location_on") +
                e(o.city) +
                '</small></div></div><button class="market-secondary" data-offer="' +
                e(o.id) +
                '">咨询服务' +
                icon("arrow_forward") +
                "</button></div></article>",
            )
            .join("")
        : empty("未找到匹配的服务，请调整城市或类别。");
      root
        .querySelectorAll("[data-offer]")
        .forEach(
          (b) =>
            (b.onclick = () =>
              guarded(b, () =>
                openRequest(offers.find((o) => o.id === b.dataset.offer)),
              )),
        );
    }
    async function search() {
      var f = new FormData(document.getElementById("searchForm"));
      offers = await api(
        "/catalog?city=" +
          encodeURIComponent(f.get("city")) +
          "&category=" +
          encodeURIComponent(f.get("category")),
      );
      render();
    }
    document.getElementById("searchForm").onsubmit = (ev) => {
      ev.preventDefault();
      guarded(ev.target.querySelector("button"), search);
    };
    root.querySelectorAll("[data-category]").forEach(
      (b) =>
        (b.onclick = () =>
          guarded(b, async () => {
            document.querySelector("[name=category]").value =
              b.dataset.category;
            await search();
            root
              .querySelectorAll("[data-category]")
              .forEach((t) => t.setAttribute("aria-pressed", String(t === b)));
          })),
    );
    document.querySelector("[data-close-dialog]").onclick = () =>
      document.getElementById("requestDialog").close();
    render();
  }

  async function openRequest(offer) {
    var devices = [];
    try {
      var r = await fetch(apiBase + "/customer/devices", {
        headers: { Authorization: "Bearer " + token },
      });
      if (r.ok) devices = await r.json();
    } catch {}
    var panel = document.getElementById("requestPanel");
    panel.innerHTML =
      '<form id="requestForm" class="market-card"><h2>' +
      e(offer.title) +
      ' · 提交需求</h2><label>选择我的设备（可选）<select name="deviceRef"><option value="">尚未绑定，手动填写型号</option>' +
      devices
        .map(function (d) {
          return (
            '<option value="' +
            e(d.id) +
            '">' +
            e(d.model) +
            " · " +
            e(d.serviceName) +
            "</option>"
          );
        })
        .join("") +
      "</select></label>" +
      field("设备型号", "deviceModel", "text", true) +
      field(
        "服务城市",
        "city",
        "text",
        true,
        offer.city === "全国" ? "" : offer.city,
      ) +
      field("详细上门地址", "address", "text", true) +
      '<label>故障与服务需求<textarea name="description" required minlength="5" maxlength="2000" placeholder="说明设备现象、时间与希望提供的服务"></textarea></label><p class="market-note">本次提交是服务需求，不会扣款。原设备保障内报修仍可在“设备”中发起。</p><button class="market-primary">提交需求</button></form>';
    document.getElementById("requestDialog").showModal();
    var form = document.getElementById("requestForm");
    form.elements.deviceRef.onchange = function () {
      var d = devices.find(function (d) {
        return d.id === form.elements.deviceRef.value;
      });
      if (d) form.elements.deviceModel.value = d.model;
    };
    form.onsubmit = function (ev) {
      ev.preventDefault();
      guarded(form.querySelector("button"), async function () {
        var data = Object.fromEntries(new FormData(form));
        data.offerId = offer.id;
        var order = await api("/requests", data);
        location.href = "platform-order.html?id=" + order.id;
      });
    };
  }
  async function orders(workbench) {
    var rows = await api("/requests");
    if (workbench) {
      me = await api("/me");
      var active = rows.filter(
        (r) => !["COMPLETED", "CANCELLED"].includes(r.status),
      );
      var todo = active.filter((r) =>
        ["ASSIGNED", "ACCEPTED", "APPROVED"].includes(r.status),
      );
      var working = active.filter((r) => r.status === "IN_SERVICE");
      var waiting = active.filter((r) =>
        ["QUOTED", "AWAITING_ACCEPTANCE"].includes(r.status),
      );
      active.sort(
        (a, b) =>
          [
            "ASSIGNED",
            "APPROVED",
            "IN_SERVICE",
            "ACCEPTED",
            "QUOTED",
            "AWAITING_ACCEPTANCE",
          ].indexOf(a.status) -
          [
            "ASSIGNED",
            "APPROVED",
            "IN_SERVICE",
            "ACCEPTED",
            "QUOTED",
            "AWAITING_ACCEPTANCE",
          ].indexOf(b.status),
      );
      frame(
        "今日服务工作台",
        "把每一次现场服务，安排得井井有条。",
        '<section class="engineer-identity"><div class="engineer-avatar">' +
          icon("engineering") +
          "</div><div><strong>" +
          e(me.person?.name || "工程师") +
          "</strong><small>" +
          e(
            me.engineer?.mode === "INDEPENDENT"
              ? "平台合作工程师"
              : me.employers.map((c) => c.name).join(" / ") || "企业服务工程师",
          ) +
          '</small></div><a href="market-profile.html">服务身份' +
          icon("chevron_right") +
          "</a></section>" +
          '<div class="work-metrics"><a href="platform-orders.html"><strong>' +
          todo.length +
          '</strong><span>待处理</span></a><a href="platform-orders.html"><strong>' +
          working.length +
          '</strong><span>服务中</span></a><a href="platform-orders.html"><strong>' +
          waiting.length +
          "</strong><span>待客户确认</span></a></div>" +
          (me.engineer?.state !== "APPROVED"
            ? '<a class="qualification-notice" href="market-profile.html">' +
              icon("info") +
              "<div><strong>" +
              e(me.engineer ? "接单资料待审核" : "完善平台接单资料") +
              "</strong><small>审核与对应技能资质齐备后，可领取平台任务。</small></div>" +
              icon("chevron_right") +
              "</a>"
            : "") +
          '<div class="engineer-tools"><a href="opportunities.html">' +
          icon("radar") +
          '<strong>接单大厅</strong></a><a href="learning.html">' +
          icon("school") +
          "<strong>培训与资质</strong></a>" +
          (me.employers.length
            ? '<a href="tasks.html">' +
              icon("assignment_ind") +
              '<strong>企业任务</strong></a><a href="inventory.html">' +
              icon("inventory_2") +
              "<strong>移动仓</strong></a>"
            : '<a href="market-profile.html">' +
              icon("verified_user") +
              "<strong>服务身份</strong></a>") +
          "</div>" +
          sectionTitle("待履约任务", "platform-orders.html", "全部工单") +
          (active.length
            ? active.map(orderCard).join("")
            : empty(
                "当前没有待履约平台任务",
                "opportunities.html",
                "前往接单大厅",
              )) +
          '<p class="workspace-footnote">平台任务与企业任务分别管理，履约记录各自留存。</p>',
      );
    } else {
      const legacy = await personal(
        role === "customer" ? "/customer/work-orders" : "/engineer/orders",
      ).then(
        (value) => ({ value }),
        (error) => ({ error }),
      );
      const normalized = (legacy.value || []).map((r) => ({
        id: r.id,
        source: "company",
        sourceLabel: "企业售后",
        detailHref:
          (role === "customer" ? "order-progress.html#" : "task-detail.html#") +
          r.id,
        status:
          {
            PENDING: "REQUESTED",
            DISPATCHED: "ASSIGNED",
            REPAIRING: "IN_SERVICE",
          }[r.status] || r.status,
        device_model: r.device?.model || "设备维修",
        device_serial: r.device?.serialNumber || "",
        service_title: r.faultType || "设备售后服务",
        number: r.orderNo,
        city: r.address?.city || "地址见详情",
        provider_name: r.serviceName || "设备服务商",
        created_at: r.createdAt || r.created_at,
      }));
      const combined = rows
        .map((r) => ({
          ...r,
          source: "platform",
          sourceLabel:
            r.intake?.source === "DEVICE_REPAIR"
              ? "设备报修 · 平台"
              : "平台服务",
        }))
        .concat(normalized)
        .sort(
          (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0),
        );
      frame(
        "服务订单",
        "设备报修与售后服务，在这里统一跟进。",
        '<div class="category-tabs" role="group" aria-label="订单状态">' +
          [
            ["all", "全部"],
            ["active", "进行中"],
            ["waiting", "待我处理"],
            ["completed", "已完成"],
            ["cancelled", "已取消"],
          ]
            .map(
              ([key, label]) =>
                '<button type="button" data-order-state="' +
                key +
                '" aria-pressed="' +
                (key === "all") +
                '">' +
                label +
                "</button>",
            )
            .join("") +
          '</div><div class="order-filter-row"><input id="orderSearch" aria-label="搜索订单" placeholder="搜索设备、SN 或订单号"><select id="orderSource" aria-label="服务来源"><option value="all">全部来源</option><option value="platform">平台服务</option><option value="company">企业售后</option></select></div><p class="order-count" id="orderCount"></p><div id="unifiedOrderList"></div>',
      );
      let state = "all";
      function render() {
        const query = document
            .getElementById("orderSearch")
            .value.trim()
            .toLowerCase(),
          source = document.getElementById("orderSource").value;
        const filtered = combined.filter(
          (r) =>
            (source === "all" || source === r.source) &&
            (!query ||
              [
                r.device_model,
                r.device_serial,
                r.number,
                r.service_title,
                r.provider_name,
              ].some((v) =>
                String(v || "")
                  .toLowerCase()
                  .includes(query),
              )) &&
            (state === "all" ||
              (state === "active" &&
                !["COMPLETED", "CANCELLED"].includes(r.status)) ||
              (state === "waiting" &&
                (role === "customer"
                  ? [
                      "QUOTED",
                      "AWAITING_ACCEPTANCE",
                      "PENDING_PAYMENT",
                      "PENDING_FINAL_PAYMENT",
                    ]
                  : ["ASSIGNED", "ACCEPTED", "APPROVED", "IN_SERVICE"]
                ).includes(r.status)) ||
              (state === "completed" && r.status === "COMPLETED") ||
              (state === "cancelled" && r.status === "CANCELLED")),
        );
        document.getElementById("orderCount").textContent =
          filtered.length + " 笔服务订单";
        document.getElementById("unifiedOrderList").innerHTML = filtered.length
          ? filtered.map(orderCard).join("")
          : empty("当前条件下没有服务订单。");
      }
      root.querySelectorAll("[data-order-state]").forEach(
        (button) =>
          (button.onclick = () => {
            state = button.dataset.orderState;
            root
              .querySelectorAll("[data-order-state]")
              .forEach((b) =>
                b.setAttribute("aria-pressed", String(b === button)),
              );
            render();
          }),
      );
      document.getElementById("orderSearch").oninput = render;
      document.getElementById("orderSource").onchange = render;
      render();
      if (legacy.error) alertBox("部分企业售后记录暂未读取，请重新加载。");
    }
  }
  function renderDetail(r, actions) {
    var next = {
      REQUESTED: "需求已收到，正在等待安排工程师。",
      ASSIGNED: "工程师已安排，等待确认接单。",
      ACCEPTED: "需求核实中，工程师将提交服务报价。",
      QUOTED: "报价已提交，请核对服务范围与金额。",
      APPROVED: "报价已确认，等待开始服务。",
      IN_SERVICE: "服务正在进行，完成后可查看服务记录。",
      AWAITING_ACCEPTANCE: "服务已完成，请核对记录并验收。",
      COMPLETED: "本次服务已验收，感谢您的信任。",
      CANCELLED: "需求已取消，记录将继续保留。",
    };
    var steps = ["提交需求", "安排工程师", "确认报价", "现场服务", "服务验收"],
      index = {
        REQUESTED: 0,
        ASSIGNED: 1,
        ACCEPTED: 1,
        QUOTED: 2,
        APPROVED: 2,
        IN_SERVICE: 3,
        AWAITING_ACCEPTANCE: 4,
        COMPLETED: 4,
      }[r.status];
    var eventLabels = {
      REQUESTED: "提交需求",
      delegate: "发送企业委托",
      "delegate-accept": "企业确认承接",
      "delegate-reject": "企业退回委托",
      "delegate-withdraw": "撤回委托安排",
      claim: "工程师领取",
      assign: "平台指派",
      accept: "确认接单",
      quote: "提交报价",
      approve: "客户确认报价",
      start: "开始服务",
      complete: "提交完工",
      confirm: "客户验收",
      cancel: "取消需求",
    };
    var facts =
      '<section class="market-card detail-facts"><h2>服务信息</h2><dl><dt>设备型号</dt><dd>' +
      e(r.device_model) +
      (r.device_serial
        ? "</dd><dt>设备 SN</dt><dd>" + e(r.device_serial)
        : "") +
      "</dd><dt>服务项目</dt><dd>" +
      e(r.service_title) +
      "</dd><dt>服务地址</dt><dd>" +
      e(r.city) +
      " " +
      e(r.address) +
      '</dd></dl><div class="request-description"><small>故障与需求</small><p>' +
      e(r.description) +
      "</p></div></section>";
    var contact =
      '<section class="market-card detail-contact"><span class="contact-avatar">' +
      icon(role === "customer" ? "engineering" : "person") +
      "</span><div><small>" +
      e(role === "customer" ? "服务工程师" : "客户联系人") +
      "</small><strong>" +
      (role === "customer" && r.engineer_id
        ? '<a href="engineer-info.html?id=' +
          e(r.engineer_id) +
          '">' +
          e(r.engineer_name || "工程师") +
          "</a>"
        : e(
            role === "customer"
              ? r.engineer_name || "等待安排"
              : r.customer.name,
          )) +
      "</strong><small>" +
      e(
        role === "customer"
          ? r.assigned_provider_name || r.provider_name || "平台服务网络"
          : r.customer.phone,
      ) +
      "</small></div>" +
      (role === "engineer"
        ? '<a class="contact-phone" href="tel:' +
          e(r.customer.phone) +
          '" aria-label="联系客户">' +
          icon("call") +
          "</a>"
        : '<a href="chat.html" class="market-text-link">联系客服' +
          icon("chevron_right") +
          "</a>") +
      "</section>";
    frame(
      "服务单详情",
      r.number,
      '<section class="detail-status"><div class="status-symbol">' +
        icon(
          r.status === "COMPLETED"
            ? "task_alt"
            : r.status === "CANCELLED"
              ? "cancel"
              : role === "customer"
                ? "build_circle"
                : "assignment",
        ) +
        '</div><div><span class="eyebrow">' +
        e(role === "customer" ? "当前服务进度" : "当前任务状态") +
        "</span><h2>" +
        e(states[r.status]) +
        "</h2><p>" +
        e(next[r.status]) +
        "</p></div></section>" +
        (r.status === "CANCELLED"
          ? ""
          : '<ol class="service-stepper" aria-label="服务进度">' +
            steps
              .map(
                (label, i) =>
                  '<li class="' +
                  (i <= index ? "reached" : "") +
                  '" ' +
                  (i === index ? 'aria-current="step"' : "") +
                  "><span>" +
                  (i < index ? "✓" : i + 1) +
                  "</span><small>" +
                  label +
                  "</small></li>",
              )
              .join("") +
            "</ol>") +
        '<section class="market-card service-responsibility"><h2>本次服务安排</h2><dl><dt>服务团队</dt><dd>' +
        e(serviceTeam(r)) +
        "</dd><dt>履约企业</dt><dd>" +
        e(r.assigned_provider_name || r.provider_name || "平台安排中") +
        "</dd><dt>调度安排</dt><dd>" +
        e(dispatchBy(r)) +
        "</dd><dt>设备关联企业</dt><dd>" +
        e(r.commissioner_name || "平台直接客户") +
        "</dd></dl></section>" +
        (role === "engineer" ? contact + facts : facts + contact) +
        (r.quote_amount !== null
          ? '<section class="market-card quote-summary"><div><small>服务报价</small><strong><span>¥</span>' +
            Number(r.quote_amount).toFixed(2) +
            "</strong></div><p>" +
            e(r.quote_note) +
            "</p><small>确认服务范围与金额后继续；当前未执行线上收款。</small></section>"
          : "") +
        '<section class="market-card"><div id="stageVisuals"></div></section>' +
        (r.report
          ? '<section class="market-card"><h2>服务记录</h2><p>' +
            e(r.report) +
            "</p></section>"
          : "") +
        '<section class="market-card"><details class="service-relations"><summary>服务方与设备归属' +
        icon("expand_more") +
        "</summary><dl><dt>设备关联企业</dt><dd>" +
        e(r.commissioner_name || "未关联企业设备") +
        "</dd><dt>本次承接方</dt><dd>" +
        e(
          r.assigned_provider_name ||
            r.provider_name ||
            (r.engineer_id ? "平台合作工程师" : "平台服务网络 · 待安排"),
        ) +
        '</dd></dl><p class="market-note">本次服务按确认报价执行，设备关联不代表原企业自动承担费用。</p></details></section>' +
        '<section class="market-card"><h2>服务动态</h2><ol class="event-timeline">' +
        r.events
          .slice()
          .reverse()
          .map(
            (v, i) =>
              "<li " +
              (i === 0 ? 'class="latest"' : "") +
              "><div><strong>" +
              e(eventLabels[v.action] || v.action) +
              "</strong><time>" +
              e(time(v.created_at)) +
              "</time></div>" +
              (v.note ? "<p>" + e(v.note) + "</p>" : "") +
              "</li>",
          )
          .join("") +
        "</ol></section>" +
        (actions.length
          ? '<div class="detail-action-bar"><div><small>' +
            e(role === "customer" ? "下一步" : "当前操作") +
            "</small><strong>" +
            e(actions.find((a) => a[0] !== "cancel")?.[1] || "需要调整服务？") +
            "</strong></div><div>" +
            actions
              .map(
                (a) =>
                  '<button class="' +
                  (a[0] === "cancel" ? "market-secondary" : "market-primary") +
                  '" data-action="' +
                  a[0] +
                  '">' +
                  a[1] +
                  "</button>",
              )
              .join("") +
            "</div></div>"
          : ""),
    );
  }
  async function detail() {
    var id = new URLSearchParams(location.search).get("id");
    if (!id) throw Error("缺少服务单编号");
    var r = await api("/requests/" + id);
    var actions = [];
    if (role === "customer") {
      if (r.status === "QUOTED") actions.push(["approve", "确认服务报价"]);
      if (r.status === "AWAITING_ACCEPTANCE")
        actions.push(["confirm", "确认服务验收"]);
      if (["REQUESTED", "ASSIGNED", "ACCEPTED", "QUOTED"].includes(r.status))
        actions.push(["cancel", "取消需求"]);
    } else {
      if (r.status === "ASSIGNED") actions.push(["accept", "确认接单"]);
      if (r.status === "ACCEPTED") actions.push(["quote", "提交报价"]);
      if (r.status === "APPROVED") actions.push(["start", "开始服务"]);
      if (r.status === "IN_SERVICE") actions.push(["complete", "提交完工记录"]);
    }
    renderDetail(r, actions);
    root.querySelectorAll("[data-action]").forEach(function (button) {
      button.onclick = function () {
        var action = button.dataset.action;
        if (
          action === "quote" ||
          action === "complete" ||
          action === "cancel"
        ) {
          var dialog = document.createElement("dialog");
          dialog.className = "market-dialog";
          var panel = document.createElement("form");
          panel.className = "market-card";
          panel.innerHTML =
            "<h2>" +
            e(button.textContent) +
            "</h2>" +
            (action === "quote"
              ? field("报价金额（元）", "amount", "number", true)
              : "") +
            "<label>" +
            (action === "complete" ? "服务与验证记录" : "说明") +
            '<textarea name="note" required minlength="' +
            (action === "cancel" ? 2 : 5) +
            '" maxlength="3000"></textarea></label><button class="market-primary">确认提交</button>';
          dialog.append(panel);
          root.append(dialog);
          var close = document.createElement("button");
          close.type = "button";
          close.className = "market-secondary";
          close.textContent = "返回详情";
          close.onclick = () => dialog.close();
          panel.append(close);
          dialog.addEventListener("close", () => dialog.remove());
          dialog.showModal();
          var amount = panel.querySelector("[name=amount]");
          if (amount) {
            amount.min = "0";
            amount.max = "10000000";
            amount.step = "0.01";
          }
          panel.onsubmit = function (ev) {
            ev.preventDefault();
            guarded(panel.querySelector("button"), async function () {
              var values = Object.fromEntries(new FormData(panel));
              await api("/requests/" + id + "/action", {
                action,
                version: r.version,
                amount: action === "quote" ? Number(values.amount) : undefined,
                note: values.note,
                report: action === "complete" ? values.note : undefined,
              });
              dialog.close();
              await detail();
            });
          };
        } else
          guarded(button, async function () {
            if (!(await confirmAction(button.textContent))) return;
            await api("/requests/" + id + "/action", {
              action,
              version: r.version,
            });
            await detail();
          });
      };
    });
  }
  async function pool() {
    me = await api("/me");
    var rows = await api("/pool");
    frame(
      "接单大厅",
      "按服务城市与技能资格，领取适合的现场任务。",
      '<section class="pool-summary"><div><strong>' +
        rows.length +
        " 项可接任务</strong><small>接单审核：" +
        e(
          me.engineer?.state === "APPROVED"
            ? "已通过"
            : states[me.engineer?.state] || "尚未申请",
        ) +
        " · " +
        e((me.engineer?.cities || []).join(" / ") || "服务区域待完善") +
        '</small></div><a href="market-profile.html">管理身份' +
        icon("chevron_right") +
        "</a></section>" +
        (me.employers.length
          ? '<label>本次履约企业<select id="employer">' +
            options(me.employers) +
            "</select></label>"
          : "") +
        '<div class="market-shortcuts"><a href="learning.html">培训与资质</a>' +
        (me.employers.length ? '<a href="grab.html">企业派单</a>' : "") +
        "</div>" +
        sectionTitle("可领取的服务需求") +
        (rows.length
          ? rows
              .map(
                (r) =>
                  '<section class="market-card pool-task"><div class="market-card-head"><span class="order-category">' +
                  e(labels[r.category]) +
                  '</span><span class="market-badge">待接单</span></div><h2>' +
                  e(r.device_model) +
                  '</h2><p class="task-city">' +
                  icon("location_on") +
                  e(r.city) +
                  "</p><small>" +
                  e(r.service_title) +
                  '</small><div class="task-footer"><span>' +
                  e(r.provider_name || "平台开放需求") +
                  '</span><button class="market-primary" data-claim="' +
                  e(r.id) +
                  '">领取任务' +
                  icon("arrow_forward") +
                  "</button></div><small>领取后可查看详细地址与客户联系方式。</small></section>",
              )
              .join("")
          : empty(
              "暂时没有符合条件的任务",
              "market-profile.html",
              "检查服务区域与接单资格",
            )),
    );
    root.querySelectorAll("[data-claim]").forEach(function (button) {
      button.onclick = function () {
        guarded(button, async function () {
          var r = rows.find(function (r) {
            return r.id === button.dataset.claim;
          });
          await api("/requests/" + r.id + "/action", {
            action: "claim",
            version: r.version,
            serviceId: document.getElementById("employer")?.value,
          });
          location.href = "platform-order.html?id=" + r.id;
        });
      };
    });
  }
  async function courses() {
    me = await api("/me");
    var rows = await api("/courses");
    frame(
      "培训与服务资质",
      "报名、到场培训、平台记录考核结果，通过后才获得对应接单资质。",
      '<section class="market-card"><h2>我的接单资质</h2>' +
        (me.qualifications.length
          ? me.qualifications
              .map(function (q) {
                return (
                  "<p>" +
                  e(labels[q.skill]) +
                  " · " +
                  (new Date(q.expires_at) > new Date()
                    ? "有效至 "
                    : "已到期 ") +
                  e(new Date(q.expires_at).toLocaleDateString("zh-CN")) +
                  "</p>"
                );
              })
              .join("")
          : "<p>暂无平台接单资质，可报名对应培训。</p>") +
        '<a class="market-text-link" href="market-profile.html">' +
        (role === "customer" ? "申请成为合作工程师" : "查看工程师服务身份") +
        "</a></section>" +
        rows
          .map(function (c) {
            return (
              '<section class="market-card course-card"><img class="course-cover" data-course-thumb="' +
              e(c.id) +
              '" src="/media/service-visuals/' +
              ({
                welding: "service-welding",
                maintenance: "service-maintenance",
                cutting: "course-practice",
              }[c.skill] || "course-practice") +
              '.webp" alt="课程场景示意，AI生成" loading="lazy"><p class="course-demo-label">AI 课程场景示意</p><div class="market-card-head"><h2>' +
              e(c.title) +
              "</h2>" +
              badge(labels[c.skill]) +
              "</div><p>" +
              e(c.center_name) +
              " · " +
              e(c.city) +
              "</p><p>" +
              e(c.address) +
              "</p><p>" +
              e(String(c.start_date).slice(0, 10)) +
              " · 名额 " +
              c.enrolled +
              "/" +
              c.capacity +
              "</p><p>" +
              e(c.description) +
              '</p><button class="' +
              (c.my_state ? "market-secondary" : "market-primary") +
              '" data-enroll="' +
              c.id +
              '" ' +
              (c.my_state || c.enrolled >= c.capacity ? "disabled" : "") +
              ">" +
              (c.my_state
                ? e(states[c.my_state] || c.my_state)
                : c.enrolled >= c.capacity
                  ? "名额已满"
                  : "报名培训") +
              '</button><details><summary>查看培训地点与实训图片</summary><div data-course-visual="' +
              e(c.id) +
              '"></div></details></section>'
            );
          })
          .join(""),
    );
    root.querySelectorAll("[data-enroll]").forEach(function (button) {
      button.onclick = function () {
        guarded(button, async function () {
          var result = await api(
            "/courses/" + button.dataset.enroll + "/enroll",
            {},
          );
          await courses();
          alertBox(result.message);
        });
      };
    });
  }
  async function profile() {
    me = await api("/me");
    frame(
      "工程师服务身份",
      "服务企业员工与平台合作工程师均需审核及有效资质后才能接单。",
      '<section class="market-card"><h2>当前状态：' +
        e(
          me.engineer?.state === "APPROVED"
            ? "审核通过"
            : states[me.engineer?.state] || "尚未申请",
        ) +
        "</h2><p>" +
        e(me.engineer?.review_note || "填写服务区域与经验，提交平台审核。") +
        "</p>" +
        (role === "customer" && me.engineer?.state === "APPROVED"
          ? '<p>审核已通过，可前往工程师端使用同一手机号登录。</p><a class="market-primary" href="http://' +
            location.hostname +
            ':3102/login.html">进入工程师端</a>'
          : "") +
        '</section><form id="engineerForm" class="market-card"><label>接单身份<select name="mode"><option value="INDEPENDENT">平台合作工程师</option><option value="ORG">服务企业工程师</option></select></label>' +
        field(
          "姓名",
          "name",
          "text",
          true,
          me.person?.name === "新用户" ? "" : me.person?.name,
        ) +
        field(
          "服务城市（逗号分隔，可填全国）",
          "cities",
          "text",
          true,
          (me.engineer?.cities || []).join("，"),
        ) +
        '<label>服务经历与擅长领域<textarea name="introduction" required minlength="5" maxlength="1000">' +
        e(me.engineer?.introduction || "") +
        '</textarea></label><p class="market-note">提交修改会重新进入审核；审核通过不代表所有设备类别均可接单，还需对应资质。</p><button class="market-primary">提交审核</button></form><div class="market-shortcuts"><a href="' +
        (role === "customer" ? "training.html" : "learning.html") +
        '">查看培训与资质</a></div>',
    );
    document.querySelector("[name=mode] option[value=ORG]").disabled =
      !me.employers.length;
    document.querySelector("[name=mode]").value =
      me.engineer?.mode || (me.employers.length ? "ORG" : "INDEPENDENT");
    document.getElementById("engineerForm").onsubmit = function (ev) {
      ev.preventDefault();
      var form = ev.target;
      guarded(form.querySelector("button"), async function () {
        var values = Object.fromEntries(new FormData(form));
        values.cities = values.cities
          .split(/[,，]/)
          .map(function (c) {
            return c.trim();
          })
          .filter(Boolean);
        var result = await api("/engineer-profile", values);
        await profile();
        alertBox(result.message);
      });
    };
  }
  (
    ({
      home: home,
      "device-detail": () => window.VisualPages.render({ frame, e, icon }),
      company: () => window.VisualPages.render({ frame, e, icon }),
      "engineer-info": () => window.VisualPages.render({ frame, e, icon }),
      repair: () =>
        window.renderDeviceRepair({
          root,
          frame,
          personal,
          e,
          icon,
          api,
          guarded,
          error: alertBox,
        }),
      services: catalog,
      orders: function () {
        return orders(false);
      },
      workbench: function () {
        return orders(true);
      },
      detail: detail,
      pool: pool,
      courses: courses,
      profile: profile,
    })[screen] || catalog
  )().catch(function (error) {
    frame(
      "服务暂时无法加载",
      "请重试或检查登录状态。",
      '<button class="market-primary" onclick="location.reload()">重新加载</button>',
    );
    alertBox(error.message);
  });
})();
