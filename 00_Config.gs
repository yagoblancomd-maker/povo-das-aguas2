/** Projeto independente. Não reutiliza IDs nem dados do Salém. */
const PDA = Object.freeze({parent:'1wKO6B73R2e-H8E5R_vxRAHmUOIFz3bu7',name:'Povo das Águas',tz:'America/Sao_Paulo',maxBytes:5*1024*1024});
const SCHEMA = Object.freeze({
 Pessoas:['nome','cpf','nascimento','telefone','tipoVia','via','numero','complemento','bairro','cidade','uf','entidade','outraEntidade','analfabeto'],
 Atendimentos:['pessoaId','demanda','referencia','parcelas','outrosCasos','observacoes','responsavel','situacao','folderId','revisao','conferencia','enderecamento','secaoJudiciaria','valorCausa','localData'],
 Documentos:['atendimentoId','categoria','fileId','url','nome','hash','mime','substituiId','vigente','vencimento','terceiro','conferido','declaracaoTerceiro','processoCompleto','anexoPresente','rogo','testemunhas','observacoes'],
 Pendencias:['atendimentoId','descricao','responsavel','situacao'],
 Minutas:['atendimentoId','fileId','url','numero','situacao','snapshot','templateId','templateModified','revisor','revisadaEm'],
 Historico:['entidade','registroId','antes','depois','operacao'],
 Configuracoes:['chave','valor'],Usuarios:['email','perfil','ativo'],
 Distribuicao:['atendimentoId','processoId','numero','juizo','data','responsavel','protocoloId'],
 Processos:['pessoaId','atendimentoId','numero','juizo','distribuidoEm','responsavel','movimentacoes'],
 Operacoes:['hash','resultado']
});
const COMMON=['id','versao','criadoEm','alteradoEm','usuario'];
const DEFAULTS={rascunhos:'PENDENTE',vencimentoFuturo:'PENDENTE',anexoOrientacao:'',templateId:'',templateAprovado:false,
 entidades:['COPAPEL — COLÔNIA DOS PESCADORES E AQUICULTORES PROFISSIONAIS ARTESANAIS DE PELOTAS','COLÔNIA Z-1','COLÔNIA Z-2','COLÔNIA Z-3','COLÔNIA Z-11','Outro'],
 municipios:['Rio Grande','Pelotas','São José do Norte'],demandas:['Seguro-Defeso 2025'],
 categorias:['RG_CPF','RESIDENCIA','PROCESSO_ADMINISTRATIVO','PESCA','PROCURACAO','HIPOSSUFICIENCIA'],
 situacoes:['EM_PREPARACAO','ENCAMINHADO','CONFERIDO']};
const ROLES={CONSULTA:['consulta'],CADASTRO:['consulta','cadastro'],CONFERENCIA:['consulta','cadastro','retificacao','conferencia'],JURIDICO:['consulta','cadastro','retificacao','conferencia','minuta'],ADMIN:['consulta','cadastro','retificacao','conferencia','minuta','administracao']};
function props_(){return PropertiesService.getScriptProperties();
}
function fail_(message){throw new Error(message);
}
function required_(v,label){if(v===undefined||v===null||String(v).trim()==='')fail_('Informe '+label+'.');
return v;
}
function uid_(){return Utilities.getUuid();
}
function hash_(value){return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,typeof value==='string'?value:JSON.stringify(value)).map(x=>('0'+((x+256)%256).toString(16)).slice(-2)).join('');
}
function id_(prefix,key){return prefix+'_'+hash_(key).slice(0,28);
}
function now_(){return new Date().toISOString();
}
function bool_(v){return v===true||v==='true';
}
function clone_(v){return JSON.parse(JSON.stringify(v));
}
function cfg_(){const c=clone_(DEFAULTS);
all_('Configuracoes').forEach(r=>{c[r.chave]=JSON.parse(r.valor);
});
return c;
}
