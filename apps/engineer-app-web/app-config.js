// Shared API configuration for both web apps. Override LASER_API_BASE before loading.
(function () {
  var port = ['3101', '3102', '4101', '4102'].includes(location.port) ? '8180' : '8080';
  window.APP_API_BASE = window.LASER_API_BASE || location.protocol + '//' + location.hostname + ':' + port;
  window.addEventListener('storage', function(event) { if(event.key === 'engineer_token') location.reload(); });
  var nativeFetch = window.fetch.bind(window);
  window.fetch = function (url, options) {
    options = options || {};
    if(String(url)===window.APP_API_BASE+'/auth/register' && options.body){var body=JSON.parse(options.body);if(body.role==='customer'){url=window.APP_API_BASE+'/identity/login';options=Object.assign({},options,{body:JSON.stringify({phone:body.phone,code:body.code,role:'customer',name:body.name})});}}
    return nativeFetch(url,options);
  };
  if(!window.LASER_DISABLE_SESSION_UPGRADE){
    try{var oldToken=localStorage.getItem('engineer_token');var oldIdentity=oldToken?JSON.parse(atob(oldToken.split('.')[1])):null;
      if(oldIdentity&&oldIdentity.purpose==='access'&&oldIdentity.role==='engineer'){
        nativeFetch(window.APP_API_BASE+'/identity/upgrade',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+oldToken},body:JSON.stringify({search:location.search,hash:location.hash})}).then(window.readApiResponse||async function(response){var data=await response.json();if(!response.ok)throw Error(data.message);return data;}).then(function(data){localStorage.setItem('engineer_token',data.accessToken);localStorage.setItem('engineer_user',JSON.stringify(data.user));localStorage.removeItem('laser_organization');localStorage.removeItem('laser_tenant_code');history.replaceState(null,'',location.pathname+(data.resume?.search||'')+(data.resume?.hash||''));location.reload();}).catch(function(){localStorage.removeItem('engineer_token');localStorage.removeItem('engineer_user');location.replace('login.html');});
      }
    }catch{}
  }
  window.escapeHtml = function (value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
    });
  };
  window.readApiResponse = async function (response) {
    var data = await response.json();
    if (!response.ok) throw new Error(Array.isArray(data.message) ? data.message.join('；') : (data.message || '请求失败 (' + response.status + ')'));
    return data;
  };
})();
