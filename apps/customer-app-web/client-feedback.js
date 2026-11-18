/* Consistent feedback without native alert/confirm; all content is text. */
(() => {
  function box() {
    let el = document.getElementById("clientFeedback");
    if (!el) {
      el = document.createElement("section");
      el.id = "clientFeedback";
      el.className = "client-feedback";
      el.tabIndex = -1;
      el.hidden = true;
      (document.querySelector("main") || document.body).prepend(el);
    }
    return el;
  }
  function show(message, state = "error", retry) {
    const el = box();
    el.hidden = false;
    el.dataset.state = state;
    el.setAttribute("role", state === "error" ? "alert" : "status");
    el.replaceChildren();
    const p = document.createElement("p");
    p.textContent = String(message);
    el.append(p);
    if (retry) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "重新加载";
      button.onclick = () => {
        button.disabled = true;
        Promise.resolve()
          .then(retry)
          .catch((e) => show(e.message, "error", retry));
      };
      el.append(button);
    }
    return el;
  }
  function confirm(message) {
    return new Promise((resolve) => {
      const prior = document.activeElement,
        dialog = document.createElement("dialog");
      dialog.className = "client-confirm";
      dialog.setAttribute("aria-labelledby", "clientConfirmTitle");
      const h = document.createElement("h2");
      h.id = "clientConfirmTitle";
      h.textContent = "请确认操作";
      const p = document.createElement("p");
      p.textContent = String(message);
      const actions = document.createElement("div");
      actions.className = "client-confirm-actions";
      for (const [value, text, cls] of [
        ["cancel", "取消", "client-secondary"],
        ["confirm", "确认", "client-primary"],
      ]) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = text;
        button.className = cls;
        button.onclick = () => dialog.close(value);
        actions.append(button);
      }
      dialog.append(h, p, actions);
      document.body.append(dialog);
      dialog.addEventListener(
        "close",
        () => {
          const accepted = dialog.returnValue === "confirm";
          dialog.remove();
          if (prior?.isConnected) prior.focus();
          resolve(accepted);
        },
        { once: true },
      );
      dialog.showModal();
      actions.firstChild.focus();
    });
  }
  window.ClientFeedback = {
    show,
    notice: (message) => {
      const el = show(message);
      el.scrollIntoView({ block: "nearest" });
      el.focus();
    },
    clear: () => {
      const el = document.getElementById("clientFeedback");
      if (el) el.hidden = true;
    },
    confirm,
  };
})();
