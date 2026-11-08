(function(){
  window.createOrganizationLogin=function(role,options){
    options=options||{};var active=true,pending=false,api=window.APP_API_BASE;
    var host=document.getElementById('organizationContext');
    if(host)host.innerHTML='<p style="font-size:13px;color:#7e8c9d;line-height:1.8;margin:0 0 20px">'+(role==='customer'?'一个账号，统一查看你的设备与维修服务。':'使用企业已开通的手机号登录，系统自动关联工作身份。')+'</p><div id="organizationError" role="alert" style="color:#bf5248;font-size:13px;line-height:1.8;margin-bottom:12px"></div>';
    localStorage.removeItem('laser_organization');localStorage.removeItem('laser_tenant_code');
    async function request(path,body){var r=await fetch(api+'/identity/'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});var data=await r.json();if(!r.ok)throw new Error(Array.isArray(data.message)?data.message.join('；'):data.message||'登录失败');return data;}
    async function login(phone,code){if(pending)return;pending=true;var button=document.getElementById('loginBtn'),error=document.getElementById('organizationError');if(button){button.disabled=true;button.textContent='登录中…';}if(error)error.textContent='';try{var result=await request('login',{phone:phone,code:code,role:role});if(!active)return;localStorage.setItem(role+'_token',result.accessToken);localStorage.setItem(role+'_user',JSON.stringify(result.user));if(options.onSuccess)options.onSuccess(result);else{var next=new URLSearchParams(location.search).get('next');location.href=role==='customer'&&next&&/^(devices|orders|repair-form)\.html(?:[?#]|$)/.test(next)?next:role==='customer'?'index.html':'grab.html';}return result;}catch(e){if(error)error.textContent=e.message;}finally{pending=false;if(button&&button.isConnected){button.disabled=false;button.textContent='登录';}}}
    if(role==='customer'){
      var resume=new URLSearchParams(location.search).get('next'),existing=localStorage.getItem('customer_token');
      if(resume&&/^(devices|orders|repair-form)\.html(?:[?#]|$)/.test(resume)&&existing){
        try{var claims=JSON.parse(atob(existing.split('.')[1]));if(claims.purpose==='unified_access'&&claims.role==='customer')fetch(api+'/auth/profile',{headers:{Authorization:'Bearer '+existing}}).then(function(response){if(!response.ok)throw Error('Expired');return response.json();}).then(function(){if(active&&!pending)location.replace(resume);}).catch(function(){});}catch{}
      }
    }
    return {login:login,sendCode:function(phone){return request('send-code',{phone:phone});},ready:function(){return Promise.resolve();},destroy:function(){active=false;}};
  };
})();
