(function () {
  function start() {
    var token = localStorage.getItem("engineer_token");
    if (!token || !window.EngineerWorkspace) return;
    document
      .querySelectorAll("[data-engineer-companies]")
      .forEach(function (el) {
        el.hidden = true;
      });
    var main = document.querySelector("main");
    if (!main) return;
    var box = document.createElement("section");
    box.className = "engineer-workspace";
    box.setAttribute("aria-label", "当前企业工作身份");
    main.prepend(box);
    function load() {
      box.textContent = "正在确认企业工作身份…";
      window.EngineerWorkspace.ready()
        .then(function (company) {
          if(box.dataset.boundTask)return;
          box.replaceChildren();
          var heading = document.createElement("div");
          heading.className = "workspace-brand";
          var image = company.logoDataUrl
            ? document.createElement("img")
            : document.createElement("span");
          if (company.logoDataUrl) {
            image.src = company.logoDataUrl;
            image.alt = "企业Logo";
          } else image.textContent = company.name.slice(0, 1);
          var text = document.createElement("div");
          var caption = document.createElement("small");
          caption.textContent = company.platform
            ? "当前服务身份"
            : "当前工作企业";
          var name = document.createElement("strong");
          name.textContent = company.name;
          text.append(caption, name);
          heading.append(image, text);
          box.append(heading);
          var user = {};
          try {
            user = JSON.parse(localStorage.getItem("engineer_user") || "{}");
          } catch {}
          var note = document.createElement("p");
          note.textContent =
            (user.name || "工程师") +
            (company.platform
              ? " · 平台合作身份 · 前往工作台处理平台服务工单"
              : " · 工程师身份 · 工单与移动仓仅显示本企业数据");
          box.append(note);
          var list = window.EngineerWorkspace.list();
          if (list.length > 1 && document.body.dataset.page === "profile") {
            var switcher = document.createElement("button");
            switcher.type = "button";
            switcher.className = "workspace-switch";
            switcher.textContent = "切换企业";
            switcher.setAttribute("aria-haspopup", "dialog");
            switcher.onclick = function () {
              var dialog = document.createElement("dialog");
              dialog.className = "workspace-picker";
              dialog.setAttribute("aria-labelledby", "workspacePickerTitle");
              var top = document.createElement("div");
              top.className = "workspace-picker-top";
              var title = document.createElement("h2");
              title.id = "workspacePickerTitle";
              title.textContent = "切换工作企业";
              var close = document.createElement("button");
              close.type = "button";
              close.textContent = "×";
              close.setAttribute("aria-label", "关闭企业选择");
              close.onclick = function () {
                window.EngineerInteraction.closeDialog(dialog);
              };
              top.append(title, close);
              var hint = document.createElement("p");
              hint.textContent = "切换后，企业工单与移动仓显示所选企业的数据。";
              dialog.append(top, hint);
              list.forEach(function (c) {
                var item = document.createElement("button");
                item.type = "button";
                item.className = "workspace-choice";
                item.dataset.companyId = c.id;
                var companyName = document.createElement("span");
                companyName.textContent = c.name;
                var status = document.createElement("small");
                status.textContent = c.id === company.id ? "当前企业" : "进入";
                item.setAttribute(
                  "aria-label",
                  c.name + (c.id === company.id ? "，当前企业" : ""),
                );
                item.append(companyName, status);
                item.onclick = function () {
                  if (c.id === company.id) {
                    window.EngineerInteraction.closeDialog(dialog);
                    return;
                  }
                  window.EngineerWorkspace.select(c.id, "profile.html");
                };
                dialog.append(item);
              });
              dialog.addEventListener(
                "close",
                function () {
                  dialog.remove();
                  switcher.focus();
                },
                { once: true },
              );
              document.body.append(dialog);
              dialog.showModal();
            };
            heading.append(switcher);
          } else if (list.length > 1) {
            var label = document.createElement("label");
            label.textContent = "切换工作企业";
            var select = document.createElement("select");
            select.setAttribute("aria-label", "切换工作企业");
            list.forEach(function (c) {
              var option = document.createElement("option");
              option.value = c.id;
              option.textContent = c.name;
              select.append(option);
            });
            select.value = company.id;
            select.onchange = function () {
              window.EngineerWorkspace.select(select.value);
            };
            label.append(select);
            box.append(label);
          }
        })
        .catch(function (e) {
          box.textContent = e.message;
          var retry = document.createElement("button");
          retry.textContent = "重新加载";
          retry.onclick = load;
          box.append(retry);
        });
    }
    load();
    if (typeof window.renderDetail === "function") {
      var render = window.renderDetail;
      window.renderDetail = function (order) {
        render(order);
        if(order.serviceName){
          box.dataset.boundTask='true';box.replaceChildren();
          var caption=document.createElement('small');caption.textContent='本单履约企业 · 企业自有团队';
          var owner=document.createElement('strong');owner.textContent=order.serviceName;owner.style.display='block';
          box.append(caption,owner);
        }
        var next = document.getElementById("flowNext"),
          actions = document.getElementById("actionButtons");
        if (next && actions) {
          var jump = document.getElementById("workspace-next-action");
          if (jump) jump.remove();
          var action = actions.querySelector('button[onclick="confirmOrder()"],button[onclick="submitQuote()"],button[onclick="completeRepair()"]');
          if (action) {
            action.querySelectorAll('.material-symbols-outlined').forEach(function(icon){icon.remove();});
            action.id='workspace-next-action';
            action.className='workspace-primary';
            action.textContent=action.textContent.trim();
            next.parentElement.append(action);
          }
        }
      };
    }
  }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", start);
  else start();
})();
