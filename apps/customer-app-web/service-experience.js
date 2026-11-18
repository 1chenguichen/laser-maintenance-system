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
    var page = location.pathname.split("/").pop();
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
