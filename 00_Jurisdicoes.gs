/** Regra única para cadastro, planilha e minuta. */
function normalizarMunicipio_(texto){
  return String(texto||'').trim().toUpperCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'').replace(/[–—]/g,'-')
    .replace(/\s*-\s*/g,'-').replace(/\s+/g,' ');
}

function determinarJurisdicao(municipio){
  const nome=normalizarMunicipio_(municipio);
  for(const jurisdicao of Object.keys(JURISDICOES)){
    if(JURISDICOES[jurisdicao].some(m=>normalizarMunicipio_(m)===nome)){
      return jurisdicao;
    }
  }
  return '';
}

function municipiosComJurisdicao_(existentes){
  const porNome={};
  (Array.isArray(existentes)?existentes:[]).forEach(m=>{
    if(typeof m==='string'&&m.trim())porNome[normalizarMunicipio_(m)]=m.trim();
  });
  // Os nomes padronizados prevalecem; municípios adicionais são preservados.
  DEFAULTS.municipios.forEach(m=>porNome[normalizarMunicipio_(m)]=m);
  return Object.values(porNome).sort((a,b)=>a.localeCompare(b,'pt-BR'));
}

function jurisdicaoPessoa_(p){
  if(p.uf&&String(p.uf).trim().toUpperCase()!=='RS')return '';
  return determinarJurisdicao(p.cidade);
}

/** Atualização idempotente de instalações existentes, com auditoria de registros. */
function atualizarJurisdicoes_(){
  ensureEntitySchema_('Pessoas');
  const ctx={email:identity_(),op:'jurisdicoes_'+uid_(),hash:'jurisdicoes-v1',changes:[]};
  const config=all_('Configuracoes').find(r=>r.chave==='municipios');
  if(config){
    const lista=municipiosComJurisdicao_(JSON.parse(config.valor));
    if(JSON.stringify(lista)!==config.valor){
      change_(ctx,'Configuracoes',config.id,{chave:'municipios',valor:JSON.stringify(lista)},config.versao);
    }
  }
  const alterados=new Set();
  all_('Pessoas').forEach(p=>{
    const jurisdicao=jurisdicaoPessoa_(p);
    if(p.jurisdicao!==jurisdicao){
      change_(ctx,'Pessoas',p.id,Object.assign({},p,{jurisdicao}),p.versao);
      alterados.add(p.id);
    }
  });
  if(alterados.size){
    all_('Atendimentos').filter(a=>alterados.has(a.pessoaId)).forEach(a=>touch_(ctx,a));
  }
  if(ctx.changes.length)commit_(ctx,{mensagem:'Municípios e jurisdições atualizados.'});
}


/**
 * A migração global só precisa rodar quando as regras de jurisdição mudarem.
 * O hash é derivado do próprio mapa JURISDICOES, portanto uma alteração futura
 * nas regras invalida automaticamente o marcador e força nova sincronização.
 */
function atualizarJurisdicoesSeNecessario_(){
  const key='JURISDICOES_SYNC_HASH';
  const current=hash_(JURISDICOES);

  if(
    props_().getProperty(key)===
    current
  ){
    return false;
  }

  atualizarJurisdicoes_();
  props_().setProperty(
    key,
    current
  );

  return true;
}
