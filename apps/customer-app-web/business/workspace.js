(async function () {
  const q = new URLSearchParams(location.search),
    workspace = q.get("workspace");
  const token = sessionStorage.getItem("iot_business_token");
  let dispose;
  const root = document.getElementById("iot-root");
  function message(text) {
    root.replaceChildren();
    const p = document.createElement("p");
    p.className = "identity-note";
    p.textContent = text;
    const a = document.createElement("a");
    a.href = "choose.html";
    a.className = "iot-btn";
    a.textContent = "返回企业选择";
    root.append(p, a);
  }
  const logout = document.getElementById("business-logout");
  logout.textContent = "退出登录";
  logout.onclick = () => {
    dispose?.();
    sessionStorage.removeItem("iot_business_token");
    sessionStorage.removeItem("iot_business_user");
    location.replace("../login.html");
  };
  if (!token || !workspace) {
    location.replace(token ? "choose.html" : "../login.html");
    return;
  }
  try {
    const r = await fetch(window.APP_API_BASE + "/iot/mobile-context", {
      headers: { Authorization: "Bearer " + token },
    });
    const context = await window.readApiResponse(r);
    if (context.type !== "enterprise") {
      sessionStorage.removeItem("iot_business_token");
      sessionStorage.removeItem("iot_business_user");
      location.replace("../login.html");
      return;
    }
    const organization = context.workspaces.find((w) => w.id === workspace);
    document.getElementById("switch-company").hidden =
      context.workspaces.length < 2;
    if (!organization) throw Error("当前账号没有该企业的授权");
    document.getElementById("company-name").textContent = organization.name;
    document.getElementById("company-role").textContent = {
      admin: "企业设备管理",
      operator: "告警处理",
      viewer: "仅查看",
    }[organization.role];
    if (!organization.subscription.enabled) {
      message(
        organization.subscription.expired
          ? "本企业物联网服务已到期，请联系平台续期开通。"
          : "本企业尚未开通物联网，请联系平台开通后使用。",
      );
      return;
    }
    const back = document.getElementById("business-detail-back");
    back.onclick = () => root.dispatchEvent(new Event("iot-request-back"));
    dispose = IoTConsole.mount(root, {
      onViewChange(view) {
        back.hidden = !view.detail;
      },
      mode: "company",
      business: true,
      apiBase: window.APP_API_BASE,
      token,
      workspace,
      deviceId: q.get("deviceId"),
    });
    window.addEventListener("pagehide", () => dispose?.(), { once: true });
  } catch (e) {
    message(e.message + "，请重新选择身份或登录。");
  }
})();
