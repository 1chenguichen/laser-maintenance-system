// Static previews read the real source; no API-port rewriting or copied HTML.
import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {gzipSync} from 'node:zlib';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const project=fileURLToPath(new URL('../',import.meta.url));
const mime={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2','.ico':'image/x-icon'};
const files=new Map();
const phone=process.env.LASER_PHONE_PREVIEW==='1';
const targets=phone?[[4101,'customer-app-web'],[4102,'engineer-app-web']]:[[3101,'customer-app-web'],[3102,'engineer-app-web'],[3103,'platform-admin-web']];
for(const [port,app] of targets){
 const root=path.join(project,'apps',app);
 http.createServer(async(req,res)=>{try{
  const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  if(pathname==='/'){res.writeHead(302,{Location:app==='platform-admin-web'?'/index.html':'/login.html'});return res.end();}
  const file=path.resolve(root,'.'+pathname);
  if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
  const info=await stat(file),ext=path.extname(file);
  const tag='W/"'+info.size+'-'+info.mtimeMs+'"';
  const immutable=/material-symbols-[a-f0-9]{12}\.woff2$/.test(file);
  const control=ext==='.html'?'no-store':immutable?'public, max-age=31536000, immutable':/\.(woff2|png|jpg|webp|ico)$/.test(file)||path.basename(file)==='tailwind.js'?'public, max-age=3600':'no-cache';
  const headers={'Content-Type':mime[ext]||'application/octet-stream','Cache-Control':control,'ETag':tag,'Vary':'Accept-Encoding'};
  if(control!=='no-store'&&req.headers['if-none-match']===tag){res.writeHead(304,headers);return res.end();}
  let cached=files.get(file);
  if(!cached||cached.tag!==tag){const data=await readFile(file);cached={tag,data};files.set(file,cached);}
  const compressed=cached.data.length>1024&&/\.(html|js|css|json|svg)$/.test(file)&&/\bgzip\b/.test(req.headers['accept-encoding']||'');
  if(compressed){cached.gzip||=gzipSync(cached.data);headers['Content-Encoding']='gzip';}
  const data=compressed?cached.gzip:cached.data;headers['Content-Length']=data.length;
  res.writeHead(200,headers);res.end(req.method==='HEAD'?undefined:data);
 }catch{res.writeHead(404);res.end('Not found');}}).listen(port,phone?'0.0.0.0':'127.0.0.1',()=>console.log(app+': http://localhost:'+port));
}
