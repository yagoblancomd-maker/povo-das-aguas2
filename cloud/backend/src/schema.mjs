import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {getPool} from './db.mjs';

const __dirname=path.dirname(fileURLToPath(import.meta.url));

export async function ensureSchema(){
  const sql=await fs.readFile(
    path.join(__dirname,'../sql/001_initial_schema.sql'),
    'utf8'
  );
  const pool=await getPool();
  await pool.query(sql);
}
