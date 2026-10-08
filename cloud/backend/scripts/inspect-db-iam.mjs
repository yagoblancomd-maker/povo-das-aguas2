import pg from 'pg';
import {Connector,IpAddressTypes,AuthTypes} from '@google-cloud/cloud-sql-connector';
const connector=new Connector();
const opts=await connector.getOptions({
  instanceConnectionName:'povo-das-aguas-2026-yago:southamerica-east1:povo-das-aguas-db',
  ipType:IpAddressTypes.PUBLIC,
  authType:AuthTypes.IAM
});
const pool=new pg.Pool({...opts,user:'yagoblancomd@gmail.com',database:'povo_das_aguas',max:2});
for(const table of ['pessoas','usuarios','atendimentos','documentos','tarefas','processos','historico','configuracoes']){
  try{
    const r=await pool.query('SELECT count(*)::int n,max(alterado_em) max_alterado,max(criado_em) max_criado FROM '+table);
    console.log(table,JSON.stringify(r.rows[0]));
  }catch(e){console.log(table,'ERROR',e.message)}
}
await pool.end();connector.close();