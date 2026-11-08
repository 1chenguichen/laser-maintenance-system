(function () {
  const assets = "/media/service-visuals/";
  function photo(file, alt) {
    const figure = document.createElement("figure");
    const img = document.createElement("img");
    img.src = assets + file + ".webp";
    img.alt = alt + "，AI生成示意图";
    img.loading = "lazy";
    img.decoding = "async";
    const label = document.createElement("figcaption");
    label.textContent = "类型示意";
    figure.append(img, label);
    return figure;
  }
  function update() {
    const root = document.querySelector("main");
    if (!root) return;
    const identity = root.querySelector(".engineer-identity");
    if (
      document.body.dataset.page === "profile" &&
      !root.querySelector(".engineer-resource-grid")
    ) {
      const anchor =
        root.querySelector(".field-income-card") ||
        root.querySelector(".profile-maintenance-note");
      if (anchor) {
        const grid = document.createElement("div");
        grid.className = "engineer-resource-grid";
        [
          ["learning.html", "course-practice", "技能进阶", "培训与接单资质"],
          ["inventory.html", "part-kit", "我的移动仓", "配件与领退料记录"],
        ].forEach(([href, file, title, description]) => {
          const link = document.createElement("a");
          link.href = href;
          const image = photo(file, title);
          image.querySelector("figcaption").textContent = "AI 示意";
          const strong = document.createElement("strong");
          strong.textContent = title;
          const small = document.createElement("small");
          small.textContent = description;
          link.append(image, strong, small);
          grid.append(link);
        });
        anchor.after(grid);
      }
    }
    if (identity) {
      const notice = root.querySelector(".qualification-notice[href]");
      const tools = root.querySelector(".engineer-tools");
      if (notice && tools && !notice.dataset.refined) {
        notice.dataset.refined = "true";
        tools.after(notice);
      }
    }
    root.querySelectorAll(".market-order-card,.pool-task").forEach((card) => {
      if (card.dataset.engineerVisual) return;
      card.dataset.engineerVisual = "true";
      const heading = card.querySelector("h2,h3");
      const key = window.VisualMedia?.deviceKey({
        model: heading?.textContent || "",
      });
      if (!key || !heading) return;
      const wrap = document.createElement("div");
      wrap.className = "engineer-task-identity";
      const image = photo("device-" + key, heading.textContent);
      image.className = "engineer-equipment-thumb";
      heading.before(wrap);
      wrap.append(image, heading);
    });
  }
  document.addEventListener("DOMContentLoaded", function () {
    const logo = document.querySelector(
      'body[data-screen="workbench"] .market-top a:first-child .material-symbols-outlined',
    );
    if (logo) {
      const img = document.createElement("img");
      img.src = "/brand/laser-service-mark.svg";
      img.alt = "激光设备服务";
      img.className = "app-brand-logo";
      logo.replaceWith(img);
    }
    update();
    let pending = false;
    new MutationObserver(function () {
      if (pending) return;
      pending = true;
      requestAnimationFrame(function () {
        pending = false;
        update();
      });
    }).observe(document.querySelector("main") || document.body, {
      childList: true,
      subtree: true,
    });
  });
})();
