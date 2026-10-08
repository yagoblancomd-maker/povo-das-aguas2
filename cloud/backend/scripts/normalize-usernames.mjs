import pg from 'pg';
import {Connector,IpAddressTypes,AuthTypes} from '@google-cloud/cloud-sql-connector';

const mapping={
  'arthur.vc@hotmail.com':'arthur.vc',
  'edu.ndell@gmail.com':'edu.ndell',
  'luizacdcunha@gmail.com':'luizacdcunha',
  'luizhahn2006@gmail.com':'luizhahn2006',
  'yagoblancomd@gmail.com':'yagoblanco'
};

const connector=new Connector();
const opts=await connector.getOptions({
  instanceConnectionName:'povo-das-aguas-2026-yago:southamerica-east1:povo-das-aguas-db',
  ipType:IpAddressTypes.PUBLIC,
  authType:AuthTypes.PASSWORD
});
const pool=new pg.Pool({...opts,user:'pda_migrator',password:process.env.PDA_MIGRATION_PASSWORD,database:'povo_das_aguas',max:2});
const client=await pool.connect();

try{
  await client.query('SET ROLE povo_app');
  await client.query('BEGIN');

  for(const [email,username] of Object.entries(mapping)){
    await client.query(
      `update usuarios
       set nome_usuario=$1,alterado_em=now(),versao=versao+1
       where lower(email)=lower($2)`,
      [username,email]
    );
  }

  const dup=await client.query(`
    select lower(nome_usuario) usuario,count(*)::int n
    from usuarios
    where coalesce(nome_usuario,'')<>''
    group by lower(nome_usuario)
    having count(*)>1
  `);
  if(dup.rowCount)throw new Error('Nome de usuário duplicado após normalização.');

  await client.query('COMMIT');
  console.log(JSON.stringify((await client.query(
    'select email,nome_usuario from usuarios order by email'
  )).rows,null,2));
}catch(error){
  await client.query('ROLLBACK');
  throw error;
}finally{
  client.release();await pool.end();connector.close();
}