(function () {
  const labels = {
    overview: "设备全貌",
    nameplate: "设备铭牌",
    component: "关键部件",
    REPORTED: "报修时",
    DIAGNOSIS: "检测中",
    AFTER: "完工后",
    portrait: "本人头像",
    skill: "技能与服务资料",
    team: "服务团队",
    workshop: "维修车间",
    product: "配件实物",
    packaging: "包装",
    label: "型号标签",
    cover: "课程封面",
    venue: "培训地点",
    practice: "实训现场",
  };
  const urls = new Map();
  window.addEventListener("pagehide", () => {
    urls.forEach((url) => URL.revokeObjectURL(url));
    urls.clear();
  });
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
  function config(options = {}) {
    return {
      base:
        options.apiBase ||
        window.APP_API_BASE ||
        window.LASER_API_BASE ||
        location.protocol + "//" + location.hostname + ":8180",
      token:
        typeof options.token === "function"
          ? options.token()
          : options.token ||
            sessionStorage.getItem("cs_admin_token") ||
            sessionStorage.getItem("platform_admin_token") ||
            localStorage.getItem(
              (document.body.dataset.role ||
                (/3102/.test(location.port) ? "engineer" : "customer")) +
                "_token",
            ),
    };
  }
  async function call(path, options = {}, settings = {}) {
    const c = config(settings),
      response = await fetch(c.base + "/market/visual" + path, {
        ...options,
        headers: { Authorization: "Bearer " + c.token, ...options.headers },
      });
    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw Error(
        Array.isArray(error.message)
          ? error.message.join("；")
          : error.message || "图片暂时无法读取",
      );
    }
    return response.json();
  }
  async function imageUrl(id, settings, source) {
    const key = (source || "visual") + id;
    if (urls.has(key)) return urls.get(key);
    const c = config(settings),
      response = await fetch(
        c.base +
          (source === "attachment"
            ? "/market/attachments/" + id
            : "/market/visual/" + id + "/content"),
        { headers: { Authorization: "Bearer " + c.token } },
      );
    if (!response.ok) throw Error("图片读取失败");
    const url = URL.createObjectURL(await response.blob());
    urls.set(key, url);
    return url;
  }
  function lightbox(url, title) {
    const dialog = document.createElement("dialog");
    dialog.className = "vg-lightbox";
    const image = document.createElement("img"),
      close = document.createElement("button"),
      heading = document.createElement("p");
    image.src = url;
    image.alt = title;
    heading.textContent = title;
    close.type = "button";
    close.textContent = "关闭";
    close.onclick = () => window.EngineerInteraction.closeDialog(dialog);
    dialog.append(image, heading, close);
    dialog.addEventListener("close", () => dialog.remove(), { once: true });
    document.body.append(dialog);
    dialog.showModal();
  }
  async function mount(host, options) {
    if (!host) return;
    host.classList.add("visual-gallery");
    host.dataset.kind = options.kind;
    host.setAttribute("aria-label", options.title || "图片资料");
    async function render() {
      host.innerHTML = '<p class="vg-note">正在读取图片资料…</p>';
      try {
        const data = await call(
            "?kind=" +
              encodeURIComponent(options.kind) +
              "&id=" +
              encodeURIComponent(options.id),
            {},
            options,
          ),
          slots = options.slots || data.slots,
          defaults = options.defaults || [];
        host.innerHTML =
          (options.title
            ? '<h3 class="vg-title">' + escape(options.title) + "</h3>"
            : "") +
          '<div class="vg-groups"></div><div class="vg-feedback" role="status" hidden></div>';
        const feedback = host.querySelector(".vg-feedback");
        for (const slot of slots) {
          const group = document.createElement("section");
          group.className = "vg-group";
          group.dataset.slot = slot;
          const title = labels[slot] || slot,
            items = data.items.filter((item) => item.slot === slot),
            fallback = defaults.find((d) => d.slot === slot);
          group.innerHTML =
            '<div class="vg-group-head"><strong>' +
            escape(title) +
            "</strong>" +
            (data.canUpload &&
            !options.readOnly &&
            (data.uploadSlots || data.slots).includes(slot)
              ? '<label class="vg-upload">上传实拍<input type="file" accept="image/jpeg,image/png,image/webp" aria-label="上传' +
                escape(title) +
                '"></label>'
              : "") +
            '</div><div class="vg-grid"></div>';
          host.querySelector(".vg-groups").append(group);
          const grid = group.querySelector(".vg-grid");
          if (options.kind === "request" && slot === "REPORTED")
            grid.id = "faultPhotos";
          if (!items.length) {
            if (fallback) {
              const button = document.createElement("button");
              button.type = "button";
              button.className = "vg-demo";
              button.innerHTML =
                '<img src="' +
                escape(fallback.src) +
                '" alt="' +
                escape(fallback.alt || title + "示意图，AI生成") +
                '" loading="lazy" decoding="async"><small>AI 示意 · ' +
                escape(title) +
                "</small>";
              button.onclick = () =>
                lightbox(fallback.src, title + "（AI 示意）");
              grid.append(button);
            } else {
              const empty = document.createElement("div");
              empty.className = "vg-empty";
              empty.innerHTML =
                '<span class="material-symbols-outlined" aria-hidden="true">' +
                (slot === "portrait" ? "person" : "add_photo_alternate") +
                "</span><span>尚未上传" +
                escape(title) +
                "</span>";
              grid.append(empty);
            }
          }
          for (const item of items) {
            const cell = document.createElement("div");
            cell.className = "vg-item";
            grid.append(cell);
            try {
              const url = await imageUrl(item.id, options, item.source);
              const button = document.createElement("button");
              button.type = "button";
              button.innerHTML =
                '<img alt="' +
                escape(title) +
                '实拍照片" loading="lazy"><small>已上传 · ' +
                new Date(item.created_at).toLocaleDateString("zh-CN") +
                "</small>";
              button.querySelector("img").src = url;
              button.onclick = () => lightbox(url, title);
              cell.append(button);
              if (item.canDelete && !options.readOnly) {
                const remove = document.createElement("button");
                remove.type = "button";
                remove.className = "vg-remove";
                remove.textContent = "移除";
                remove.setAttribute("aria-label", "移除" + title + "照片");
                remove.onclick = async () => {
                  remove.disabled = true;
                  try {
                    await call("/" + item.id, { method: "DELETE" }, options);
                    await render();
                    document.dispatchEvent(
                      new CustomEvent("visual-gallery-updated", {
                        detail: { kind: options.kind, id: options.id },
                      }),
                    );
                  } catch (e) {
                    feedback.hidden = false;
                    feedback.textContent = e.message;
                    remove.disabled = false;
                  }
                };
                cell.append(remove);
              }
            } catch (e) {
              cell.textContent = e.message;
            }
          }
          const input = group.querySelector("input");
          if (input)
            input.onchange = async () => {
              const file = input.files[0];
              if (!file) return;
              if (file.size > 5 * 1024 * 1024) {
                feedback.hidden = false;
                feedback.textContent = "图片不能超过 5 MB";
                input.value = "";
                return;
              }
              input.disabled = true;
              feedback.hidden = false;
              feedback.textContent = "正在保存图片…";
              try {
                const body = new FormData();
                body.append("kind", options.kind);
                body.append("id", options.id);
                body.append("slot", slot);
                body.append("photo", file);
                await call("", { method: "POST", body }, options);
                await render();
                document.dispatchEvent(
                  new CustomEvent("visual-gallery-updated", {
                    detail: { kind: options.kind, id: options.id },
                  }),
                );
              } catch (e) {
                feedback.hidden = false;
                feedback.textContent = e.message;
                input.disabled = false;
                input.value = "";
              }
            };
        }
        host.dataset.loaded = "true";
        return data;
      } catch (error) {
        host.innerHTML =
          '<p class="vg-note">' +
          escape(error.message) +
          '</p><button class="vg-retry" type="button">重新读取</button>';
        host.querySelector("button").onclick = render;
      }
    }
    return render();
  }
  async function thumbnail(host, kind, id, slot, options = {}) {
    try {
      const data = await call(
          "?kind=" + kind + "&id=" + encodeURIComponent(id),
          {},
          options,
        ),
        item = data.items.filter((i) => i.slot === slot).pop();
      if (item) {
        const img = document.createElement("img");
        img.src = await imageUrl(item.id, options);
        img.alt = labels[slot] + "实拍照片";
        img.className = "vg-thumbnail";
        if (host.tagName === "IMG") {
          host.src = img.src;
          host.alt = img.alt;
        } else {
          host.replaceChildren(img);
        }
      }
      return data;
    } catch {
      return null;
    }
  }
  window.VisualGallery = { mount, thumbnail, call, imageUrl, lightbox };
})();
