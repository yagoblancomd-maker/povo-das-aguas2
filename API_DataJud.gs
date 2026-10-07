const DATAJUD_PUBLIC_API_KEY_FALLBACK=
  'cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw==';

const DATAJUD_STATE_CODES=Object.freeze({
  '01':'ac','02':'al','03':'ap','04':'am','05':'ba','06':'ce','07':'dft',
  '08':'es','09':'go','10':'ma','11':'mt','12':'ms','13':'mg','14':'pa',
  '15':'pb','16':'pr','17':'pe','18':'pi','19':'rj','20':'rn','21':'rs',
  '22':'ro','23':'rr','24':'sc','25':'se','26':'sp','27':'to'
});

function datajudApiKey_(){
  return String(
    props_().getProperty('DATAJUD_API_KEY')||
    DATAJUD_PUBLIC_API_KEY_FALLBACK
  ).trim();
}

function datajudDigits_(value){
  const digits=String(value||'').replace(/\D/g,'');

  if(digits.length!==20){
    fail_(
      'O processo deve possuir número CNJ completo com 20 dígitos.'
    );
  }

  return digits;
}

function datajudProcessNumberFormat_(value){
  const d=datajudDigits_(value);

  return (
    d.slice(0,7)+'-'+
    d.slice(7,9)+'.'+
    d.slice(9,13)+'.'+
    d.slice(13,14)+'.'+
    d.slice(14,16)+'.'+
    d.slice(16,20)
  );
}

function datajudAliasFromNumber_(value){
  const d=datajudDigits_(value);
  const ramo=d.slice(13,14);
  const tribunal=d.slice(14,16);

  if(ramo==='4'){
    const region=Number(tribunal);

    if(region>=1&&region<=6){
      return {
        alias:'trf'+region,
        tribunal:'TRF'+region,
        ramo:'JUSTICA_FEDERAL'
      };
    }
  }

  if(ramo==='5'){
    const region=Number(tribunal);

    if(region>=1&&region<=24){
      return {
        alias:'trt'+region,
        tribunal:'TRT'+region,
        ramo:'JUSTICA_TRABALHO'
      };
    }
  }

  if(ramo==='8'){
    const uf=DATAJUD_STATE_CODES[tribunal];

    if(uf){
      const sigla=
        uf==='dft'
          ?'TJDFT'
          :'TJ'+uf.toUpperCase();

      return {
        alias:
          uf==='dft'
            ?'tjdft'
            :'tj'+uf,
        tribunal:sigla,
        ramo:'JUSTICA_ESTADUAL'
      };
    }
  }

  if(ramo==='6'){
    const uf=DATAJUD_STATE_CODES[tribunal];

    if(uf){
      return {
        alias:
          'tre-'+uf,
        tribunal:
          'TRE-'+uf.toUpperCase(),
        ramo:'JUSTICA_ELEITORAL'
      };
    }
  }

  fail_(
    'Ainda não há mapeamento automático do DataJud para este ramo/tribunal ('+
    ramo+'.'+tribunal+').'
  );
}

function datajudEndpoint_(value){
  const info=datajudAliasFromNumber_(value);

  return Object.assign(
    {},
    info,
    {
      url:
        'https://api-publica.datajud.cnj.jus.br/api_publica_'+
        info.alias+
        '/_search'
    }
  );
}

function datajudText_(value){
  return String(
    value===undefined||
    value===null
      ?''
      :value
  ).trim();
}

function datajudMovementId_(movement){
  return hash_({
    codigo:
      datajudText_(
        movement&&movement.codigo
      ),
    nome:
      datajudText_(
        movement&&movement.nome
      ),
    dataHora:
      datajudText_(
        movement&&movement.dataHora
      ),
    orgao:
      datajudText_(
        movement&&
        movement.orgaoJulgador&&
        (
          movement.orgaoJulgador.nomeOrgao||
          movement.orgaoJulgador.nome
        )
      )
  }).slice(0,24);
}

function datajudNormalizeMovement_(movement){
  const orgao=
    movement&&
    movement.orgaoJulgador||
    {};

  return {
    id:datajudMovementId_(movement),
    codigo:
      datajudText_(
        movement&&movement.codigo
      ),
    nome:
      datajudText_(
        movement&&movement.nome
      ),
    dataHora:
      datajudText_(
        movement&&movement.dataHora
      ),
    orgao:
      datajudText_(
        orgao.nomeOrgao||
        orgao.nome
      )
  };
}

const DATAJUD_PROCESS_TAG_RULES=Object.freeze([
  {tag:'BAIXA DEFINITIVA',codes:['22'],terms:['BAIXA DEFINITIVA','ARQUIVAMENTO DEFINITIVO']},
  {tag:'TRÂNSITO EM JULGADO',codes:['848'],terms:['TRANSITO EM JULGADO']},
  {tag:'REDISTRIBUIÇÃO',codes:['36'],terms:['REDISTRIBUICAO']},
  {tag:'DISTRIBUIÇÃO',codes:['26'],terms:['DISTRIBUICAO']},
  {tag:'TUTELA',codes:['889'],terms:['ANTECIPACAO DE TUTELA','TUTELA','LIMINAR']},
  {tag:'PROCEDÊNCIA PARCIAL',codes:['221'],terms:['PROCEDENCIA EM PARTE','PROCEDENCIA PARCIAL']},
  {tag:'IMPROCEDÊNCIA',codes:[],terms:['IMPROCEDENCIA']},
  {tag:'PROCEDÊNCIA',codes:[],terms:['PROCEDENCIA']},
  {tag:'SENTENÇA/JULGAMENTO',codes:[],terms:['SENTENCA','PROCEDENCIA','IMPROCEDENCIA','EXTINCAO','JULGAMENTO']},
  {tag:'DECISÃO',codes:[],terms:['DECISAO','DESPACHO DECISORIO']},
  {tag:'RECURSO',codes:[],terms:['RECURSO','APELACAO','AGRAVO','EMBARGOS']},
  {tag:'RPV/PAGAMENTO',codes:[],terms:['RPV','REQUISICAO DE PEQUENO VALOR','PRECATORIO','PAGAMENTO']},
  {tag:'MUDANÇA DE CLASSE',codes:['10966'],terms:['MUDANCA DE CLASSE PROCESSUAL']},
  {tag:'CONCLUSÃO',codes:['51'],terms:['CONCLUSAO']}
]);

function datajudMovementKeyText_(movement){
  return String(
    movement&&movement.nome||
    ''
  )
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g,'')
    .replace(/\s+/g,' ')
    .trim()
    .toUpperCase();
}

function datajudMovementTags_(movement){
  const code=
    String(
      movement&&movement.codigo||
      ''
    ).trim();

  const text=
    datajudMovementKeyText_(
      movement
    );

  return DATAJUD_PROCESS_TAG_RULES
    .filter(rule=>
      rule.codes.includes(code)||
      rule.terms.some(term=>
        text.includes(term)
      )
    )
    .map(rule=>rule.tag);
}

function datajudTagsFromMovements_(movements){
  const tags=[];

  (movements||[]).forEach(movement=>{
    datajudMovementTags_(movement)
      .forEach(tag=>{
        if(!tags.includes(tag)){
          tags.push(tag);
        }
      });
  });

  return tags;
}

function datajudCurrentMilestone_(movements){
  for(const movement of movements||[]){
    const tags=
      datajudMovementTags_(
        movement
      );

    if(tags.length){
      return tags[0];
    }
  }

  return '';
}

function datajudProcessTags_(process){
  try{
    const stored=
      JSON.parse(
        process.datajudTags||
        '[]'
      );

    if(
      Array.isArray(stored)&&
      stored.length
    ){
      return stored;
    }
  }catch(e){}

  return datajudTagsFromMovements_(
    datajudExistingMovements_(
      process
    )
  );
}

function datajudProcessMilestone_(process){
  return (
    process.datajudMarcoAtual||
    datajudCurrentMilestone_(
      datajudExistingMovements_(
        process
      )
    )
  );
}

function datajudExistingMovements_(process){
  try{
    const parsed=
      JSON.parse(
        process.movimentacoes||
        '[]'
      );

    return Array.isArray(parsed)
      ?parsed
      :[];
  }catch(e){
    return [];
  }
}

function datajudNormalizeMovements_(source){
  return (
    Array.isArray(
      source&&source.movimentos
    )
      ?source.movimentos
      :[]
  )
    .map(datajudNormalizeMovement_)
    .filter(item=>
      item.nome||
      item.codigo||
      item.dataHora
    )
    .sort((a,b)=>
      String(
        b.dataHora||
        ''
      ).localeCompare(
        String(
          a.dataHora||
          ''
        )
      )
    )
    .slice(0,120);
}

function datajudProcessPublic_(process){
  const movements=
    datajudExistingMovements_(
      process
    )
      .slice()
      .sort((a,b)=>
        String(
          b.dataHora||
          ''
        ).localeCompare(
          String(
            a.dataHora||
            ''
          )
        )
      );

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
      dataAjuizamento:
        process.datajudDataAjuizamento||
        '',
      nivelSigilo:
        process.datajudNivelSigilo||
        '',
      assuntos:(()=>{
        try{
          const list=
            JSON.parse(
              process.datajudAssuntos||
              '[]'
            );

          return Array.isArray(list)
            ?list
            :[];
        }catch(e){
          return [];
        }
      })(),
      tags:
        datajudProcessTags_(
          process
        ),
      marcoAtual:
        datajudProcessMilestone_(
          process
        ),
      ultimaMovimentacao:
        process.datajudUltimaMovimentacao||
        (
          movements[0]&&
          movements[0].dataHora||
          ''
        ),
      ultimaAtualizacaoOrigem:
        process.datajudUltimaAtualizacaoOrigem||
        '',
      ultimaConsulta:
        process.datajudUltimaConsulta||
        '',
      status:
        process.datajudStatus||
        'NAO_SINCRONIZADO',
      erro:
        process.datajudErro||
        '',
      movimentos:movements
    }
  };
}

function processDetail_(q){
  const process=
    get_(
      'Processos',
      required_(
        q.id,
        'processo'
      )
    );

  authorizeProcessScope_(
    process
  );

  const person=
    findById_(
      'Pessoas',
      process.pessoaId
    );

  return Object.assign(
    {},
    datajudProcessPublic_(
      process
    ),
    {
      pessoa:
        person
          ?person.nome
          :'Pessoa não localizada',
      cpf:
        person
          ?person.cpf
          :'',
      jurisdicao:
        process.juizo||
        (
          person
            ?person.jurisdicao
            :''
        )
    }
  );
}

function datajudFetchProcess_(number){
  const digits=
    datajudDigits_(
      number
    );

  const endpoint=
    datajudEndpoint_(
      digits
    );

  const response=
    UrlFetchApp.fetch(
      endpoint.url,
      {
        method:'post',
        contentType:'application/json',
        headers:{
          Authorization:
            'APIKey '+
            datajudApiKey_()
        },
        payload:
          JSON.stringify({
            size:10,
            query:{
              match:{
                numeroProcesso:digits
              }
            }
          }),
        muteHttpExceptions:true,
        followRedirects:true
      }
    );

  const code=
    Number(
      response.getResponseCode()
    );

  const body=
    response.getContentText();

  if(code<200||code>=300){
    fail_(
      'DataJud respondeu HTTP '+
      code+
      '. '+
      (
        code===401||
        code===403
          ?'A chave pública pode ter sido alterada pelo CNJ.'
          :'Tente novamente mais tarde.'
      )
    );
  }

  let parsed;

  try{
    parsed=JSON.parse(body);
  }catch(e){
    fail_(
      'O DataJud retornou uma resposta que não pôde ser interpretada.'
    );
  }

  const hits=
    parsed&&
    parsed.hits&&
    Array.isArray(
      parsed.hits.hits
    )
      ?parsed.hits.hits
      :[];

  const exact=
    hits.find(hit=>
      String(
        hit&&
        hit._source&&
        hit._source.numeroProcesso||
        ''
      ).replace(/\D/g,'')===
      digits
    )||
    hits[0]||
    null;

  return {
    endpoint,
    source:
      exact&&
      exact._source
        ?exact._source
        :null
  };
}

function processDatajudSync_(ctx,q){
  const process=
    get_(
      'Processos',
      required_(
        q.id,
        'processo'
      )
    );

  authorizeProcessScope_(
    process
  );

  const now=now_();
  let remote;

  try{
    remote=
      datajudFetchProcess_(
        process.numero
      );

  }catch(e){
    const failed=
      change_(
        ctx,
        'Processos',
        process.id,
        Object.assign(
          {},
          process,
          {
            datajudUltimaConsulta:now,
            datajudStatus:'FALHA',
            datajudErro:
              e.message||
              String(e)
          }
        ),
        process.versao
      );

    return {
      ok:false,
      processo:
        datajudProcessPublic_(
          failed
        ),
      erro:
        failed.datajudErro,
      mensagem:
        'Não foi possível atualizar pelo DataJud.'
    };
  }

  if(!remote.source){
    const notFound=
      change_(
        ctx,
        'Processos',
        process.id,
        Object.assign(
          {},
          process,
          {
            datajudUltimaConsulta:now,
            datajudStatus:'NAO_LOCALIZADO',
            datajudErro:
              'O número não foi localizado no endpoint '+
              remote.endpoint.tribunal+
              '.'
          }
        ),
        process.versao
      );

    return {
      ok:false,
      processo:
        datajudProcessPublic_(
          notFound
        ),
      erro:
        notFound.datajudErro,
      mensagem:
        'Processo não localizado no DataJud.'
    };
  }

  const source=remote.source;
  const existing=
    datajudExistingMovements_(
      process
    );

  const known=
    new Set(
      existing.map(item=>
        String(item.id||'')
      )
    );

  const movements=
    datajudNormalizeMovements_(
      source
    );

  const newMovements=
    movements.filter(item=>
      !known.has(
        String(item.id||'')
      )
    );

  const subjects=
    (
      Array.isArray(source.assuntos)
        ?source.assuntos
        :[]
    )
      .map(item=>
        datajudText_(
          item&&
          (
            item.nome||
            item.codigo
          )
        )
      )
      .filter(Boolean);

  const orgao=
    source.orgaoJulgador||
    {};

  const processTags=
    datajudTagsFromMovements_(
      movements
    );

  const currentMilestone=
    datajudCurrentMilestone_(
      movements
    );

  const latestMovement=
    movements[0]&&
    movements[0].dataHora||
    '';

  const updated=
    change_(
      ctx,
      'Processos',
      process.id,
      Object.assign(
        {},
        process,
        {
          movimentacoes:
            JSON.stringify(
              movements
            ),
          datajudTribunal:
            datajudText_(
              source.tribunal||
              remote.endpoint.tribunal
            ),
          datajudGrau:
            datajudText_(
              source.grau
            ),
          datajudClasse:
            datajudText_(
              source.classe&&
              (
                source.classe.nome||
                source.classe.codigo
              )
            ),
          datajudOrgao:
            datajudText_(
              orgao.nome||
              orgao.nomeOrgao
            ),
          datajudSistema:
            datajudText_(
              source.sistema&&
              (
                source.sistema.nome||
                source.sistema.codigo
              )
            ),
          datajudDataAjuizamento:
            datajudText_(
              source.dataAjuizamento
            ),
          datajudNivelSigilo:
            datajudText_(
              source.nivelSigilo
            ),
          datajudAssuntos:
            JSON.stringify(
              subjects
            ),
          datajudTags:
            JSON.stringify(
              processTags
            ),
          datajudMarcoAtual:
            currentMilestone,
          datajudUltimaMovimentacao:
            latestMovement,
          datajudUltimaAtualizacaoOrigem:
            datajudText_(
              source.dataHoraUltimaAtualizacao||
              source['@timestamp']
            ),
          datajudUltimaConsulta:now,
          datajudStatus:'ATUALIZADO',
          datajudErro:''
        }
      ),
      process.versao
    );

  return {
    ok:true,
    processo:
      datajudProcessPublic_(
        updated
      ),
    novasMovimentacoes:
      newMovements.length,
    tribunal:
      updated.datajudTribunal,
    mensagem:
      newMovements.length
        ?newMovements.length+
          (
            newMovements.length===1
              ?' nova movimentação localizada no DataJud.'
              :' novas movimentações localizadas no DataJud.'
          )
        :'Processo atualizado. Nenhuma movimentação nova foi localizada.'
  };
}
