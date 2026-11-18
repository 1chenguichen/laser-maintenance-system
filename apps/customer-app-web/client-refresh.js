(()=>{
 document.body.classList.add('client-refresh');
 document.body.dataset.clientPage=location.pathname.split('/').pop().replace('.html','');
 let cleanup=()=>{};
 function mount(){const box=document.querySelector('.client-banner');if(!box||box.dataset.ready)return;cleanup();box.dataset.ready='true';
 const slides=[['intelligent-device.webp','智能设备服务'],['iot-network.webp','设备互联'],['device-passport.webp','数字设备档案']];
 const track=box.querySelector('.banner-track'),controls=box.querySelector('.banner-controls');let index=Number(box.dataset.slideIndex||0),timer=null,paused=box.dataset.paused==='true',visible=true;const reduce=matchMedia('(prefers-reduced-motion: reduce)');
 track.replaceChildren();controls.replaceChildren();
 const dots=[];slides.forEach(([file,label],i)=>{const img=document.createElement('img');img.src='/media/service-visuals/'+file;img.alt=label+'概念配图';img.width=960;img.height=640;img.draggable=false;track.append(img);const dot=document.createElement('button');dot.type='button';dot.setAttribute('aria-label','切换至'+label);dot.onclick=()=>{show(i);schedule()};controls.append(dot);dots.push(dot)});
 const toggle=document.createElement('button');toggle.type='button';toggle.className='banner-toggle';controls.append(toggle);
 function show(i){index=(i+slides.length)%slides.length;box.dataset.slideIndex=String(index);track.style.transform='translateX(-'+index*100+'%)';dots.forEach((d,j)=>{d.setAttribute('aria-pressed',String(j===index))});box.setAttribute('aria-label','智能设备服务，第'+(index+1)+'张，共3张')}
 function schedule(){clearInterval(timer);timer=null;toggle.textContent=paused||reduce.matches?'播放':'暂停';toggle.setAttribute('aria-label',paused||reduce.matches?'播放轮播':'暂停轮播');if(!paused&&!reduce.matches&&visible&&!document.hidden)timer=setInterval(()=>show(index+1),4500)}
 toggle.onclick=()=>{if(reduce.matches){show(index+1);return}paused=!paused;box.dataset.paused=String(paused);schedule()};let x=null;
 const touchStart=e=>{x=e.touches[0].clientX};
 const touchEnd=e=>{if(x!==null){const dx=e.changedTouches[0].clientX-x;if(Math.abs(dx)>40){show(index+(dx<0?1:-1));schedule()}x=null}};
 box.addEventListener('touchstart',touchStart,{passive:true});box.addEventListener('touchend',touchEnd,{passive:true});
 const change=()=>schedule();document.addEventListener('visibilitychange',change);reduce.addEventListener('change',change);const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;schedule()});observer.observe(box);show(index);schedule();cleanup=()=>{clearInterval(timer);observer.disconnect();box.removeEventListener('touchstart',touchStart);box.removeEventListener('touchend',touchEnd);document.removeEventListener('visibilitychange',change);reduce.removeEventListener('change',change)};
 }
 document.addEventListener('mobile-screen-rendered',mount);mount();addEventListener('pagehide',()=>cleanup());addEventListener('pageshow',()=>{const box=document.querySelector('.client-banner');if(box)delete box.dataset.ready;mount()});
})();
