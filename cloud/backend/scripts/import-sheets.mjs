import 'dotenv/config';
import {google} from 'googleapis';
import {getPool,closeDb} from '../src/db.mjs';

const spreadsheetId=process.env.SPREADSHEET_ID;
if(!spreadsheetId)throw new Error('Defina SPREADSHEET_ID.');

const M={
  Pessoas:['pessoas',{
    id:'id',versao:'versao',criadoEm:'criado_em',alteradoEm:'alterado_em',usuario:'usuario_email',
    nome:'nome',cpf:'cpf',nascimento:'nascimento',telefone:'telefone',tipoVia:'tipo_via',via:'via',numero:'numero',
    complemento:'complemento',bairro:'bairro',cidade:'cidade',uf:'uf',entidade:'entidade',outraEntidade:'outra_entidade',
    analfabeto:'analfabeto',parcelasNaoRecebidas:'parcelas_nao_recebidas',jurisdicao:'jurisdicao',cep:'cep',
    email:'email',criadoPor:'criado_por'
  }],
  Configuracoes:['configuracoes',{
    id:'id',versao:'versao',criadoEm:'criado_em',alteradoEm:'alterado_em',usuario:'usuario_email',chave:'chave',valor:'valor'
  }],
  Usuarios:['usuarios',{
    id:'id',versao:'versao',criadoEm:'criado_em',alteradoEm:'alterado_em',usuario:'usuario_email',
    email:'email',perfil:'perfil',ativo:'ativo',nome:'nome',funcao:'funcao',permissoes:'permissoes',
    permissoesVersao:'permissoes_versao',senhaHash:'senha_hash',senhaSalt:'senha_salt',
    senhaAlgoritmo:'senha_algoritmo',sessionVersion:'session_version',ultimoLogin:'ultimo_login',
    nomeUsuario:'nome_usuario',fotoId:'foto_id',emailsAnteriores:'emails_anteriores'
  }],
  Sessoes:['sessoes',{
    id:'id',versao:'versao',criadoEm:'criado_em',alteradoEm:'alterado_em',usuario:'usuario_email',
    usuarioId:'usuario_id',tokenHash:'token_hash',expiraEm:'expira_em',sessionVersion:'session_version',revogada:'revogada'
  }]
};

const bool=new Set(['ativo','revogada']);
const ints=new Set(['versao','permissoes_versao','session_version']);
const json=new Set(['valor','permissoes','emails_anteriores']);

function value(column,v){
  if(v===''||v===undefined)return null;
  if(bool.has(column))return v===true||String(v).toLowerCase()==='true';
  if(ints.has(column))return Number(v)||0;
  if(json.has(column)){try{return JSON.parse(v);}catch{return v;}}
  return v;
}

const auth=new google.auth.GoogleAuth({scopes:['https://www.googleapis.com/auth/spreadsheets.readonly']});
const sheets=google.sheets({version:'v4',auth});
const pool=await getPool();
const c=await pool.connect();

try{
  await c.query('BEGIN');
  if(String(process.env.IMPORT_TRUNCATE).toLowerCase()==='true'){
    await c.query('TRUNCATE sessoes,configuracoes,usuarios,pessoas CASCADE');
  }

  for(const [sheet,[table,map]] of Object.entries(M)){
    const r=await sheets.spreadsheets.values.get({
      spreadsheetId,range:`'${sheet}'!A:ZZ`,valueRenderOption:'FORMATTED_VALUE'
    });
    const values=r.data.values||[];
    if(!values.length)continue;
    const heads=values[0];
    const rows=values.slice(1).filter(x=>x[0]);

    for(const row of rows){
      const source=Object.fromEntries(heads.map((h,i)=>[h,row[i]??'']));
      const columns=Object.values(map);
      const vals=Object.entries(map).map(([h,col])=>value(col,source[h]));
      const places=vals.map((_,i)=>'$'+(i+1));
      const updates=columns.filter(x=>x!=='id').map(x=>`${x}=EXCLUDED.${x}`);
      await c.query(
        `INSERT INTO ${table}(${columns.join(',')}) VALUES(${places.join(',')})
         ON CONFLICT(id) DO UPDATE SET ${updates.join(',')}`,
        vals
      );
    }
    console.log(sheet+': '+rows.length);
  }

  await c.query('COMMIT');
  console.log('Importação inicial concluída.');
}catch(e){
  await c.query('ROLLBACK');throw e;
}finally{
  c.release();await closeDb();
}
