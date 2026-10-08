import {tx} from './db.mjs';
import {
  all,get,change,required,httpError,now,sha,
  personInUserScope,authorizePersonScope
} from './core.mjs';

const DATAJUD_PUBLIC_API_KEY_FALLBACK=
  'cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw==';

const DATAJUD_STATE_CODES=Object.freeze({
  '01':'ac','02':'al','03':'ap','04':'am','05':'ba','06':'ce','07':'dft',
  '08':'es','09':'go','10':'ma','11':'mt','12':'ms','13':'mg','14':'pa',
  '15':'pb','16':'pr','17':'pe','18':'pi','19':'rj','20':'rn','21':'rs',
  '22':'ro','23':'rr','24':'sc','25':'se','26':'sp','27':'to'
});

const DATAJUD_PROCESS_TAG_RULES=Object.freeze([
  {tag:'BAIXA DEFINITIVA',priority:100,codes:['22'],terms:['BAIXA DEFINITIVA','ARQUIVAMENTO DEFINITIVO']},
  {tag:'TRÂNSITO EM JULGADO',priority:95,codes:['848'],terms:['TRANSITO EM JULGADO']},
  {tag:'PROCEDÊNCIA PARCIAL',priority:91,codes:['221'],terms:['PROCEDENCIA EM PARTE','PROCEDENCIA PARCIAL']},
  {tag:'IMPROCEDÊNCIA',priority:91,codes:[],terms:['IMPROCEDENCIA']},
  {tag:'PROCEDÊNCIA',priority:91,codes:[],terms:['PROCEDENCIA']},
  {tag:'SENTENÇA/JULGAMENTO',priority:90,codes:['221'],terms:['SENTENCA','JULGAMENTO']},
  {tag:'TUTELA',priority:85,codes:['889'],terms:['ANTECIPACAO DE TUTELA','TUTELA','LIMINAR']},
  {tag:'RECURSO',priority:80,codes:[],terms:['RECURSO','APELACAO','AGRAVO','EMBARGOS']},
  {tag:'RPV/PAGAMENTO',priority:78,codes:[],terms:['RPV','REQUISICAO DE PEQUENO VALOR','PRECATORIO','PAGAMENTO']},
  {tag:'REDISTRIBUIÇÃO',priority:60,codes:['36'],terms:['REDISTRIBUICAO']},
  {tag:'DISTRIBUIÇÃO',priority:55,codes:['26'],terms:['DISTRIBUICAO']},
  {tag:'MUDANÇA DE CLASSE',priority:50,codes:['10966'],terms:['MUDANCA DE CLASSE PROCESSUAL']},
  {tag:'DECISÃO',priority:45,codes:[],terms:['DECISAO','DESPACHO DECISORIO']},
  {tag:'CONCLUSÃO',priority:20,codes:['51'],terms:['CONCLUSAO']}
]);

function text(value){
  return String(value??'').trim();
}

function digits(value){
  const d=String(value||'').replace(/\D/g,'');
  if(d.length!==20){
    throw httpError(400,'O processo deve possuir número CNJ completo com 20 dígitos.');
  }
  return d;
}

function aliasFromNumber(value){
  const d=digits(value);
  const ramo=d.slice(13,14);
  const tribunal=d.slice(14,16);

  if(ramo==='4'){
    const region=Number(tribunal);
    if(region>=1&&region<=6){
      return {alias:'trf'+region,tribunal:'TRF'+region,ramo:'JUSTICA_FEDERAL'};
    }
  }

  if(ramo==='5'){
    const region=Number(tribunal);
    if(region>=1&&region<=24){
      return {alias:'trt'+region,tribunal:'TRT'+region,ramo:'JUSTICA_TRABALHO'};
    }
  }

  if(ramo==='8'){
    const uf=DATAJUD_STATE_CODES[tribunal];
    if(uf){
      return {
        alias:uf==='dft'?'tjdft':'tj'+uf,
        tribunal:uf==='dft'?'TJDFT':'TJ'+uf.toUpperCase(),
        ramo:'JUSTICA_ESTADUAL'
      };
    }
  }

  if(ramo==='6'){
    const uf=DATAJUD_STATE_CODES[tribunal];
    if(uf){
      return {
        alias:'tre-'+uf,
        tribunal:'TRE-'+uf.toUpperCase(),
        ramo:'JUSTICA_ELEITORAL'
      };
    }
  }

  throw httpError(
    400,
    'Ainda não há mapeamento automático do DataJud para este ramo/tribunal ('+
      ramo+'.'+tribunal+').'
  );
}

function endpoint(value){
  const info=aliasFromNumber(value);
  return {
    ...info,
    url:'https://api-publica.datajud.cnj.jus.br/api_publica_'+info.alias+'/_search'
  };
}

function movementId(movement){
  return sha({
    codigo:text(movement?.codigo),
    nome:text(movement?.nome),
    dataHora:text(movement?.dataHora),
    orgao:text(movement?.orgaoJulgador?.nomeOrgao||movement?.orgaoJulgador?.nome)
  }).slice(0,24);
}

function normalizeMovement(movement){
  const orgao=movement?.orgaoJulgador||{};
  return {
    id:movementId(movement),
    codigo:text(movement?.codigo),
    nome:text(movement?.nome),
    dataHora:text(movement?.dataHora),
    orgao:text(orgao.nomeOrgao||orgao.nome)
  };
}

function movementKeyText(movement){
  return String(movement?.nome||'')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .replace(/\s+/g,' ')
    .trim()
    .toUpperCase();
}

function movementTags(movement){
  const code=String(movement?.codigo||'').trim();
  const normalized=movementKeyText(movement);

  const byCode=DATAJUD_PROCESS_TAG_RULES
    .filter(rule=>rule.codes.includes(code))
    .map(rule=>rule.tag);

  if(byCode.length)return [...new Set(byCode)];

  return [...new Set(
    DATAJUD_PROCESS_TAG_RULES
      .filter(rule=>
        rule.terms.some(term=>
          normalized===term||
          normalized.startsWith(term+' ')||
          normalized.includes(' '+term+' ')
        )
      )
      .map(rule=>rule.tag)
  )];
}

function tagsFromMovements(movements){
  const result=[];
  for(const movement of movements||[]){
    for(const tag of movementTags(movement)){
      if(!result.includes(tag))result.push(tag);
    }
  }
  return result;
}

function currentMilestone(movements){
  for(const movement of movements||[]){
    const code=String(movement?.codigo||'').trim();
    const normalized=movementKeyText(movement);

    const matches=DATAJUD_PROCESS_TAG_RULES
      .filter(rule=>
        rule.codes.includes(code)||
        rule.terms.some(term=>normalized.includes(term))
      )
      .sort((a,b)=>Number(b.priority||0)-Number(a.priority||0));

    if(matches.length)return matches[0].tag;
  }
  return '';
}

function existingMovements(process){
  if(Array.isArray(process?.movimentacoes))return process.movimentacoes;
  try{
    const parsed=JSON.parse(process?.movimentacoes||'[]');
    return Array.isArray(parsed)?parsed:[];
  }catch{
    return [];
  }
}

function processTags(process){
  if(Array.isArray(process?.datajudTags)&&process.datajudTags.length)return process.datajudTags;
  try{
    const parsed=JSON.parse(process?.datajudTags||'[]');
    if(Array.isArray(parsed)&&parsed.length)return parsed;
  }catch{}
  return tagsFromMovements(existingMovements(process));
}

function milestone(process){
  return process?.datajudMarcoAtual||currentMilestone(existingMovements(process));
}

function normalizeMovements(source){
  return (Array.isArray(source?.movimentos)?source.movimentos:[])
    .map(normalizeMovement)
    .filter(item=>item.nome||item.codigo||item.dataHora)
    .sort((a,b)=>String(b.dataHora||'').localeCompare(String(a.dataHora||'')))
    .slice(0,120);
}

function processPublic(process){
  const movements=existingMovements(process)
    .slice()
    .sort((a,b)=>String(b.dataHora||'').localeCompare(String(a.dataHora||'')));

  let assuntos=[];
  if(Array.isArray(process.datajudAssuntos))assuntos=process.datajudAssuntos;
  else{
    try{
      const parsed=JSON.parse(process.datajudAssuntos||'[]');
      if(Array.isArray(parsed))assuntos=parsed;
    }catch{}
  }

  return {
    id:process.id,
    versao:process.versao,
    pessoaId:process.pessoaId,
    numero:process.numero,
    juizo:process.juizo,
    distribuidoEm:process.distribuidoEm,
    responsavel:process.responsavel,
    datajud:{
      tribunal:process.datajudTribunal||'',
      grau:process.datajudGrau||'',
      classe:process.datajudClasse||'',
      orgao:process.datajudOrgao||'',
      sistema:process.datajudSistema||'',
      dataAjuizamento:process.datajudDataAjuizamento||'',
      nivelSigilo:process.datajudNivelSigilo||'',
      assuntos,
      tags:processTags(process),
      marcoAtual:milestone(process),
      ultimaMovimentacao:
        process.datajudUltimaMovimentacao||
        movements[0]?.dataHora||
        '',
      ultimaAtualizacaoOrigem:process.datajudUltimaAtualizacaoOrigem||'',
      ultimaConsulta:process.datajudUltimaConsulta||'',
      status:process.datajudStatus||'NAO_SINCRONIZADO',
      erro:process.datajudErro||'',
      movimentos:movements
    }
  };
}

function scopedPeople(people,user){
  return people.filter(person=>personInUserScope(user,person));
}

export async function processDetail(q,user){
  const process=await get('Processos',required(q.id,'processo'));
  const person=await get('Pessoas',process.pessoaId);
  authorizePersonScope(user,person);

  return {
    ...processPublic(process),
    pessoa:person.nome||'Pessoa não localizada',
    cpf:person.cpf||'',
    jurisdicao:process.juizo||person.jurisdicao||''
  };
}

async function fetchProcess(number){
  const d=digits(number);
  const ep=endpoint(d);
  const key=String(process.env.DATAJUD_API_KEY||DATAJUD_PUBLIC_API_KEY_FALLBACK).trim();

  let response;
  try{
    response=await fetch(
      ep.url,
      {
        method:'POST',
        headers:{
          Authorization:'APIKey '+key,
          'Content-Type':'application/json',
          Accept:'application/json'
        },
        body:JSON.stringify({
          size:10,
          query:{
            match:{
              numeroProcesso:d
            }
          }
        })
      }
    );
  }catch(e){
    throw httpError(502,'Falha de comunicação com o DataJud: '+(e.message||String(e)));
  }

  const body=await response.text();

  if(!response.ok){
    throw httpError(
      502,
      'DataJud respondeu HTTP '+response.status+'. '+
      ((response.status===401||response.status===403)
        ?'A chave pública pode ter sido alterada pelo CNJ.'
        :'Tente novamente mais tarde.')
    );
  }

  let parsed;
  try{parsed=JSON.parse(body);}
  catch{throw httpError(502,'O DataJud retornou uma resposta que não pôde ser interpretada.');}

  const hits=Array.isArray(parsed?.hits?.hits)?parsed.hits.hits:[];
  const exact=
    hits.find(hit=>
      String(hit?._source?.numeroProcesso||'').replace(/\D/g,'')===d
    )||
    hits[0]||
    null;

  return {endpoint:ep,source:exact?._source||null};
}

export async function syncProcess(q,user){
  return tx(async client=>{
    const process=await get('Processos',required(q.id,'processo'),client);
    const person=await get('Pessoas',process.pessoaId,client);
    authorizePersonScope(user,person);

    const stamp=now();
    let remote;

    try{
      remote=await fetchProcess(process.numero);
    }catch(e){
      const failed=await change(
        client,
        {email:user.email},
        'Processos',
        process.id,
        {
          ...process,
          datajudUltimaConsulta:stamp,
          datajudStatus:'FALHA',
          datajudErro:e.message||String(e)
        },
        process.versao
      );

      return {
        ok:false,
        processo:processPublic(failed),
        erro:failed.datajudErro,
        mensagem:'Não foi possível atualizar pelo DataJud.'
      };
    }

    if(!remote.source){
      const notFound=await change(
        client,
        {email:user.email},
        'Processos',
        process.id,
        {
          ...process,
          datajudUltimaConsulta:stamp,
          datajudStatus:'NAO_LOCALIZADO',
          datajudErro:'O número não foi localizado no endpoint '+remote.endpoint.tribunal+'.'
        },
        process.versao
      );

      return {
        ok:false,
        processo:processPublic(notFound),
        erro:notFound.datajudErro,
        mensagem:'Processo não localizado no DataJud.'
      };
    }

    const source=remote.source;
    const known=new Set(existingMovements(process).map(item=>String(item.id||'')));
    const movements=normalizeMovements(source);
    const newMovements=movements.filter(item=>!known.has(String(item.id||'')));
    const subjects=(Array.isArray(source.assuntos)?source.assuntos:[])
      .map(item=>text(item?.nome||item?.codigo))
      .filter(Boolean);
    const orgao=source.orgaoJulgador||{};
    const tags=tagsFromMovements(movements);
    const current=currentMilestone(movements);
    const latest=movements[0]?.dataHora||'';

    const updated=await change(
      client,
      {email:user.email},
      'Processos',
      process.id,
      {
        ...process,
        movimentacoes:movements,
        datajudTribunal:text(source.tribunal||remote.endpoint.tribunal),
        datajudGrau:text(source.grau),
        datajudClasse:text(source.classe?.nome||source.classe?.codigo),
        datajudOrgao:text(orgao.nome||orgao.nomeOrgao),
        datajudSistema:text(source.sistema?.nome||source.sistema?.codigo),
        datajudDataAjuizamento:text(source.dataAjuizamento),
        datajudNivelSigilo:text(source.nivelSigilo),
        datajudAssuntos:subjects,
        datajudTags:tags,
        datajudMarcoAtual:current,
        datajudUltimaMovimentacao:latest,
        datajudUltimaAtualizacaoOrigem:text(source.dataHoraUltimaAtualizacao||source['@timestamp']),
        datajudUltimaConsulta:stamp,
        datajudStatus:'ATUALIZADO',
        datajudErro:''
      },
      process.versao
    );

    return {
      ok:true,
      processo:processPublic(updated),
      novasMovimentacoes:newMovements.length,
      tribunal:updated.datajudTribunal,
      mensagem:newMovements.length
        ?newMovements.length+(newMovements.length===1
          ?' nova movimentação localizada no DataJud.'
          :' novas movimentações localizadas no DataJud.')
        :'Processo atualizado. Nenhuma movimentação nova foi localizada.'
    };
  });
}

function lower(value){
  return String(value||'').trim().toLowerCase();
}

function isoDate(value,endOfDay=false){
  if(!value)return '';
  const suffix=endOfDay?'T23:59:59.999Z':'T00:00:00.000Z';
  const d=new Date(String(value).length===10?String(value)+suffix:String(value));
  return Number.isNaN(d.getTime())?'':d.toISOString();
}

export async function filterOptions(user){
  const [people,processes]=await Promise.all([all('Pessoas'),all('Processos')]);
  const visible=new Set(scopedPeople(people,user).map(p=>p.id));
  const rows=processes.filter(p=>visible.has(p.pessoaId));

  const uniq=values=>
    [...new Set(values.map(v=>String(v||'').trim()).filter(Boolean))]
      .sort((a,b)=>a.localeCompare(b,'pt-BR'));

  return {
    tribunais:uniq(rows.map(p=>p.datajudTribunal)),
    classes:uniq(rows.map(p=>p.datajudClasse)),
    orgaos:uniq(rows.map(p=>p.datajudOrgao)),
    tags:uniq(rows.flatMap(p=>processTags(p))),
    marcos:uniq(rows.map(p=>milestone(p))),
    status:[
      {value:'ATUALIZADO',label:'Atualizado'},
      {value:'FALHA',label:'Falha'},
      {value:'NAO_LOCALIZADO',label:'Não localizado'},
      {value:'NAO_SINCRONIZADO',label:'Nunca sincronizado'}
    ]
  };
}

export async function listProcesses(q,user){
  q=q||{};

  const search=lower(q.busca);
  const tribunal=lower(q.tribunal);
  const classe=lower(q.classe);
  const orgao=lower(q.orgao);
  const status=String(q.status||'').trim().toUpperCase();
  const tag=String(q.tag||'').trim().toUpperCase();
  const marco=String(q.marco||'').trim().toUpperCase();
  const movDe=isoDate(q.movDe);
  const movAte=isoDate(q.movAte,true);
  const offset=Math.max(0,Number(q.offset)||0);
  const limit=Math.min(100,Math.max(20,Number(q.limit)||50));

  const [people,processes]=await Promise.all([all('Pessoas'),all('Processos')]);
  const visiblePeople=scopedPeople(people,user);
  const peopleById=new Map(visiblePeople.map(person=>[person.id,person]));

  let rows=processes.filter(process=>peopleById.has(process.pessoaId));

  rows=rows.filter(process=>{
    const person=peopleById.get(process.pessoaId);
    const tags=processTags(process);
    const current=milestone(process);
    const movements=existingMovements(process);
    const lastMovement=process.datajudUltimaMovimentacao||movements[0]?.dataHora||'';

    if(search){
      const values=[
        process.numero,
        process.juizo,
        process.responsavel,
        process.datajudTribunal,
        process.datajudClasse,
        process.datajudOrgao,
        current,
        tags.join(' '),
        person?.nome,
        person?.cpf,
        person?.jurisdicao
      ];

      if(!values.some(value=>lower(value).includes(search)))return false;
    }

    if(tribunal&&!lower(process.datajudTribunal).includes(tribunal))return false;
    if(classe&&!lower(process.datajudClasse).includes(classe))return false;
    if(orgao&&!lower(process.datajudOrgao).includes(orgao))return false;
    if(status&&String(process.datajudStatus||'NAO_SINCRONIZADO').toUpperCase()!==status)return false;
    if(tag&&!tags.some(item=>String(item).toUpperCase()===tag))return false;
    if(marco&&String(current||'').toUpperCase()!==marco)return false;

    const lastIso=lastMovement?new Date(lastMovement).toISOString():'';
    if(movDe&&(!lastIso||lastIso<movDe))return false;
    if(movAte&&(!lastIso||lastIso>movAte))return false;

    return true;
  });

  rows.sort(
    (a,b)=>
      String(b.datajudUltimaMovimentacao||b.distribuidoEm||b.criadoEm||'')
        .localeCompare(
          String(a.datajudUltimaMovimentacao||a.distribuidoEm||a.criadoEm||'')
        )
  );

  const total=rows.length;

  return {
    processos:rows
      .slice(offset,offset+limit)
      .map(process=>{
        const person=peopleById.get(process.pessoaId);
        const movements=existingMovements(process);

        return {
          id:process.id,
          numero:process.numero,
          pessoaId:process.pessoaId,
          pessoa:person?.nome||'Pessoa não localizada',
          cpf:person?.cpf||'',
          jurisdicao:process.juizo||person?.jurisdicao||'',
          distribuidoEm:process.distribuidoEm,
          responsavel:process.responsavel,
          datajudStatus:process.datajudStatus||'NAO_SINCRONIZADO',
          datajudUltimaConsulta:process.datajudUltimaConsulta||'',
          datajudTribunal:process.datajudTribunal||'',
          datajudClasse:process.datajudClasse||'',
          datajudOrgao:process.datajudOrgao||'',
          datajudTags:processTags(process),
          datajudMarcoAtual:milestone(process),
          datajudUltimaMovimentacao:
            process.datajudUltimaMovimentacao||
            movements[0]?.dataHora||
            ''
        };
      }),
    total,
    offset,
    limit,
    hasMore:offset+limit<total
  };
}
