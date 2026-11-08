import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
export async function attachmentBytes(tenantId: string): Promise<number> {
  if(!/^[a-f0-9-]{36}$/.test(tenantId))throw Error('Invalid tenant id');
  async function sum(directory: string): Promise<number> {
    let entries;
    try {entries=await readdir(directory,{withFileTypes:true});}catch(error:any){if(error.code==='ENOENT')return 0;throw error;}
    let total=0;
    for(const entry of entries){const path=join(directory,entry.name);if(entry.isDirectory())total+=await sum(path);else if(entry.isFile()){try{total+=(await stat(path)).size;}catch(error:any){if(error.code!=='ENOENT')throw error;}}}
    return total;
  }
  return sum(join(process.cwd(),'uploads',tenantId));
}
