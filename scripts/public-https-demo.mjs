import {createDemoProxy} from './public-demo-proxy.mjs';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {mkdir,writeFile,rm} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url)),require=createRequire(import.meta.url),output=path.join(root,'.local-preview/tunnel');
const QRCode=require(path.join(root,'.local-preview/phone-tools/node_modules/qrcode'));
await mkdir(output,{recursive:true});
const server=createDemoProxy();await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(4201,'127.0.0.1',resolve);});
let child,closing=false,published=false,buffer='';
async function close(code=0){if(closing)return;closing=true;child?.kill();server.close();await rm(path.join(output,'public.json'),{force:true});await rm(path.join(root,'apps/cs-admin/public/customer-demo.json'),{force:true});console.log('Public demo stopped.');process.exit(code);}
process.on('SIGINT',()=>close());process.on('SIGTERM',()=>close());
const args=['-T','-o','BatchMode=yes','-o','StrictHostKeyChecking=accept-new','-o','UserKnownHostsFile='+path.join(output,'known_hosts').replaceAll('\\','/'),'-o','ConnectTimeout=12','-o','ServerAliveInterval=15','-o','ServerAliveCountMax=3','-o','ExitOnForwardFailure=yes','-R','80:127.0.0.1:4201','nokey@localhost.run'];
child=spawn('ssh.exe',args,{windowsHide:true,stdio:['ignore','pipe','pipe']});
async function consume(data){buffer=(buffer+data.toString()).slice(-12000);if(published)return;const match=buffer.match(/https:\/\/[a-z0-9-]+\.lhr\.life/);if(!match)return;published=true;try{const url=match[0],r=await fetch(url+'/login.html',{signal:AbortSignal.timeout(20000)});if(!r.ok||!(await r.text()).includes('organization-login.js'))throw Error('Tunnel did not reach the project');const config={provider:'localhost.run',url,customer:url+'/login.html',scan:url+'/device-scan.html',pid:process.pid,sshPid:child.pid,createdAt:new Date().toISOString()};await writeFile(path.join(output,'public.json'),JSON.stringify(config,null,2));await writeFile(path.join(root,'apps/cs-admin/public/customer-demo.json'),JSON.stringify({url}));await QRCode.toFile(path.join(output,'customer-https.png'),config.customer,{width:420,margin:4,errorCorrectionLevel:'M'});console.log('Customer HTTPS: '+config.customer+'\nNo IP access code is required.\nKeep this window running. Ctrl+C stops sharing.');}catch(e){console.error(e.message);await close(1);}}
child.stdout.on('data',consume);child.stderr.on('data',data=>{if(/Permission denied|Connection timed out|Could not resolve/.test(data.toString()))console.error(data.toString().trim());consume(data);});child.on('error',async e=>{console.error(e.message);await close(1);});child.on('exit',(code)=>{if(!closing){console.error('SSH tunnel closed.');close(code||0);}});
