(function () {
  function upgrade(node) {
    if (!(node instanceof Element)) return;
    var items = [
      node,
      ...node.querySelectorAll(
        "button,input,textarea,.modal,.modal-overlay,.material-symbols-outlined",
      ),
    ];
    items.forEach(function (el) {
      if (el.classList.contains("material-symbols-outlined"))
        el.setAttribute("aria-hidden", "true");
      if (el.tagName === "BUTTON") {
        if (el.matches('[class*="bg-red"],[class*="text-red"],.text-error'))
          return;
        var icon = el.querySelector(".material-symbols-outlined");
        if (
          icon &&
          !el.getAttribute("aria-label") &&
          el.textContent.trim() === icon.textContent.trim()
        ) {
          var names = {
            arrow_back: "返回上一页",
            add: "添加",
            close: "关闭窗口",
            refresh: "刷新数据",
            send: "发送消息",
            delete: "清空对话",
            add_circle: "更多操作",
          };
          el.setAttribute(
            "aria-label",
            names[icon.textContent.trim()] || el.title || "查看操作",
          );
        }
        if (
          !el.dataset.ui &&
          !el.closest("header,nav") &&
          !el.matches(".tab,.status-btn,[data-tab],[data-status]")
        ) {
          if (
            el.classList.contains("text-white") ||
            el.classList.contains("business-button") ||
            el.matches(".wh-primary,.wh-form-actions [type=submit]")
          )
            el.dataset.ui = "primary";
          else if (
            el.classList.contains("border") &&
            !el.classList.contains("text-error")
          )
            el.dataset.ui = "secondary";
        }
      }
      if (
        el.matches("input:not([type=hidden]),textarea") &&
        !el.getAttribute("aria-label") &&
        !el.labels?.length &&
        el.placeholder
      )
        el.setAttribute("aria-label", el.placeholder);
      if (el.classList.contains("modal")) {
        el.setAttribute("role", "dialog");
        el.setAttribute("aria-modal", "true");
        var h = el.querySelector("h2,h3");
        if (h) {
          if (!h.id) h.id = "mobile-modal-title";
          el.setAttribute("aria-labelledby", h.id);
        }
      }
    });
  }
  document.addEventListener("DOMContentLoaded", function () {
    upgrade(document.body);
    var page = document.body.dataset.page;
    var guides = {
      devices: ["我的设备与售后", "设备档案、服务商与保障信息，集中查看。"],
      addresses: ["常用服务地址", "维护上门地址，报修时直接选择。"],
      orders: ["设备售后记录", "查看原企业工单，跟进维修与结算进度。"],
      tasks: ["企业服务任务", "按当前工作企业查看和处理维修任务。"],
      grab: ["企业派单大厅", "查看当前企业可领取的维修任务。"],
      history: ["已完成的服务", "按当前工作企业回顾维修记录。"],
    };
    if (guides[page]) {
      var main = document.querySelector("body>main");
      if (main) {
        main.querySelector(".device-help")?.remove();
        var p = document.createElement("p");
        p.className = "page-guide";
        var strong = document.createElement("strong");
        strong.textContent = guides[page][0];
        p.append(strong, document.createTextNode(guides[page][1]));
        main.prepend(p);
      }
    }
    var user =
      document.getElementById("userName") ||
      document.getElementById("engineerName");
    if (user) {
      var row = user.closest(".flex");
      var avatar = row?.firstElementChild;
      if (
        avatar &&
        avatar !== user &&
        avatar.classList.contains("rounded-full")
      ) {
        avatar.dataset.uiAvatar = "";
        avatar.innerHTML =
          '<span class="material-symbols-outlined" aria-hidden="true">' +
          (document.body.dataset.role === "customer"
            ? "person"
            : "engineering") +
          "</span>";
      }
    }
    if (page === "profile") {
      var main = document.querySelector("main"),
        platform = Array.from(main.querySelectorAll(":scope>section")).find(
          (s) =>
            /^平台服务$|^平台工作身份$/.test(
              s.querySelector("h2")?.textContent.trim() || "",
            ),
        );
      if (platform) {
        platform.classList.add("profile-service-group");
        platform.querySelectorAll("a").forEach((a) => {
          var title = a.textContent,
            mark = document.createElement("span"),
            text = document.createElement("span"),
            arrow = document.createElement("span");
          mark.className = arrow.className = "material-symbols-outlined";
          mark.setAttribute("aria-hidden", "true");
          arrow.setAttribute("aria-hidden", "true");
          mark.textContent =
            {
              "services.html": "travel_explore",
              "market-orders.html": "receipt_long",
              "chat.html": "support_agent",
              "training.html": "school",
              "market-profile.html": "verified_user",
              "workbench.html": "space_dashboard",
              "learning.html": "school",
              "inventory.html": "inventory_2",
              "ai-assistant.html": "smart_toy",
            }[a.getAttribute("href")] || "person";
          text.textContent = title;
          arrow.textContent = "chevron_right";
          a.replaceChildren(mark, text, arrow);
        });
        var logout = main.querySelector('button[onclick*="logout"]');
        if (logout) {
          var target = logout;
          while (target.parentElement !== main) target = target.parentElement;
          main.insertBefore(platform, target);
        }
      }
    }
    new MutationObserver(function (records) {
      records.forEach((r) => r.addedNodes.forEach((n) => upgrade(n)));
    }).observe(document.querySelector("main") || document.body, {
      childList: true,
      subtree: true,
    });
    // Focus stays in legacy dialogs while open, including Tab and Escape navigation.
    document.addEventListener("keydown", function (ev) {
      var modal = Array.from(document.querySelectorAll(".modal-overlay")).find(
        (el) =>
          el.getBoundingClientRect().height &&
          getComputedStyle(el).visibility !== "hidden",
      );
      if (!modal) return;
      var focusable = Array.from(
        modal.querySelectorAll(
          "button,input:not([type=hidden]),select,textarea,a[href]",
        ),
      ).filter((el) => !el.disabled && el.getClientRects().length);
      if (ev.key === "Escape") {
        var close = modal.querySelector(
          'button[aria-label="关闭窗口"],button[onclick*="hideModal"],button[onclick*="close"]',
        );
        if (close) {
          ev.preventDefault();
          close.click();
        }
      }
      if (ev.key === "Tab" && focusable.length) {
        var first = focusable[0],
          last = focusable[focusable.length - 1];
        if (
          ev.shiftKey &&
          (document.activeElement === first ||
            !modal.contains(document.activeElement))
        ) {
          ev.preventDefault();
          last.focus();
        } else if (
          !ev.shiftKey &&
          (document.activeElement === last ||
            !modal.contains(document.activeElement))
        ) {
          ev.preventDefault();
          first.focus();
        }
      }
    });
  });
})();
