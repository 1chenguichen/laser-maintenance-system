(function () {
  window.createOrganizationLogin = function (role, options) {
    options = options || {};
    let active = true,
      pending = false;
    const api = window.APP_API_BASE,
      host = document.getElementById("organizationContext");
    if (host)
      host.innerHTML =
        '<p class="login-account-note">' +
        (role === "customer"
          ? "使用账号登录，系统自动进入对应服务。"
          : "使用企业已开通的手机号登录，系统自动关联工作身份。") +
        '</p><div id="organizationError" role="alert"></div>';
    localStorage.removeItem("laser_organization");
    localStorage.removeItem("laser_tenant_code");
    async function request(path, body) {
      const r = await fetch(
        api +
          (path === "mobile-login" ? "/iot/mobile-login" : "/identity/" + path),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(15000),
        },
      );
      const data = await r.json();
      if (!r.ok)
        throw Error(
          Array.isArray(data.message)
            ? data.message.join("；")
            : data.message || "登录失败",
        );
      return data;
    }
    function safeNext(value) {
      return /^(?:devices|device-scan|orders|repair-form|home)\.html(?:[?#]|$)/.test(
        value || "",
      );
    }
    function accept(result) {
      let destination;
      if (role === "customer") {
        if (result.mobile.type === "enterprise") {
          localStorage.removeItem("customer_token");
          localStorage.removeItem("customer_user");
          sessionStorage.setItem("iot_business_token", result.accessToken);
          sessionStorage.setItem(
            "iot_business_user",
            JSON.stringify({ ...result.user, mobileType: "enterprise" }),
          );
          destination = result.mobile.next;
        } else {
          sessionStorage.removeItem("iot_business_token");
          sessionStorage.removeItem("iot_business_user");
          localStorage.setItem("customer_token", result.accessToken);
          localStorage.setItem(
            "customer_user",
            JSON.stringify({ ...result.user, mobileType: "customer" }),
          );
          const next = new URLSearchParams(location.search).get("next");
          destination = safeNext(next) ? next : result.mobile.next;
        }
      } else {
        localStorage.setItem(role + "_token", result.accessToken);
        localStorage.setItem(role + "_user", JSON.stringify(result.user));
        destination = "grab.html";
      }
      if (options.onSuccess && result.mobile?.type !== "enterprise")
        options.onSuccess(result);
      else location.replace(destination);
    }
    async function perform(body) {
      if (pending) return;
      pending = true;
      const button = document.getElementById("loginBtn"),
        error = document.getElementById("organizationError");
      if (button) {
        button.disabled = true;
        button.textContent = "登录中…";
      }
      if (error) error.textContent = "";
      try {
        const result = await request(
          role === "customer" ? "mobile-login" : "login",
          body,
        );
        if (active) accept(result);
        return result;
      } catch (e) {
        if (error)
          error.textContent =
            e.name === "TimeoutError" ? "登录超时，请重试。" : e.message;
      } finally {
        pending = false;
        if (button?.isConnected) {
          button.disabled = false;
          button.textContent = "登录";
        }
      }
    }
    if (role === "customer") {
      const next = new URLSearchParams(location.search).get("next"),
        token = localStorage.getItem("customer_token");
      if (next && safeNext(next) && token) {
        fetch(api + "/iot/mobile-context", {
          headers: { Authorization: "Bearer " + token },
        })
          .then((r) => (r.ok ? r.json() : null))
          .then((mobile) => {
            if (active && !pending && mobile)
              accept({
                accessToken: token,
                user: JSON.parse(localStorage.getItem("customer_user") || "{}"),
                mobile,
              });
          })
          .catch(() => {});
      }
    }
    return {
      login: (phone, code) => perform({ phone, code, role, mode: "code" }),
      password: (username, password) =>
        perform({ mode: "password", username, password }),
      sendCode: (phone) => request("send-code", { phone }),
      ready: () => Promise.resolve(),
      destroy: () => {
        active = false;
      },
    };
  };
})();
