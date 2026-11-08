(function () {
  'use strict';
  var pages = [
    ['overview', '◫', '企业总览', 'index.html?view=overview'],
    ['tenants', '▦', '企业管理', 'index.html?view=tenants'],
    ['plans', '◇', '套餐与额度', 'index.html?view=plans'],
    ['logs', '☷', '操作日志', 'index.html?view=logs'],
    ['market', '▤', '服务市场与培训', 'platform-market.html'],
    ['network', '♧', '售后组织与委托', 'service-network.html'],
    ['iot', '◉', '设备监测与开通', 'iot.html']
  ];
  function append(nav, all, active) {
    pages.filter(function (p) { return all || ['market','network','iot'].includes(p[0]); }).forEach(function (p) {
      var button = document.createElement('button');
      button.type = 'button';
      button.innerHTML = '<span class="nav-icon" aria-hidden="true">' + p[1] + '</span>' + p[2];
      button.classList.toggle('active', p[0] === active);
      if (p[0] === active) button.setAttribute('aria-current', 'page');
      button.onclick = function () { location.href = p[3]; };
      nav.append(button);
    });
  }
  function mount() {
    var active = location.pathname.endsWith('iot.html')?'iot':location.pathname.endsWith('service-network.html') ? 'network' : 'market';
    var title = pages.find(function (p) { return p[0] === active; })[2];
    var oldHeader = document.querySelector('.market-console-header');
    var refresh = document.getElementById('reload');
    var sidebar = document.createElement('aside');
    sidebar.className = 'sidebar';
    sidebar.innerHTML = '<div class="brand"><div class="brand-mark">维</div><div><strong>维保云</strong><small>PLATFORM CONSOLE</small></div></div><div class="nav-caption">平台运营</div><nav class="nav" aria-label="平台导航"></nav><div class="sidebar-bottom"><span class="live-dot"></span>企业数据独立隔离<br>开通状态与三个业务端同步</div>';
    append(sidebar.querySelector('nav'), true, active);
    var shell = document.createElement('div');
    shell.className = 'shell platform-operations-shell';
    shell.innerHTML = '<header class="topbar"><div class="breadcrumb">平台控制台<strong></strong></div><div class="topbar-right"><div class="avatar">管</div><span id="platform-operator">平台管理员</span><button id="platform-signout">退出登录</button></div></header><div class="content"><div class="page-head"><div><h1></h1><p></p></div><div class="actions"></div></div></div>';
    shell.querySelector('.breadcrumb strong').textContent = title;
    shell.querySelector('h1').textContent = title;
    shell.querySelector('.page-head p').textContent = active === 'iot'?'全国设备监测、企业服务开通与告警处理。':active === 'network' ? '管理服务团队、合作关系与业务委托，明确每次服务的承接方。' : '统一管理协作订单、工程师审核、服务项目与培训考核。';
    refresh.className = 'btn';
    shell.querySelector('.actions').append(refresh);
    var content = shell.querySelector('.content');
    Array.from(document.body.children).forEach(function (el) {
      if (el !== oldHeader && el.tagName !== 'SCRIPT') content.append(el);
    });
    oldHeader.remove();
    document.body.prepend(sidebar, shell);
    document.getElementById('platform-signout').onclick = function () {
      sessionStorage.removeItem('platform_admin_token');
      location.href = 'index.html';
    };
    var token = sessionStorage.getItem('platform_admin_token');
    if (!token) { location.replace('index.html'); return; }
    var api = window.LASER_API_BASE || location.protocol + '//' + location.hostname + ':' + (location.port === '3103' ? '8180' : '8080');
    fetch(api + '/platform/auth/profile', {headers: {Authorization: 'Bearer ' + token}}).then(function (r) {
      if (r.status === 401) { sessionStorage.removeItem('platform_admin_token'); location.replace('index.html'); }
      return r.ok ? r.json() : null;
    }).then(function (user) { if (user && user.name) document.getElementById('platform-operator').textContent = user.name; }).catch(function () {});
  }
  window.PlatformNavigation = {append: append, mount: mount};
})();
