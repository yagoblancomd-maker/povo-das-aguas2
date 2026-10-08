import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {getPool} from './db.mjs';

const __dirname=path.dirname(fileURLToPath(import.meta.url));

function safeRole(value){
  const role=String(value||'').trim();
  if(!role)return '';
  if(!/^[A-Za-z0-9_@.\-]+$/.test(role))throw new Error('DB_ROLE inválido.');
  return role;
}

export async function ensureSchema(){
  const dir=path.join(__dirname,'../sql');
  const files=(await fs.readdir(dir))
    .filter(name=>/^\d+_.*\.sql$/i.test(name))
    .sort((a,b)=>a.localeCompare(b,'en',{numeric:true}));

  const pool=await getPool();
  const client=await pool.connect();

  try{
    const role=safeRole(process.env.DB_ROLE);
    if(role)await client.query('SET ROLE "'+role.replace(/"/g,'""')+'"');

    for(const name of files){
      const sql=await fs.readFile(path.join(dir,name),'utf8');
      await client.query(sql);
    }
  }finally{
    client.release();
  }
}
