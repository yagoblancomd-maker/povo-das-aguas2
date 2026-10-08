import {getPool,closeDb} from '../src/db.mjs';
const pool=await getPool();
const q=await pool.query("SELECT criado_em,usuario_email,entidade,registro_id,operacao FROM historico ORDER BY criado_em DESC LIMIT 120");
console.log(JSON.stringify(q.rows,null,2));
await closeDb();
