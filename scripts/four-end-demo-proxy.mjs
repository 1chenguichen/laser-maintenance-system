// Four opt-in public demo gateways. Never expose database or development servers.
import http from 'node:http';
import path from 'node:path';
import {readFile,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {gzipSync} from 'node:zlib';
const project=fileURLToPath(new URL('../',import.meta.url));
const targets=[['admin',45100,'apps/cs-admin/build'],['customer',45101,'apps/customer-app-web'],['engineer',45102,'apps/engineer-app-web'],['platform',45103,'apps/platform-admin-web']];
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.ico':'image/x-icon','.woff2':'font/woff2','.woff':'font/woff','.ttf':'font/ttf','.webm':'video/webm','.mp4':'video/mp4','.pdf':'application/pdf'};
const bootstrap='<script>window.LASER_API_BASE=location.origin;window.LASER_WS_BASE=location.origin;</script>';
const cache=new Map();
function isApi(p){if(p.startsWith('/iot/assets/'))return false;return /^\/(auth|identity|admin|customer|engineer|market|operations|payment|payments|uploads|ai|socket\.io)(\/|$)/.test(p)||/^\/platform\//.test(p)||/^\/iot\/(mobile-login|mobile-context|context|overview|analytics|devices|alarms|assets|members|tenants|subscriptions|companies|credentials|ingest)(\/|$)/.test(p);}
function allowed(role,p){if(role==='platform')return true;if(/^\/platform\//.test(p)||/^\/market\/(platform|service-network)(\/|$)/.test(p)||p==='/iot/subscriptions'||p==='/iot/tenants'||p==='/iot/companies')return false;if(role!=='admin'&&/^\/admin(\/|$)/.test(p))return false;return true;}
function forward(req,res){const headers={...req.headers,host:'127.0.0.1:8180'};delete headers['x-forwarded-for'];delete headers['x-forwarded-host'];delete headers['x-forwarded-proto'];const upstream=http.request({host:'127.0.0.1',port:8180,path:req.url,method:req.method,headers},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res);});upstream.setTimeout(60000,()=>upstream.destroy());upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502,{'Content-Type':'text/plain; charset=utf-8'});res.end('演示后端暂不可用');});req.on('aborted',()=>upstream.destroy());req.pipe(upstream);}
for(const [role,port,dir] of targets){
 const base=path.join(project,dir);
 const server=http.createServer(async(req,res)=>{try{
  const url=new URL(req.url,'http://localhost'),p=decodeURIComponent(url.pathname);
  res.setHeader('X-Demo-End',role);res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Permissions-Policy','camera=(self), microphone=()');res.setHeader('X-Robots-Tag','noindex, nofollow');
  if(isApi(p)){if(!allowed(role,p)){res.writeHead(403);return res.end('Not available at this entry');}return forward(req,res);}
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);return res.end();}
  if(p.split('/').some(s=>s.startsWith('.')||/备份|backup/i.test(s))||p.endsWith('.map')||p.endsWith('customer-demo.json')){res.writeHead(404);return res.end();}
  let relative=p==='/'?(role==='admin'||role==='platform'?'index.html':'login.html'):p.slice(1);
  if(role==='admin'&&!path.extname(relative))relative='index.html';
  const file=path.resolve(base,relative);if(!file.startsWith(base+path.sep)||!mime[path.extname(file)]){res.writeHead(404);return res.end();}
  const info=await stat(file),tag='W/"'+info.size+'-'+info.mtimeMs+'"',ext=path.extname(file);
  let record=cache.get(file);if(ext==='.html'||!record||record.tag!==tag){let data=await readFile(file);if(ext==='.html'){
 let html=data.toString('utf8').replace(/<head([^>]*)>/i,'<head$1>'+bootstrap);
 for(const match of [...html.matchAll(/<link\b[^>]*rel=["']stylesheet["'][^>]*>/gi)]){
 const href=match[0].match(/href=["']([^"']+)["']/i)?.[1];if(!href||/^(https?:|data:|\/\/)/.test(href))continue;
 const url=new URL(href,'http://local/'+relative),cssFile=path.resolve(base,'.'+url.pathname);if(!cssFile.startsWith(base+path.sep))continue;
 try{let css=await readFile(cssFile,'utf8');css=css.replace(/url\(\s*(["']?)([^)"']+)\1\s*\)/g,(all,q,v)=>/^(data:|https?:|\/\/|#)/.test(v)?all:'url('+JSON.stringify(new URL(v,url).pathname)+')');html=html.replace(match[0],'<style>'+css.replaceAll('</style','<\\/style')+'</style>');}catch{}
 }
 html=html.replace(/<script src=["']\/app-config.js["']><\/script>/g,'<script>'+ (await readFile(path.join(base,'app-config.js'),'utf8').catch(()=>'')) .replaceAll('</script','<\\/script')+'</script>');
 data=Buffer.from(html);
 }if(path.basename(file)==='app-config.js')data=Buffer.concat([Buffer.from('window.LASER_API_BASE=location.origin;window.LASER_WS_BASE=location.origin;\n'),data]);record={tag,data};cache.set(file,record);}
  const control=ext==='.html'?'no-store':/\.(png|jpg|jpeg|webp|woff2|woff)$/.test(file)?'public,max-age=3600':'no-cache';
  const headers={'Content-Type':mime[ext],'Cache-Control':control,'ETag':tag,'Vary':'Accept-Encoding'};
  if(control!=='no-store'&&req.headers['if-none-match']===tag){res.writeHead(304,headers);return res.end();}
  const compress=record.data.length>1024&&/\.(html|js|css|json|svg)$/.test(file)&&/\bgzip\b/.test(req.headers['accept-encoding']||'');
  if(compress){record.gzip||=gzipSync(record.data);headers['Content-Encoding']='gzip';}
  const data=compress?record.gzip:record.data;headers['Content-Length']=data.length;res.writeHead(200,headers);res.end(req.method==='HEAD'?undefined:data);
 }catch{res.writeHead(404);res.end('Not found');}});
 server.on('upgrade',(req,socket,head)=>{if(!req.url.startsWith('/socket.io/'))return socket.destroy();const upstream=http.request({host:'127.0.0.1',port:8180,path:req.url,headers:{...req.headers,host:'127.0.0.1:8180'}});upstream.on('upgrade',(r,remote,remoteHead)=>{socket.write('HTTP/1.1 101 Switching Protocols\r\n'+Object.entries(r.headers).map(([k,v])=>k+': '+v).join('\r\n')+'\r\n\r\n');if(head.length)remote.write(head);if(remoteHead.length)socket.write(remoteHead);remote.pipe(socket);socket.pipe(remote);remote.on('error',()=>socket.destroy());socket.on('error',()=>remote.destroy());socket.on('close',()=>remote.destroy());});upstream.on('error',()=>socket.destroy());upstream.end();});
 server.listen(port,'127.0.0.1',()=>console.log(role+' gateway ready on '+port));
}


