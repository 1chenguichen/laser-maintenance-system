(function(){
 'use strict';
 var token=localStorage.getItem('customer_token'),api=window.APP_API_BASE,result=document.getElementById('scan-result'),status=document.getElementById('scan-status'),current=null,stream=null,timer=null,decoderPromise=null,busy=false,requestId=0,cameraVersion=0;
 function login(){location.replace('login.html?next='+encodeURIComponent('device-scan.html'+location.search));}
 if(!token){login();return;}
 var esc=window.escapeHtml;
 function message(text,error){status.textContent=text;status.classList.toggle('error',!!error);}
 async function request(path,body){var response=await fetch(api+path,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});if(response.status===401){login();throw Error('请重新登录');}return window.readApiResponse(response);}
 function assetFrom(text){text=String(text||'').trim();var id=text;if(/^https?:\/\//i.test(text)){var url=new URL(text);id=url.searchParams.get('asset');var next=url.searchParams.get('next');if(!id&&next)id=new URL(next,location.origin).searchParams.get('asset');}if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id||''))throw Error('未识别到本平台的设备二维码，请扫描企业提供的设备标签');return id;}
 function stop(){cameraVersion++;document.body.classList.remove('scanning');document.getElementById('open-camera').disabled=false;clearTimeout(timer);timer=null;if(stream){stream.getTracks().forEach(t=>t.stop());stream=null;}document.getElementById('scan-video').srcObject=null;document.getElementById('camera-area').hidden=true;}
 async function identify(text){var version=++requestId;stop();current=null;result.hidden=true;message('正在识别设备与服务企业…');try{var asset=assetFrom(text),data=await request('/customer/device-label/'+asset);if(version!==requestId)return;current=data;history.replaceState(null,'','device-scan.html?asset='+encodeURIComponent(asset));var service=data.serviceMode==='SELF'?'企业自有售后团队':data.serviceMode==='OUTSOURCE'?(data.contractorName||'合作售后企业')+'承接':'维保云平台统一调度';result.innerHTML='<span class="scan-device-icon">设备档案</span><h2>'+esc(data.model)+'</h2><p>SN: '+esc(data.serialNumber)+'</p><dl><div><dt>设备所属企业</dt><dd>'+esc(data.companyName)+'</dd></div><div><dt>售后安排</dt><dd>'+esc(service)+'</dd></div><div><dt>保修到期</dt><dd>'+esc(data.warrantyExpire?new Date(data.warrantyExpire).toLocaleDateString('zh-CN'):'暂未登记')+'</dd></div></dl>'+(data.bound&&!data.ownedByMe?'<p class="scan-warning">此设备已绑定其他客户，无法重复绑定。如需变更使用人，请联系设备所属企业核实处理。</p>':data.ownedByMe?'<a class="scan-primary" href="repair-form.html?deviceId='+encodeURIComponent(data.deviceId)+'">报修这台设备</a><a class="scan-secondary" href="device-detail.html?id='+encodeURIComponent(data.deviceId)+'">查看设备档案</a>':'<p>请确认这是你持有的设备。绑定后可在“我的设备”中查看档案和发起报修。</p><button id="confirm-device" class="scan-primary">确认绑定设备</button>');result.hidden=false;message(data.ownedByMe?'这台设备已在你的设备列表中。':'设备识别成功');var button=document.getElementById('confirm-device');if(button)button.onclick=claim;result.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});}catch(e){message(e.message,true);}}
 async function claim(){if(busy||!current)return;busy=true;var button=document.getElementById('confirm-device');button.disabled=true;button.textContent='正在绑定…';try{await request('/customer/devices',{assetKey:current.assetKey});await identify(current.assetKey);message('绑定成功，已关联设备所属企业的售后服务。');}catch(e){message(e.message,true);if(button.isConnected){button.disabled=false;button.textContent='重新确认绑定';}}finally{busy=false;}}
 function decoder(){if(window.jsQR)return Promise.resolve(window.jsQR);if(!decoderPromise)decoderPromise=new Promise((resolve,reject)=>{var script=document.createElement('script');script.src='/vendor/jsQR-1.4.0.js';script.onload=()=>resolve(window.jsQR);script.onerror=()=>{decoderPromise=null;script.remove();reject(Error('扫码组件加载失败，请重试'));};document.head.append(script);});return decoderPromise;}
 function decode(source,width,height){var scale=Math.min(1,1600/Math.max(width,height)),canvas=document.createElement('canvas');canvas.width=Math.round(width*scale);canvas.height=Math.round(height*scale);var context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(source,0,0,canvas.width,canvas.height);var pixels=context.getImageData(0,0,canvas.width,canvas.height);var code=window.jsQR(pixels.data,pixels.width,pixels.height,{inversionAttempts:'attemptBoth'});return code&&code.data;}
 document.getElementById('read-link').onclick=()=>identify(document.getElementById('qr-text').value);
 document.getElementById('stop-camera').onclick=stop;
 document.getElementById('qr-photo').onchange=async function(){var file=this.files[0];this.value='';if(!file)return;if(file.size>20*1024*1024){message('图片过大，请选择小于 20 MB 的二维码照片',true);return;}stop();message('正在识别图片中的二维码…');var href=URL.createObjectURL(file);try{await decoder();var img=new Image();img.src=href;await img.decode();var text=decode(img,img.naturalWidth,img.naturalHeight);if(!text)throw Error('未找到清晰的二维码，请靠近标签重新拍照，保留二维码四周留白');await identify(text);}catch(e){message(e.message||'无法识别该图片，请选择 JPG 或 PNG 图片',true);}finally{URL.revokeObjectURL(href);}};
 document.getElementById('open-camera').onclick=async function(){
  stop();
  if(!window.isSecureContext){message('当前是 HTTP 演示地址，浏览器禁止实时扫码。请使用 HTTPS 客户端地址后再点“扫一扫”。',true);return;}
  if(!navigator.mediaDevices?.getUserMedia){message('当前浏览器不支持实时扫码，请在 Safari 或支持相机权限的浏览器中打开。',true);return;}
  var version=cameraVersion,button=this,video=document.getElementById('scan-video'),cameraStatus=document.getElementById('camera-status');
  button.disabled=true;document.getElementById('camera-area').hidden=false;document.body.classList.add('scanning');cameraStatus.textContent='请允许使用相机，正在准备扫一扫…';message('');
  try{
   var camera=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:960},height:{ideal:720}},audio:false});
   if(version!==cameraVersion){camera.getTracks().forEach(t=>t.stop());return;}
   stream=camera;video.srcObject=stream;await video.play();await decoder();if(version!==cameraVersion)return;
   cameraStatus.textContent='将设备二维码放入框内，即可自动识别';document.getElementById('stop-camera').focus();
   function tick(){if(!stream||version!==cameraVersion)return;try{if(video.readyState>=2){var text=decode(video,video.videoWidth,video.videoHeight);if(text){identify(text);return;}}}catch{}timer=setTimeout(tick,250);}tick();
  }catch(e){if(version!==cameraVersion)return;stop();message(e.name==='NotAllowedError'?'相机权限未开启，请在浏览器设置中允许相机后重试。':e.name==='NotFoundError'?'没有找到可用相机，请检查设备。':'相机暂时无法使用，请关闭其他占用相机的应用后重试。',true);}
 };
 document.addEventListener('keydown',function(e){if(e.key==='Escape'&&!document.getElementById('camera-area').hidden){stop();document.getElementById('open-camera').focus();}});

 window.addEventListener('pagehide',stop);document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();});
 var asset=new URLSearchParams(location.search).get('asset');if(asset)identify(asset);
})();
