(function () {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)");
  const fields = [
    "orderSearch",
    "orderSource",
    "orderOrigin",
    "poolSearch",
    "poolCategory",
    "courseSearch",
    "courseState",
    "stockSearch",
  ];
  let account = "anonymous";
  try {
    account =
      JSON.parse(localStorage.getItem("engineer_user") || "{}").id ||
      "anonymous";
  } catch {}
  const key =
    "engineer:view:v1:" +
    account +
    ":" +
    location.pathname +
    location.search +
    location.hash;
  let saved = null,
    restoring = false,
    ready = false,
    touched = false;
  try {
    saved = JSON.parse(sessionStorage.getItem(key));
    if (saved && Date.now() - saved.at > 4 * 60 * 60 * 1000) saved = null;
  } catch {}
  function save() {
    if (restoring || !ready) return;
    const values = {};
    fields.forEach((id) => {
      const el = document.getElementById(id);
      if (el) values[id] = el.value;
    });
    const state = {
      at: Date.now(),
      values,
      y: scrollY,
      orderState: document.querySelector(
        '[data-order-state][aria-pressed="true"]',
      )?.dataset.orderState,
      stockTab: document.querySelector(".wh-tabs .active")?.dataset.tab,
    };
    try {
      sessionStorage.setItem(key, JSON.stringify(state));
    } catch {}
  }
  let closing = new WeakSet();
  function closeDialog(dialog, value) {
    if (!dialog?.open || closing.has(dialog)) return;
    closing.add(dialog);
    const wasInert = dialog.inert;
    const finish = () => {
      dialog.classList.remove("field-dialog-closing");
      dialog.inert = wasInert;
      closing.delete(dialog);
      if (dialog.open) {
        if (value === undefined) dialog.close();
        else dialog.close(value);
      }
    };
    if (reduce.matches) {
      finish();
      return;
    }
    dialog.inert = true;
    dialog.classList.add("field-dialog-closing");
    setTimeout(finish, 120);
  }
  window.EngineerInteraction = { closeDialog };
  document.addEventListener(
    "cancel",
    (event) => {
      if (event.target.matches("dialog") && !event.defaultPrevented) {
        event.preventDefault();
        closeDialog(event.target);
      }
    },
    true,
  );
  document.addEventListener(
    "submit",
    (event) => {
      const form = event.target;
      if (form.matches('dialog form[method="dialog"]')) {
        event.preventDefault();
        closeDialog(form.closest("dialog"), event.submitter?.value || "");
      }
    },
    true,
  );
  document.addEventListener("DOMContentLoaded", () => {
    const main = document.querySelector("main");
    if (!main) return;
    const back =
      performance.getEntriesByType("navigation")[0]?.type === "back_forward";
    let navigation = "forward";
    try {
      navigation = sessionStorage.getItem("engineer:navigation") || navigation;
      sessionStorage.removeItem("engineer:navigation");
    } catch {}
    document.body.dataset.fieldArrival = back ? "back" : navigation;
    // Animate the stable page surface once, not each asynchronous card or photo.
    document.body.classList.add("field-interaction");
    const loaded = () => {
      if (document.getElementById("orderSearch"))
        return !!document.getElementById("orderCount")?.textContent;
      if (document.getElementById("stockSearch"))
        return !!document.getElementById("stockResult")?.textContent;
      if (document.getElementById("poolSearch"))
        return !!document.getElementById("poolCount")?.textContent;
      if (document.getElementById("courseSearch"))
        return !!document.getElementById("courseCount")?.textContent;
      return (
        !document.getElementById("market-root") ||
        !!document.querySelector(".market-heading")
      );
    };
    const observer = new MutationObserver(restore);
    let queued = false;
    function restore() {
      if (ready || queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        if (!loaded()) return;
        ready = true;
        observer.disconnect();
        if (!saved || touched) return;
        restoring = true;
        Object.entries(saved.values || {}).forEach(([id, value]) => {
          if (!fields.includes(id)) return;
          const el = document.getElementById(id);
          if (!el) return;
          el.value = value;
          el.dispatchEvent(
            new Event(el.tagName === "SELECT" ? "change" : "input", {
              bubbles: true,
            }),
          );
        });
        // Explicit metric links take precedence over the last list tab.
        if (
          !new URLSearchParams(location.search).has("state") &&
          saved.orderState
        ) {
          document
            .querySelector(
              '[data-order-state="' + CSS.escape(saved.orderState) + '"]',
            )
            ?.click();
        }
        if (saved.stockTab)
          document
            .querySelector('[data-tab="' + CSS.escape(saved.stockTab) + '"]')
            ?.click();
        restoring = false;
        if (back && saved.y) {
          const until = performance.now() + 2500;
          const scrollBack = () => {
            if (touched) return;
            scrollTo({
              top: Math.min(
                saved.y,
                document.documentElement.scrollHeight - innerHeight,
              ),
              behavior: "instant",
            });
            if (
              document.documentElement.scrollHeight - innerHeight < saved.y &&
              performance.now() < until
            )
              requestAnimationFrame(scrollBack);
          };
          requestAnimationFrame(scrollBack);
        }
      });
    }
    observer.observe(main, { childList: true, subtree: true });
    restore();
    ["input", "change", "click", "wheel", "touchstart", "keydown"].forEach(
      (type) =>
        document.addEventListener(
          type,
          (event) => {
            if (restoring) return;
            if (event.isTrusted) touched = true;
            if (type === "input" || type === "change" || type === "click")
              requestAnimationFrame(save);
          },
          { passive: true },
        ),
    );
    document.addEventListener("click", (event) => {
      const link = event.target.closest("a[href]");
      if (
        !link ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey ||
        event.button ||
        link.target ||
        link.hasAttribute("download")
      )
        return;
      const url = new URL(link.href, location.href);
      if (
        url.origin !== location.origin ||
        (url.protocol !== "http:" && url.protocol !== "https:")
      )
        return;
        if (link.closest('.mobile-navigation') && link.getAttribute('aria-current') === 'page' && url.pathname === location.pathname) {
          event.preventDefault();
          scrollTo({ top: 0, behavior: reduce.matches ? 'auto' : 'smooth' });
          return;
        }
      if (url.pathname === location.pathname && url.search === location.search)
        return;
      save();
      try {
        sessionStorage.setItem(
          "engineer:navigation",
          link.closest(".mobile-navigation") ? "tab" : "forward",
        );
      } catch {}
    });
  });
  addEventListener("pagehide", save);
  addEventListener("pageshow", (event) => {
    if (event.persisted) {
      document.body.dataset.fieldArrival = 'back';
      document.body.classList.remove("field-interaction");
      requestAnimationFrame(() =>
        document.body.classList.add("field-interaction"),
      );
    }
  });
})();
