import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
const require=createRequire(new URL('../backend/package.json',import.meta.url));
const {Client}=require('pg');
const envPath=new URL('../backend/.env',import.meta.url);
if(existsSync(envPath))for(const line of readFileSync(envPath,'utf8').split(/\r?\n/)){const match=line.match(/^([A-Z_]+)=["']?(.*?)["']?$/);if(match&&process.env[match[1]]===undefined)process.env[match[1]]=match[2];}
const name='laser_audit_20261025';
const client=new Client({host:process.env.DB_HOST||'localhost',port:Number(process.env.DB_PORT||5432),user:process.env.DB_USERNAME||'laser_user',password:process.env.DB_PASSWORD||'laser_pass_2024',database:'postgres'});
await client.connect();try{if(!(await client.query('SELECT 1 FROM pg_database WHERE datname=$1',[name])).rowCount)await client.query('CREATE DATABASE '+name);console.log('Audit database ready: '+name);}finally{await client.end();}
