(function () {
  var form = document.getElementById("business-login");
  form.onsubmit = async function (e) {
    e.preventDefault();
    var button = form.querySelector("button"),
      error = document.getElementById("business-error");
    button.disabled = true;
    button.textContent = "正在登录…";
    error.textContent = "";
    try {
      var r = await fetch(window.APP_API_BASE + "/identity/business-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: form.elements.username.value.trim(),
          password: form.elements.password.value,
        }),
      });
      var data = await window.readApiResponse(r);
      sessionStorage.setItem("iot_business_token", data.accessToken);
      sessionStorage.setItem("iot_business_user", JSON.stringify(data.user));
      location.replace(
        "index.html?workspace=" + encodeURIComponent(data.user.tenantId),
      );
    } catch (e) {
      error.textContent = e.message;
      button.disabled = false;
      button.textContent = "登录企业工作台";
    }
  };
})();
