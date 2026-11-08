(function () {
  function el(tag, text, cls) {
    var n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  }
  function start() {
    var token = localStorage.getItem("customer_token");
    if (!token) return;
    var main = document.querySelector("main");
    if (!main) return;
    var servicesPromise = fetch(window.APP_API_BASE + "/identity/services", {
      headers: { Authorization: "Bearer " + token },
    }).then(window.readApiResponse);
    function serviceRow(service) {
      var row = el("div", undefined, "customer-service-row");
      if (service.logoDataUrl) {
        var logo = el("img");
        logo.src = service.logoDataUrl;
        logo.alt = service.name + " Logo";
        row.append(logo);
      } else
        row.append(el("span", service.name.slice(0, 1), "service-initial"));
      var info = el("div");
      info.append(el("small", "设备服务商"), el("strong", service.name));
      var a = el("a", "联系");
      a.href = "chat.html?serviceId=" + encodeURIComponent(service.id);
      var intro=el("a","企业介绍");intro.href="company.html?id="+encodeURIComponent(service.id);intro.className="visual-company-link";info.append(intro);
      row.append(info, a);
      return row;
    }
    var page = location.pathname.split("/").pop();
    if (page === "home.html") {
      var section = el("section", undefined, "customer-service-hub");
      section.setAttribute("aria-label", "设备服务中心");
      section.append(
        el("small", "我的设备服务"),
        el("h2", "今天，有什么需要处理？"),
      );
      var content = el("div", "正在查看服务进度…");
      section.append(content);
      main.prepend(section);
      Promise.all([
        fetch(window.APP_API_BASE + "/customer/work-orders", {
          headers: { Authorization: "Bearer " + token },
        }).then(window.readApiResponse),
        servicesPromise,
      ])
        .then(function (results) {
          content.replaceChildren();
          var orders = results[0],
            services = results[1],
            todo = orders.filter(function (o) {
              return (
                ["PENDING_PAYMENT", "PENDING_FINAL_PAYMENT"].includes(
                  o.status,
                ) ||
                (o.status === "COMPLETED" && o.reviewed === false)
              );
            });
          if (!todo.length)
            content.append(
              el(
                "p",
                services.length
                  ? "当前没有需要你确认或付款的事项。"
                  : "先绑定设备，即可找到对应的售后服务商。",
                "customer-hub-note",
              ),
            );
          todo.slice(0, 3).forEach(function (order) {
            var link = el("a", undefined, "customer-todo");
            link.href = "order-progress.html#" + encodeURIComponent(order.id);
            var text = el("div");
            text.append(
              el(
                "strong",
                order.status === "PENDING_PAYMENT"
                  ? order.customerConfirm
                    ? "完成定金支付"
                    : "查看并确认维修报价"
                  : order.status === "PENDING_FINAL_PAYMENT"
                    ? "核对维修结果与结算"
                    : "评价本次服务",
              ),
              el(
                "small",
                (order.device?.model || order.faultType || "维修工单") +
                  " · " +
                  (order.serviceName || "设备服务商"),
              ),
            );
            link.append(text, el("span", "去处理 →"));
            content.append(link);
          });
          var actions = el("div", undefined, "customer-hub-actions");
          var devices = el("a", "我的设备");
          devices.href = "devices.html";
          var bind = el("a", "绑定新设备");
          bind.href = "devices.html?bind=1";
          actions.append(devices, bind);
          content.append(actions);
          if (services.length) {
            var list = el("details");
            var title = el(
              "summary",
              "我的服务商 · " + services.length + " 家",
            );
            list.append(title);
            services.forEach(function (c) {
              list.append(serviceRow(c));
            });
            content.append(list);
          }
        })
        .catch(function () {
          content.textContent = "服务进度加载失败，请刷新后重试。";
        });
    }
    if (page === "devices.html" && typeof window.renderDevices === "function") {
      var original = window.renderDevices;
      window.renderDevices = function (devices) {
        original(devices);
        var cards = Array.from(
          document.querySelectorAll("#deviceList>div"),
        ).slice(0, devices.length);
        servicesPromise
          .then(function (services) {
            devices.forEach(function (d, index) {
              var company = services.find(function (s) {
                return s.id === d.serviceId;
              });
              if (company && cards[index]) {
                cards[index].querySelectorAll("p").forEach(function (p) {
                  if (p.textContent.startsWith("服务商：")) p.remove();
                });
                cards[index].append(serviceRow(company));
              }
            });
          })
          .catch(function () {});
      };
      var lead = el("section", undefined, "customer-service-hub device-help");
      lead.append(
        el("h2", "我的设备与售后服务"),
        el(
          "p",
          "每台设备都有对应服务商，报修时自动带入，无需填写企业代码。",
          "customer-hub-note",
        ),
      );
      main.prepend(lead);
    }
    if (
      page === "order-progress.html" &&
      typeof window.renderOrderData === "function"
    ) {
      var render = window.renderOrderData;
      window.renderOrderData = function (order) {
        render(order);
        var flow = document.getElementById("flowCompany");
        if (flow && order.serviceId) {
          var a = el("a", "联系当前服务商", "customer-service-contact");
          a.href = "chat.html?serviceId=" + encodeURIComponent(order.serviceId);
          flow.replaceChildren(
            el("span", "服务企业：" + (order.serviceName || "当前设备服务商")),
            a,
          );
        }
        var old = document.getElementById("customer-next-action");
        if (old) old.remove();
        var actions = document.getElementById("actionSection"),
          next = document.getElementById("flowNext");
        if (actions && next) {
          var button = Array.from(actions.querySelectorAll("button")).find(
            function (b) {
              return (
                !b.classList.contains("hidden") &&
                !b.disabled &&
                getComputedStyle(b).display !== "none"
              );
            },
          );
          if (button) {
            var actionText =
              order.status === "PENDING_PAYMENT"
                ? order.customerConfirm
                  ? "查看定金与支付"
                  : "查看报价并确认"
                : order.status === "PENDING_FINAL_PAYMENT"
                  ? "查看结算明细"
                  : "查看待办操作";
            var link = el("button", actionText + " ↓", "customer-next-action");
            link.id = "customer-next-action";
            link.onclick = function () {
              var target = [
                "PENDING_PAYMENT",
                "PENDING_FINAL_PAYMENT",
              ].includes(order.status)
                ? document.getElementById("quoteSection") || actions
                : actions;
              target.scrollIntoView({
                behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
                  ? "auto"
                  : "smooth",
                block: "center",
              });
            };
            next.parentElement.append(link);
          }
        }
      };
    }
  }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", start);
  else start();
})();
