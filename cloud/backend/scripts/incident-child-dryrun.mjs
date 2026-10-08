import {all} from '../src/core.mjs';
import {closeDb} from '../src/db.mjs';

const deletedTaskIds=new Set([
  'TAR_0afd9d753572640497def8d2c373',
  'TAR_fb432fee14a898a14f83c5995fcd',
  'TAR_ef5f48f43d4d69e696ed6126a82f'
]);

const history=(await all('Historico'))
  .filter(h=>['TarefaMensagens','TarefaAnexos','TarefaLeituras'].includes(h.entidade));

const latest=new Map();
for(const h of history){
  const prev=latest.get(h.registroId);
  if(!prev||String(h.criadoEm||'')>String(prev.criadoEm||''))latest.set(h.registroId,h);
}

const current={
  TarefaMensagens:new Set((await all('TarefaMensagens')).map(x=>x.id)),
  TarefaAnexos:new Set((await all('TarefaAnexos')).map(x=>x.id)),
  TarefaLeituras:new Set((await all('TarefaLeituras')).map(x=>x.id))
};

const out={children:{},fileRefs:[]};
for(const entity of ['TarefaMensagens','TarefaAnexos','TarefaLeituras']){
  const rows=[];
  for(const h of latest.values()){
    if(h.entidade!==entity||h.operacao==='EXCLUIR')continue;
    const snap=h.depois||h.antes||{};
    if(!deletedTaskIds.has(String(snap.tarefaId||'')))continue;
    rows.push({
      id:h.registroId,
      tarefaId:snap.tarefaId||'',
      exists:current[entity].has(h.registroId),
      snapshot:snap
    });
    if(entity==='TarefaAnexos'&&snap.fileId)out.fileRefs.push(snap.fileId);
  }
  out.children[entity]=rows;
}
console.log('CHILD_DRYRUN='+JSON.stringify(out));
await closeDb();
