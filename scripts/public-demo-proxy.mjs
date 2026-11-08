// Local, customer-only gateway for an explicitly started public demo tunnel.
import http from 'node:http';
import {createGzip,gzipSync} from 'node:zlib';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const configPath=new URL('../apps/customer-app-web/app-config.js',import.meta.url);
const API_PORT=8180,WEB_PORT=3101;
function allowedApi(path){
 if(/^\/(admin|platform)(\/|$)/.test(path)||/^\/market\/(platform|service-network)(\/|$)/.test(path))return false;
 if(/^\/iot\/(mobile-login|mobile-context|context|overview|devices|alarms|assets|members)(\/|\?|$)/.test(path))return true;
 return /^\/identity\/(login|business-login|send-code|upgrade|services|switch-role)(\/|\?|$)/.test(path)||/^\/auth\/(profile|register)(\/|\?|$)/.test(path)||/^\/(customer|market|payment|uploads|socket\.io)(\/|\?|$)/.test(path)||/^\/operations\/(contracts|finance|invoices)(\/|\?|$)/.test(path)||/^\/ai\/(chat|chats)(\/|\?|$)/.test(path);
}
export function createDemoProxy(){
 const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Permissions-Policy','camera=(self), microphone=()');
  if(url.pathname==='/login.html'&&['GET','HEAD'].includes(req.method)){
   const web=new URL('../apps/customer-app-web/',import.meta.url);
   let html=await readFile(new URL('login.html',web),'utf8');
   for(const file of ['app-config.js','organization-login.js']){
    const source=(file==='app-config.js'?"window.LASER_API_BASE=location.origin+'/api';window.LASER_WS_BASE=location.origin;\n":'')+await readFile(new URL(file,web),'utf8');
    html=html.replace('<script src="/'+file+'"></script>','<script>'+source.replaceAll('</script','<\\/script')+'</script>');
   }
   for(const file of ['auth-reference.css','login-screen.css'])html=html.replace('<link rel="stylesheet" href="/'+file+'">','<style>'+await readFile(new URL(file,web),'utf8')+'</style>');
   html=html.replace(/<link[^>]+href="\/fonts\/[^>]+>/g,'');
   html=html.replace('/brand/laser-service-mark.svg','data:image/svg+xml;base64,'+(await readFile(new URL('brand/laser-service-mark.svg',web))).toString('base64'));
   const zipped=/\bgzip\b/.test(req.headers['accept-encoding']||''),data=zipped?gzipSync(html):Buffer.from(html);
   res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Vary':'Accept-Encoding','Content-Length':data.length,...(zipped?{'Content-Encoding':'gzip'}:{})});return res.end(req.method==='HEAD'?undefined:data);
  }
  if(url.pathname==='/app-config.js'){
   if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);return res.end();}
   const source="window.LASER_API_BASE=location.origin+'/api';window.LASER_WS_BASE=location.origin;\n"+await readFile(configPath,'utf8');res.writeHead(200,{'Content-Type':'application/javascript; charset=utf-8','Cache-Control':'no-store'});return res.end(req.method==='HEAD'?undefined:source);
  }
  const api=url.pathname.startsWith('/api/'),socket=url.pathname.startsWith('/socket.io/');
  const target=api?url.pathname.slice(4):url.pathname;
  if(api&&!allowedApi(target)){res.writeHead(404);return res.end('Not found');}
  if(!api&&!socket&&(!['GET','HEAD'].includes(req.method)||/\/(?:备份|\.local-preview|\.git)(?:\/|$)/.test(decodeURIComponent(url.pathname)))){res.writeHead(404);return res.end('Not found');}
  const headers={...req.headers,host:'127.0.0.1:'+(api||socket?API_PORT:WEB_PORT)};
  delete headers['cf-access-jwt-assertion'];delete headers.cookie;
  const upstream=http.request({hostname:'127.0.0.1',port:api||socket?API_PORT:WEB_PORT,path:target+url.search,method:req.method,headers},response=>{
   const responseHeaders={...response.headers};delete responseHeaders['set-cookie'];
   const compress=!api&&!socket&&req.method!=='HEAD'&&response.statusCode===200&&!responseHeaders['content-encoding']&&/\.(js|css|html|svg)$/.test(target)&&/\bgzip\b/.test(req.headers['accept-encoding']||'');
   if(compress){responseHeaders['content-encoding']='gzip';responseHeaders.vary='Accept-Encoding';delete responseHeaders['content-length'];}
   res.writeHead(response.statusCode,responseHeaders);if(compress)response.pipe(createGzip()).pipe(res);else response.pipe(res);
  });
  upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502,{'Content-Type':'text/plain; charset=utf-8'});res.end('演示服务暂不可用，请联系演示者。');});req.on('aborted',()=>upstream.destroy());req.pipe(upstream);
 });
 server.on('upgrade',(req,socket,head)=>{
  if(!req.url.startsWith('/socket.io/'))return socket.destroy();
  const upstream=http.request({host:'127.0.0.1',port:API_PORT,path:req.url,headers:{...req.headers,host:'127.0.0.1:'+API_PORT}});
  upstream.on('upgrade',(response,remote,remoteHead)=>{socket.write('HTTP/1.1 101 Switching Protocols\r\n'+Object.entries(response.headers).map(([key,value])=>key+': '+value).join('\r\n')+'\r\n\r\n');if(head.length)remote.write(head);if(remoteHead.length)socket.write(remoteHead);remote.pipe(socket);socket.pipe(remote);remote.on('error',()=>socket.destroy());socket.on('error',()=>remote.destroy());socket.on('close',()=>remote.destroy());});upstream.on('error',()=>socket.destroy());upstream.end();
 });
 return server;
}
if(process.argv[1]===fileURLToPath(import.meta.url))createDemoProxy().listen(4201,'127.0.0.1',()=>console.log('Customer public-demo gateway: http://127.0.0.1:4201'));
