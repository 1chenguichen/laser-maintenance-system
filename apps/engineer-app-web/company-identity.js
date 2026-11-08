(function () {
  document.addEventListener('DOMContentLoaded', async function () {
    var box = document.querySelector('[data-engineer-companies]');
    var token = localStorage.getItem('engineer_token');
    if (!box || !token) return;
    function message(text) { box.replaceChildren(); var p = document.createElement('p'); p.textContent = text; p.style.cssText = 'margin:0;font-size:14px;color:#4b5563'; box.append(p); }
    async function load() {
      message('正在核实所属企业…');
      try {
        var response = await fetch(window.APP_API_BASE + '/identity/services', { headers: { Authorization: 'Bearer ' + token } });
        var companies = await window.readApiResponse(response);
        if (!Array.isArray(companies)) throw Error('企业信息格式异常');
        box.replaceChildren();
        var label = document.createElement('div');
        label.textContent = companies.length > 1 ? '所属企业 · ' + companies.length + ' 家' : '所属企业';
        label.style.cssText = 'font-size:12px;color:#52665a;margin-bottom:6px';
        box.append(label);
        if (!companies.length) { message('暂无有效的企业工作身份，请联系企业管理员'); return; }
        companies.forEach(function (company) {
          var name = document.createElement('div'); name.textContent = company.name;
          name.style.cssText = 'font-size:15px;font-weight:600;line-height:1.6;color:#14532d;overflow-wrap:anywhere'; box.append(name);
        });
        if (companies.length > 1) { var note = document.createElement('p'); note.textContent = '当前汇总各企业的本人业务，具体工单按所属企业分别处理。'; note.style.cssText = 'margin:8px 0 0;font-size:12px;line-height:1.6;color:#52665a'; box.append(note); }
      } catch (error) {
        message('所属企业信息加载失败');
        var retry = document.createElement('button'); retry.type = 'button'; retry.textContent = '重新加载'; retry.style.cssText = 'margin-top:6px;color:#006d33;font-size:13px'; retry.addEventListener('click', load); box.append(retry);
      }
    }
    await load();
  });
})();
