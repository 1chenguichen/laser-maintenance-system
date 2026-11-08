(function () {
  var descriptions = {
    cutting: "激光切割机",
    welding: "激光焊接机",
    marking: "激光打标机",
  };
  function deviceKey(device) {
    var type = String(device.deviceType || device.type || ""),
      model = String(device.model || "");
    if (/焊|weld/i.test(type)) return "welding";
    if (/打标|mark/i.test(type)) return "marking";
    if (/切割|cut/i.test(type)) return "cutting";
    if (/焊|weld|^LW[-\s]?\d/i.test(model)) return "welding";
    if (/打标|mark|^LM[-\s]?\d/i.test(model)) return "marking";
    if (/切割|cut|^LC[-\s]?\d/i.test(model)) return "cutting";
    return null;
  }
  function figure(src, alt, kind, caption) {
    return (
      '<figure class="visual-media ' +
      (kind || "") +
      '"><img src="/media/service-visuals/' +
      src +
      '.webp" alt="' +
      alt +
      '" width="800" height="450" loading="lazy" decoding="async"><figcaption>' +
      caption +
      '</figcaption><span class="visual-fallback" aria-hidden="true">图片暂不可用</span></figure>'
    );
  }
  window.VisualMedia = {
    deviceKey: deviceKey,
    device: function (device, compact) {
      var key = deviceKey(device);
      return key
        ? figure(
            "device-" + key,
            descriptions[key] + "类型示意图，AI生成",
            compact ? "device-thumbnail" : "device-cover",
            "类型示意",
          )
        : "";
    },
    service: function (category) {
      if (category === "marking")
        return figure(
          "device-marking",
          "激光打标设备类型示意图，AI生成",
          "service-cover",
          "设备示意",
        );
      var scene =
        {
          cutting: "repair",
          welding: "welding",
          maintenance: "maintenance",
          installation: "installation",
          inspection: "inspection",
        }[category] || "repair";
      return figure(
        "service-" + scene,
        "设备" +
          {
            repair: "维修",
            welding: "焊接诊断",
            maintenance: "保养",
            installation: "安装",
            inspection: "检测",
          }[scene] +
          "场景示意图，AI生成",
        "service-cover",
        "场景示意",
      );
    },
  };
  document.addEventListener(
    "error",
    function (ev) {
      var img = ev.target;
      if (
        img instanceof HTMLImageElement &&
        img.closest(".visual-media,.home-visual")
      ) {
        img.hidden = true;
        img.parentElement.classList.add("media-unavailable");
      }
    },
    true,
  );
})();
