/* Use app history when safe, with a real href for direct visits/new tabs. */
(()=>{
 const link=document.querySelector('body>header .engineer-back');if(!link)return;
 const orderId=location.hash.slice(1)||new URLSearchParams(location.search).get('orderId');
 if(['quote.html','signature.html'].includes(location.pathname.split('/').pop())&&/^[a-f0-9-]{36}$/i.test(orderId||''))link.href='task-detail.html#'+orderId;
 link.addEventListener('click',event=>{
  if(event.defaultPrevented||event.button||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey||link.dataset.backDirect)return;
  let ref;try{ref=new URL(document.referrer)}catch{return}
  const current=new URL(location.href);
  if(history.length>1&&ref.origin===current.origin&&ref.href!==current.href&&!['login.html','register.html'].includes(ref.pathname.split('/').pop())){
   event.preventDefault();history.back();
  }
 });
})();
