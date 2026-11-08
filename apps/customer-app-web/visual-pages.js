(function () {
  const assets = "/media/service-visuals/";
  function escape(v) {
    return String(v ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  }
  function demo(slot, file, alt) {
    return { slot, src: assets + file + ".webp", alt: alt + "，AI生成示意图" };
  }
  function partThumb(part) {
    const name = String(part.name || "") + " " + String(part.category || "");
    const file = /镜|lens|window/i.test(name)
      ? "part-lens"
      : /喷嘴|nozzle/i.test(name)
        ? "part-nozzle"
        : /套件|kit|耗材|备件/i.test(name)
          ? "part-kit"
          : null;
    return (
      '<span class="part-thumb" data-part-thumb="' +
      escape(part.id) +
      '">' +
      (file
        ? '<img src="' +
          assets +
          file +
          '.webp" alt="配件类别示意图，AI生成" loading="lazy"><small>示意</small>'
        : '<span class="material-symbols-outlined" aria-hidden="true">inventory_2</span>') +
      "</span>"
    );
  }
  async function renderPage(ui) {
    const { frame, e, icon } = ui,
      id = new URLSearchParams(location.search).get("id"),
      screen = document.body.dataset.screen;
    if (!id) throw Error("缺少资料编号，请从列表重新进入。");
    if (screen === "device-detail") {
      const data = await VisualGallery.call(
          "?kind=device&id=" + encodeURIComponent(id),
        ),
        d = data.record;
      frame(
        "设备档案",
        d.model,
        '<section class="market-card"><h2>' +
          e(d.model) +
          "</h2><dl><dt>设备 SN</dt><dd>" +
          e(d.serialNumber) +
          "</dd><dt>设备类型</dt><dd>" +
          e(d.deviceType) +
          "</dd><dt>服务企业</dt><dd>" +
          e(d.serviceName) +
          '</dd></dl><a class="market-primary" href="repair-form.html?deviceId=' +
          e(id) +
          '">为这台设备报修' +
          icon("arrow_forward") +
          '</a></section><section class="market-card"><div id="deviceVisuals"></div></section>',
      );
      const key = window.VisualMedia?.deviceKey(d);
      const galleryCard = document
        .getElementById("deviceVisuals")
        .closest("section");
      galleryCard.parentElement.insertBefore(
        galleryCard,
        galleryCard.previousElementSibling,
      );
      await VisualGallery.mount(document.getElementById("deviceVisuals"), {
        kind: "device",
        id,
        title: "设备照片与铭牌",
        defaults: [
          ...(key ? [demo("overview", "device-" + key, "设备类型")] : []),
          demo("component", "service-maintenance", "部件维护场景"),
        ],
      });
    }
    if (screen === "company") {
      const company = await VisualGallery.call("/company/" + id);
      frame(
        "服务企业",
        company.shortName || company.name,
        '<section class="market-card"><div class="company-brand-intro">' +
          (company.logo
            ? '<img src="' + e(company.logo) + '" alt="企业 Logo">'
            : "") +
          "<div><h2>" +
          e(company.name) +
          "</h2><small>设备售后服务企业</small></div></div><p>" +
          e(
            company.description ||
              "企业尚未填写服务介绍，可联系服务人员了解具体范围。",
          ) +
          '</p><div class="company-facts">' +
          [
            ["服务范围", company.serviceArea],
            ["服务时间", company.serviceHours],
            ["企业地址", company.address],
            ["联系电话", company.contactPhone],
          ]
            .filter((v) => v[1])
            .map(
              ([label, value]) =>
                "<p><strong>" + label + "</strong>" + e(value) + "</p>",
            )
            .join("") +
          '</div></section><section class="market-card"><div id="companyVisuals"></div></section>',
      );
      await VisualGallery.mount(document.getElementById("companyVisuals"), {
        kind: "company",
        id: company.id,
        title: "服务团队与维修环境",
        defaults: [
          demo("team", "service-installation", "团队协作场景"),
          demo("workshop", "hero", "设备车间场景"),
        ],
      });
    }
    if (screen === "engineer-info") {
      const person = await VisualGallery.call("/engineer/" + id),
        profile = person.profile;
      frame(
        "工程师资料",
        "查看服务身份与技能资料。",
        '<section class="market-card"><div class="engineer-public-card"><div id="publicEngineerAvatar" class="engineer-avatar photo-avatar">' +
          icon("engineering") +
          "</div><div><h2>" +
          e(person.name) +
          "</h2><small>" +
          e(profile?.state === "APPROVED" ? "平台审核通过" : "资料审核中") +
          "</small></div></div><p>" +
          e(profile?.introduction || "尚未填写服务介绍") +
          "</p><p>服务城市：" +
          e((profile?.cities || []).join("、") || "待完善") +
          '</p><div class="company-chips">' +
          person.employers
            .map(
              (c) =>
                '<a href="company.html?id=' +
                e(c.id) +
                '">' +
                (c.logo
                  ? '<img src="' + e(c.logo) + '" alt="所属企业 Logo">'
                  : "") +
                e(c.name) +
                "</a>",
            )
            .join("") +
          '</div></section><section class="market-card"><div id="engineerPublicVisuals"></div></section>',
      );
      await VisualGallery.thumbnail(
        document.getElementById("publicEngineerAvatar"),
        "engineer",
        id,
        "portrait",
      );
      await VisualGallery.mount(
        document.getElementById("engineerPublicVisuals"),
        {
          kind: "engineer",
          id,
          title: "头像与技能资料",
          defaults: [demo("skill", "course-practice", "技能实训场景")],
        },
      );
    }
  }
  function once(host, options) {
    if (host.dataset.visualMounted) return;
    host.dataset.visualMounted = "true";
    VisualGallery.mount(host, options);
  }
  function enhance() {
    if (!window.VisualGallery) return;
    const role = document.body.dataset.role,
      page = location.pathname.split("/").pop(),
      root = document.querySelector("main");
    if (!root) return;
    root.querySelectorAll("[data-course-visual]").forEach((host) => {
      const details = host.closest("details");
      if (!details.dataset.visualBound) {
        details.dataset.visualBound = "true";
        details.addEventListener("toggle", () => {
          if (details.open)
            once(host, {
              kind: "course",
              id: host.dataset.courseVisual,
              title: "培训地点与实训图片",
              defaults: [
                demo("venue", "training-room", "培训场地"),
                demo("practice", "course-practice", "实训场景"),
              ],
              slots: ["venue", "practice"],
            });
        });
      }
    });
    root.querySelectorAll("[data-course-thumb]").forEach((img) => {
      if (img.dataset.visualMounted) return;
      img.dataset.visualMounted = "true";
      VisualGallery.thumbnail(
        img,
        "course",
        img.dataset.courseThumb,
        "cover",
      ).then((data) => {
        if (data?.items.some((i) => i.slot === "cover"))
          img.nextElementSibling.textContent = "课程封面";
      });
    });
    const stage = root.querySelector("#stageVisuals");
    if (stage) {
      const id = new URLSearchParams(location.search).get("id");
      if (id)
        once(stage, { kind: "request", id, title: "服务照片 · 全程记录" });
    }
    if (["order-progress.html", "task-detail.html"].includes(page)) {
      let host = root.querySelector("#legacyVisuals");
      if (!host) {
        const section = document.createElement("section");
        section.className =
          "bg-white rounded-xl p-4 border border-outline-variant gallery-section";
        host = document.createElement("div");
        host.id = "legacyVisuals";
        section.append(host);
        root.append(section);
      }
      const id =
        location.hash.slice(1) ||
        new URLSearchParams(location.search).get("id");
      if (id)
        once(host, {
          kind: "legacy",
          id,
          title: "服务照片 · 报修 / 检测 / 完工",
        });
    }
    if (
      (page === "profile.html" && role === "engineer") ||
      page === "market-profile.html"
    ) {
      let user = {};
      try {
        user = JSON.parse(localStorage.getItem(role + "_user") || "{}");
      } catch {}
      if (user.id) {
        let host = root.querySelector("#ownEngineerVisuals");
        if (!host) {
          const section = document.createElement("section");
          section.className =
            "market-card bg-white rounded-xl p-4 border border-outline-variant gallery-section";
          host = document.createElement("div");
          host.id = "ownEngineerVisuals";
          section.append(host);
          root.append(section);
        }
        once(host, {
          kind: "engineer",
          id: user.id,
          title: "我的头像与技能图片",
          defaults: [demo("skill", "course-practice", "技能实训场景")],
        });
        const avatar = root.querySelector("[data-ui-avatar],.engineer-avatar");
        if (avatar && !avatar.dataset.visualPortrait) {
          avatar.dataset.visualPortrait = "true";
          avatar.classList.add("photo-avatar");
          VisualGallery.thumbnail(avatar, "engineer", user.id, "portrait");
        }
      }
    }
    root.querySelectorAll("[data-part-thumb]").forEach((host) => {
      if (host.dataset.visualMounted) return;
      host.dataset.visualMounted = "true";
      VisualGallery.thumbnail(host, "part", host.dataset.partThumb, "product");
    });
    root.querySelectorAll("[data-part-gallery]").forEach((host) => {
      const details = host.closest("details");
      if (!details.dataset.visualBound) {
        details.dataset.visualBound = "true";
        details.addEventListener("toggle", () => {
          if (details.open)
            once(host, {
              kind: "part",
              id: host.dataset.partGallery,
              title: "配件实物与型号资料",
            });
        });
      }
    });
  }
  window.VisualPages = { render: renderPage, partThumb };
  document.addEventListener("DOMContentLoaded", () => {
    enhance();
    const root = document.querySelector("main");
    if (root) {
      let scheduled = false;
      new MutationObserver(() => {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => {
          scheduled = false;
          enhance();
        });
      }).observe(root, { childList: true, subtree: true });
    }
  });
  document.addEventListener("mobile-screen-rendered", enhance);
  document.addEventListener("visual-gallery-updated", (ev) => {
    if (ev.detail.kind === "engineer") {
      document.querySelectorAll("[data-visual-portrait]").forEach((node) => {
        delete node.dataset.visualPortrait;
      });
      enhance();
    }
  });
})();
