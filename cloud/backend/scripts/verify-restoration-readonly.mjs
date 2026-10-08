import {all} from '../src/core.mjs';
import {closeDb} from '../src/db.mjs';

const taskIds=new Set([
  'TAR_0afd9d753572640497def8d2c373',
  'TAR_fb432fee14a898a14f83c5995fcd',
  'TAR_ef5f48f43d4d69e696ed6126a82f'
]);
const personIds=new Set([
  'PES_dce1d4d090bc3ae4d69627096652',
  'PES_ff908a10013ddcb461306216b170',
  'PES_c1e399ebef9e759650cc4509f579'
]);

const [people,tasks,messages,reads,attachments,docs,processes]=await Promise.all([
  all('Pessoas'),all('Tarefas'),all('TarefaMensagens'),all('TarefaLeituras'),
  all('TarefaAnexos'),all('Documentos'),all('Processos')
]);

const out={
  people:people.filter(x=>personIds.has(x.id)).map(x=>({id:x.id,nome:x.nome,cpf:x.cpf,versao:x.versao})),
  tasks:tasks.filter(x=>taskIds.has(x.id)).map(x=>({
    id:x.id,pessoaId:x.pessoaId,processoId:x.processoId,situacao:x.situacao,
    responsavel:x.responsavel,criadoEm:x.criadoEm,alteradoEm:x.alteradoEm
  })),
  messages:messages.filter(x=>taskIds.has(x.tarefaId)).map(x=>({
    id:x.id,tarefaId:x.tarefaId,autor:x.autor,mensagem:x.mensagem,
    criadoEm:x.criadoEm,alteradoEm:x.alteradoEm
  })),
  reads:reads.filter(x=>taskIds.has(x.tarefaId)).map(x=>({
    id:x.id,tarefaId:x.tarefaId,usuario:x.usuario,ultimoVistoEm:x.ultimoVistoEm,
    criadoEm:x.criadoEm,alteradoEm:x.alteradoEm
  })),
  attachments:attachments.filter(x=>taskIds.has(x.tarefaId)).map(x=>({
    id:x.id,tarefaId:x.tarefaId,nome:x.nome,fileId:x.fileId
  })),
  counts:{
    pessoas:people.length,
    documentos:docs.length,
    tarefas:tasks.length,
    mensagens:messages.length,
    leituras:reads.length,
    anexos:attachments.length,
    processos:processes.length
  }
};

console.log('RESTORE_VERIFY='+JSON.stringify(out));
await closeDb();
