(function () {
  var nativeFetch = window.fetch.bind(window),
    token = localStorage.getItem("engineer_token"),
    selected = null,
    companies = [],
    pending = null;
  function storageKey() {
    try {
      return "engineer_workspace:" + JSON.parse(atob(token.split(".")[1])).sub;
    } catch {
      return "engineer_workspace:anonymous";
    }
  }
  function ready() {
    if (pending) return pending;
    if (!token) return Promise.resolve(null);
    pending = nativeFetch(window.APP_API_BASE + "/identity/services", {
      headers: { Authorization: "Bearer " + token },
    })
      .then(window.readApiResponse)
      .then(async function (list) {
        if (!Array.isArray(list) || !list.length) {
          var market = await nativeFetch(window.APP_API_BASE + "/market/me", {
            headers: { Authorization: "Bearer " + token },
          }).then(window.readApiResponse);
          if (market.engineer?.state === "APPROVED") {
            selected = { id: "", name: "平台合作工程师", platform: true };
            return selected;
          }
          throw Error("暂无可用的企业工作身份");
        }
        companies = list;
        var saved = new URLSearchParams(location.search).get("serviceId") || sessionStorage.getItem(storageKey());
        selected =
          list.find(function (c) {
            return c.id === saved;
          }) || list[0];
        sessionStorage.setItem(storageKey(), selected.id);
        return selected;
      })
      .catch(function (e) {
        pending = null;
        throw e;
      });
    return pending;
  }
  window.EngineerWorkspace = {
    ready: ready,
    list: function () {
      return companies;
    },
    current: function () {
      return selected;
    },
    select: function (id, returnTo) {
      if (
        !companies.some(function (c) {
          return c.id === id;
        })
      )
        return;
      sessionStorage.setItem(storageKey(), id);
      location.href = returnTo === "profile.html" ? "profile.html" : "tasks.html";
    },
  };
  window.fetch = function (url, options) {
    var parsed;
    try {
      parsed = new URL(typeof url === "string" ? url : url.url, location.href);
    } catch {
      return nativeFetch(url, options);
    }
    var base = new URL(window.APP_API_BASE);
    var scoped =
      parsed.origin === base.origin &&
      /^\/(engineer\/(orders|designated-orders|grab-pool|grab|accept-designated|refuse-designated|status|location|stats)|operations\/(mobile|warehouses|requests|consume|journal)|parts(?:\/|$)|ai\/engineer\/chat)/.test(
        parsed.pathname,
      );
    if (!scoped || !token) return nativeFetch(url, options);
    // A concrete task determines its tenant in the backend, independent of the selected workspace.
    if (/^\/engineer\/orders\/[0-9a-f-]{36}(?:\/|$)/i.test(parsed.pathname)) return nativeFetch(url, options);
    return ready().then(function (company) {
      if (company.platform)
        throw Error(
          "当前为平台合作身份，请前往工作台使用平台工单；企业仓储仅适用于机构员工",
        );
      var explicit = parsed.searchParams.get("serviceId");
      if (explicit && explicit !== company.id)
        throw Error("当前操作不属于所选企业，请切换工作企业后重试");
      parsed.searchParams.set("serviceId", company.id);
      return nativeFetch(parsed.toString(), options);
    });
  };
})();
