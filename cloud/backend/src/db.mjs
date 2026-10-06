import 'dotenv/config';
import pg from 'pg';
import {Connector,IpAddressTypes,AuthTypes} from '@google-cloud/cloud-sql-connector';

const {Pool}=pg;
let poolPromise,connector;

const env=(k,d='')=>process.env[k]??d;

async function createPool(){
  const iamAuth=env('DB_IAM_AUTH','false')==='true';
  const base={
    database:env('DB_NAME','povo_das_aguas'),
    user:env('DB_USER','povo_app'),
    ...(iamAuth?{}:{password:env('DB_PASSWORD')}),
    max:10,
    idleTimeoutMillis:30000,
    connectionTimeoutMillis:10000
  };

  if(env('INSTANCE_CONNECTION_NAME')){
    connector=new Connector();
    const options=await connector.getOptions({
      instanceConnectionName:env('INSTANCE_CONNECTION_NAME'),
      ipType:IpAddressTypes.PUBLIC,
      authType:iamAuth?AuthTypes.IAM:AuthTypes.PASSWORD
    });
    return new Pool({...options,...base});
  }

  return new Pool({
    ...base,
    host:env('DB_HOST','127.0.0.1'),
    port:Number(env('DB_PORT','5432')),
    ssl:env('DB_SSL','false')==='true'?{rejectUnauthorized:false}:false
  });
}

export function getPool(){
  if(!poolPromise)poolPromise=createPool();
  return poolPromise;
}

export async function tx(fn){
  const pool=await getPool();
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const result=await fn(client);
    await client.query('COMMIT');
    return result;
  }catch(e){
    await client.query('ROLLBACK');
    throw e;
  }finally{
    client.release();
  }
}

export async function closeDb(){
  if(poolPromise)(await poolPromise).end();
  if(connector)connector.close();
}
