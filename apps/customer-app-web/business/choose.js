(async function () {
  const token =
      sessionStorage.getItem("iot_business_token") ||
      localStorage.getItem("customer_token"),
    root = document.getElementById("workspace-list"),
    e = window.escapeHtml;
  if (!token) {
    location.replace("../login.html");
    return;
  }
  try {
    const r = await fetch(window.APP_API_BASE + "/iot/mobile-context", {
      headers: { Authorization: "Bearer " + token },
    });
    const mobile = await window.readApiResponse(r);
    if (mobile.type !== "enterprise") {
      if (sessionStorage.getItem("iot_business_token")) {
        sessionStorage.removeItem("iot_business_token");
        sessionStorage.removeItem("iot_business_user");
        location.replace("../login.html");
      } else location.replace("../home.html");
      return;
    }
    if (!sessionStorage.getItem("iot_business_token")) {
      sessionStorage.setItem("iot_business_token", token);
      sessionStorage.setItem(
        "iot_business_user",
        localStorage.getItem("customer_user") || "{}",
      );
      localStorage.removeItem("customer_token");
      localStorage.removeItem("customer_user");
    }
    if (mobile.workspaces.length === 1) {
      location.replace("../" + mobile.next);
      return;
    }
    root.innerHTML = mobile.workspaces
      .map(
        (w) =>
          '<a class="identity-option" href="index.html?workspace=' +
          encodeURIComponent(w.id) +
          '&account=business"><strong>' +
          e(w.name) +
          "</strong><small>" +
          {
            admin: "企业设备管理",
            operator: "设备监控与告警处理",
            viewer: "设备监控查看",
          }[w.role] +
          " · " +
          (w.subscription.expired
            ? "物联网服务已到期"
            : w.subscription.enabled
              ? "物联网已开通"
              : "物联网尚未开通") +
          "</small></a>",
      )
      .join("");
  } catch (err) {
    root.textContent = err.message + "，请重新登录。";
  }
  document.getElementById("switch-account").onclick = () => {
    sessionStorage.removeItem("iot_business_token");
    sessionStorage.removeItem("iot_business_user");
    location.replace("../login.html");
  };
})();
