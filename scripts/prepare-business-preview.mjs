import {createRequire} from 'node:module';
const require=createRequire(new URL('../backend/package.json',import.meta.url));const {Client}=require('pg');
const common={host:'localhost',user:'laser_user',password:'laser_pass_2024'};
const source=new Client({...common,database:'laser_maintenance'}),target=new Client({...common,database:'laser_business_20261027'});
await source.connect();await target.connect();
try{
 if(Number((await target.query('SELECT count(*) FROM customers')).rows[0].count)>0){console.log('Business preview already populated; skipped copying');}
 else{
 await source.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');await target.query('BEGIN');await target.query("SET LOCAL session_replication_role = 'replica'");
 const tables=(await source.query("SELECT tablename FROM pg_tables WHERE schemaname='public'")).rows;
 for(const {tablename} of tables){
  const columns=(await target.query("SELECT column_name,data_type FROM information_schema.columns WHERE table_schema='public' AND table_name=$1",[tablename])).rows;if(!columns.length)continue;
  const rows=(await source.query('SELECT * FROM "'+tablename.replaceAll('"','""')+'"')).rows;
  for(const row of rows){const fields=columns.filter(c=>Object.hasOwn(row,c.column_name));const values=fields.map(c=>['json','jsonb'].includes(c.data_type)&&row[c.column_name]!==null?JSON.stringify(row[c.column_name]):row[c.column_name]);await target.query('INSERT INTO "'+tablename+'" ('+fields.map(c=>'"'+c.column_name+'"').join(',')+') VALUES ('+values.map((_,i)=>'$'+(i+1)).join(',')+')',values)}
 }
 await target.query('COMMIT');await source.query('COMMIT');console.log('Copied demo records into isolated business preview; original untouched');
 }
}catch(e){await target.query('ROLLBACK');await source.query('ROLLBACK');throw e}finally{await source.end();await target.end()}
