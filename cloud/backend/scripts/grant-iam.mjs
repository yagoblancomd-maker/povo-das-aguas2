import {getPool,closeDb} from '../src/db.mjs';
const pool=await getPool();
const user='"povo-cloud-run@povo-das-aguas-2026-yago.iam"';
try{
  await pool.query('GRANT CONNECT ON DATABASE povo_das_aguas TO '+user);
  await pool.query('GRANT USAGE ON SCHEMA public TO '+user);
  await pool.query('GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO '+user);
  await pool.query('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO '+user);
  console.log('GRANTS_OK');
}finally{
  await closeDb();
}
