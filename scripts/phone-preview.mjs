import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {mkdir,writeFile} from 'node:fs/promises';
import QRCode from '../.local-preview/phone-tools/node_modules/qrcode/lib/index.js';

const root=fileURLToPath(new URL('../',import.meta.url));
const candidates=Object.entries(os.networkInterfaces()).flatMap(([name,items])=>(items||[]).filter(i=>i.family==='IPv4'&&!i.internal&&!/virtual|vethernet|wsl|vpn|docker|loopback/i.test(name)).map(i=>({name,ip:i.address})));
candidates.sort((a,b)=>Number(/^192\.168\./.test(b.ip))-Number(/^192\.168\./.test(a.ip)));
const ip=process.env.LASER_PHONE_IP||candidates[0]?.ip;
if(!ip || !/^(?:\d{1,3}\.){3}\d{1,3}$/.test(ip))throw Error('No LAN IPv4 address. Connect the computer to Wi-Fi first.');
const output=path.join(root,'.local-preview','phone-demo');
await mkdir(output,{recursive:true});
const customer=`http://${ip}:4101/login.html`,engineer=`http://${ip}:4102/login.html`;
for(const [name,url] of [['customer',customer],['engineer',engineer]])await QRCode.toFile(path.join(output,name+'.png'),url,{width:420,margin:4,errorCorrectionLevel:'M'});
await writeFile(path.join(output,'links.json'),JSON.stringify({ip,customer,engineer},null,2));
await writeFile(path.join(output,'index.html'),`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>手机演示入口</title><style>body{font:16px/1.7 system-ui,sans-serif;max-width:800px;margin:48px auto;padding:0 24px;color:#24372e}section{display:flex;gap:32px;flex-wrap:wrap}article{flex:1;min-width:240px}img{width:260px;max-width:100%}a{color:#176c50;overflow-wrap:anywhere}</style><h1>手机演示入口</h1><p>手机与电脑连接同一个 Wi-Fi，扫码后使用浏览器打开。电脑和演示服务需要保持运行。</p><section><article><h2>客户端</h2><img src="customer.png" alt="客户端访问二维码"><p><a href="${customer}">${customer}</a></p></article><article><h2>工程师端</h2><img src="engineer.png" alt="工程师端访问二维码"><p><a href="${engineer}">${engineer}</a></p></article></section>`);
console.log(`Customer: ${customer}\nEngineer: ${engineer}\nQR files: ${output}\nKeep this process running; press Ctrl+C to stop phone preview.`);
if(!process.argv.includes('--links-only')){
 process.env.LASER_PHONE_PREVIEW='1';
 await import('./web-preview.mjs');
}
