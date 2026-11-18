(()=>{
 const file=location.pathname.split('/').pop();
 const configs={
 'services.html':['service','找到懂设备的服务','维修、保养与检测，按设备需求选择。','iot-network.webp'],
 'devices.html':['device','每台设备，都有自己的档案','设备资料与售后记录，随时查看。','device-passport.webp'],
 'market-orders.html':['orders','每一步服务，都有迹可循','查看进度，处理报价与服务确认。','service-orchestration.webp'],
 'orders.html':['orders','服务有进度，查看有依据','设备维修记录，集中管理。','service-orchestration.webp'],
 'profile.html':['profile','设备与服务，尽在掌握','从设备档案到服务记录，一处管理。','intelligent-core.webp'],
 'business.html':['records','服务保障，清楚可查','合同权益与开票记录，集中查看。',null],
 'device-detail.html':['passport','设备身份，清楚可查','核对序列号、设备照片与服务企业。','device-passport.webp'],
 'company.html':['network','连接专业服务资源','了解企业资料与服务范围。','iot-network.webp'],
 'repair-form.html':['repair','把问题交给专业的人','确认设备、描述故障，提交服务需求。','intelligent-core.webp']
 };
 // Task-first pages do not prepend promotional panels.
 if(file!=='services.html')return;
 const cfg=configs[file];if(!cfg)return;
 let observer;
 function mount(){const main=document.querySelector('main');if(!main||main.querySelector('.intelligence-panel'))return;
 const box=document.createElement('section');box.className='intelligence-panel intelligence-'+cfg[0];box.setAttribute('aria-label',cfg[1]);
 const copy=document.createElement('div');copy.className='intelligence-copy';const title=document.createElement('h2');title.textContent=cfg[1];const desc=document.createElement('p');desc.textContent=cfg[2];copy.append(title,desc);box.append(copy);
 if(cfg[3]){const art=document.createElement('div');art.className='intelligence-art';const img=document.createElement('img');img.src='/media/service-visuals/'+cfg[3];img.alt='智能设备服务概念配图，非实时监测结果';img.width=450;img.height=300;img.decoding='async';img.loading='lazy';img.addEventListener('error',()=>{art.hidden=true},{once:true});art.append(img);box.append(art);}
 else {const graphic=document.createElement('div');graphic.className='intelligence-emblem';graphic.setAttribute('aria-hidden','true');graphic.innerHTML='<svg viewBox="0 0 88 88"><rect x="16" y="10" width="56" height="68" rx="12"/><path d="M30 32h28M30 44h20M30 56h12"/><circle cx="63" cy="63" r="14"/><path d="m57 63 4 4 8-9"/></svg>';box.append(graphic)}
 const heading=main.querySelector(':scope > .market-heading');if(heading)heading.after(box);else main.prepend(box);
 function sync(){box.classList.toggle('visual-paused',document.hidden||box.dataset.visible==='false'||box.dataset.paused==='true')}
 if('IntersectionObserver'in window){observer?.disconnect();observer=new IntersectionObserver(entries=>{box.dataset.visible=String(entries[0].isIntersecting);sync()});observer.observe(box)}document.addEventListener('visibilitychange',sync);
 }
 document.addEventListener('mobile-screen-rendered',mount);if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',mount);else mount();
})();
