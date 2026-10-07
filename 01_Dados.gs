let DATA_CACHE = {};
let DATA_INDEX_CACHE_={};
let ROW_INDEX_CACHE_={};
let SPREADSHEET_CACHE_=null;
let SPREADSHEET_CACHE_ID_='';

function resetData_(){
  DATA_CACHE={};
  DATA_INDEX_CACHE_={};
  ROW_INDEX_CACHE_={};
  SPREADSHEET_CACHE_=null;
  SPREADSHEET_CACHE_ID_='';
}

function ss_(){
  const id=props_().getProperty('SPREADSHEET_ID');

  if(!id){
    fail_(
      'Execute instalar pelo editor do Apps Script.'
    );
  }

  if(
    SPREADSHEET_CACHE_&&
    SPREADSHEET_CACHE_ID_===id
  ){
    return SPREADSHEET_CACHE_;
  }

  try{
    SPREADSHEET_CACHE_=
      SpreadsheetApp.openById(
        id
      );
    SPREADSHEET_CACHE_ID_=id;
    return SPREADSHEET_CACHE_;

  }catch(e){
    SPREADSHEET_CACHE_=null;
    SPREADSHEET_CACHE_ID_='';
    fail_('O servidor não conseguiu acessar o banco do Povo das Águas. Verifique SPREADSHEET_ID e as permissões do proprietário.');
  }
}

function headers_(entity){
  if(!SCHEMA[entity])fail_('Entidade inválida.');
  return COMMON.concat(SCHEMA[entity]);
}

/**
 * Mantém compatibilidade com bancos já instalados.
 * Só é permitida migração aditiva no final do cabeçalho.
 * Nenhuma coluna existente é apagada, movida ou renomeada.
 */
function ensureEntitySchema_(entity){
  if(!SCHEMA[entity])fail_('Entidade inválida.');

  const sh=ss_().getSheetByName(entity);
  if(!sh)fail_('Aba não encontrada: '+entity+'.');

  const expected=headers_(entity);
  const lastColumn=sh.getLastColumn();

  if(lastColumn===0){
    sh.getRange(1,1,1,expected.length).setValues([expected]);
    sh.setFrozenRows(1);
    sh.getRange(1,1,1,expected.length).setBackground('#12364a').setFontColor('#ffffff');
    sh.getRange(1,1,sh.getMaxRows(),expected.length).setNumberFormat('@');
    return sh;
  }

  const current=sh.getRange(1,1,1,lastColumn).getDisplayValues()[0];

  if(JSON.stringify(current)===JSON.stringify(expected)){
    return sh;
  }

  const prefixIsCompatible=
    current.length<expected.length&&
    current.every((value,index)=>value===expected[index]);

  if(!prefixIsCompatible){
    fail_('Cabeçalhos alterados: '+entity+'. A migração automática só acrescenta novas colunas ao final.');
  }

  const missing=expected.slice(current.length);
  sh.getRange(1,current.length+1,1,missing.length).setValues([missing]);
  sh.getRange(1,current.length+1,sh.getMaxRows(),missing.length).setNumberFormat('@');
  SpreadsheetApp.flush();
  resetData_();
  return sh;
}

function all_(entity){
  if(DATA_CACHE[entity])return DATA_CACHE[entity];

  const sh=ensureEntitySchema_(entity);
  const rows=sh.getDataRange().getDisplayValues();
  const heads=headers_(entity);

  if(JSON.stringify(rows[0])!==JSON.stringify(heads))fail_('Cabeçalhos alterados: '+entity);

  return DATA_CACHE[entity]=rows
    .slice(1)
    .filter(r=>r[0])
    .map(r=>Object.fromEntries(heads.map((h,i)=>[h,h==='versao'?Number(r[i]):r[i]])));
}

function mapRowToRecord_(entity,row){
  const heads=headers_(entity);

  return Object.fromEntries(
    heads.map((head,index)=>[
      head,
      head==='versao'
        ?Number(row[index])
        :row[index]
    ])
  );
}

function get_(entity,id){
  const wanted=String(id||'');

  if(DATA_CACHE[entity]){
    const found=
      (
        indexBy_(
          entity,
          'id'
        )
          .get(wanted)||
        []
      )[0];

    return found||
      fail_(
        'Registro não encontrado: '+
        entity
      );
  }

  const index=row_(entity,wanted);

  if(index===null){
    fail_('Registro não encontrado: '+entity);
  }

  const sh=ensureEntitySchema_(entity);
  const values=
    sh.getRange(
      index+1,
      1,
      1,
      headers_(entity).length
    )
      .getDisplayValues()[0];

  if(!values||!values[0]){
    fail_('Registro não encontrado: '+entity);
  }

  return mapRowToRecord_(
    entity,
    values
  );
}

function row_(entity,id){
  const wanted=String(id||'');

  if(!ROW_INDEX_CACHE_[entity]){
    ROW_INDEX_CACHE_[entity]=new Map();
  }

  const cache=
    ROW_INDEX_CACHE_[entity];

  if(cache.has(wanted)){
    return cache.get(wanted);
  }

  const sh=
    ensureEntitySchema_(
      entity
    );

  const lastRow=
    Math.max(
      sh.getLastRow(),
      1
    );

  if(lastRow<=1){
    cache.set(wanted,null);
    return null;
  }

  const column=
    sh.getRange(
      2,
      1,
      lastRow-1,
      1
    );

  /*
   * TextFinder executa a busca no serviço do Sheets. Em ambientes de teste
   * ou runtimes sem TextFinder, mantemos fallback para a leitura da coluna.
   */
  if(
    column&&
    typeof column.createTextFinder==='function'
  ){
    try{
      const finder=
        column.createTextFinder(
          wanted
        );

      if(
        finder&&
        typeof finder.matchEntireCell==='function'
      ){
        finder.matchEntireCell(true);
      }

      const match=
        finder&&
        typeof finder.findNext==='function'
          ?finder.findNext()
          :null;

      if(match){
        const index=
          match.getRow()-1;

        cache.set(
          wanted,
          index
        );

        return index;
      }

      cache.set(wanted,null);
      return null;

    }catch(e){}
  }

  const values=
    column.getDisplayValues();

  const localIndex=
    values.findIndex(row=>
      row[0]===wanted
    );

  const index=
    localIndex<0
      ?null
      :localIndex+1;

  cache.set(
    wanted,
    index
  );

  return index;
}

function indexBy_(entity,key){
  const cacheKey=
    entity+'|'+key;

  if(DATA_INDEX_CACHE_[cacheKey]){
    return DATA_INDEX_CACHE_[cacheKey];
  }

  const map=new Map();

  all_(entity)
    .forEach(row=>{
      const value=
        String(
          row[key]||
          ''
        );

      if(!map.has(value)){
        map.set(
          value,
          []
        );
      }

      map.get(value)
        .push(row);
    });

  DATA_INDEX_CACHE_[cacheKey]=map;
  return map;
}

function where_(entity,key,value){
  return (
    indexBy_(
      entity,
      key
    )
      .get(
        String(value||'')
      )||
    []
  );
}

function record_(entity,id,data,before,user){
  const r={
    id,
    versao:before?before.versao+1:1,
    criadoEm:before?before.criadoEm:now_(),
    alteradoEm:now_(),
    usuario:user
  };

  SCHEMA[entity].forEach(k=>r[k]=data[k]===undefined?'':data[k]);
  return r;
}

function change_(ctx,entity,id,data,version){
  const before=
    (
      indexBy_(
        entity,
        'id'
      )
        .get(
          String(id||'')
        )||
      []
    )[0]||
    null;

  if(before&&Number(version)!==before.versao){
    fail_('CONFLITO: o registro mudou. Reabra a ficha antes de salvar.');
  }

  const after=record_(entity,id,data,before,ctx.email);
  ctx.changes.push({entity,before:before||null,after});
  return after;
}

function remove_(ctx,entity,id,version){
  const before=
    (
      indexBy_(
        entity,
        'id'
      )
        .get(
          String(id||'')
        )||
      []
    )[0]||
    null;

  if(!before){
    fail_(
      'Registro não encontrado: '+
      entity
    );
  }

  if(
    Number(version)!==
    before.versao
  ){
    fail_(
      'CONFLITO: o registro mudou. Reabra a ficha antes de excluir.'
    );
  }

  ctx.changes.push({
    entity,
    before,
    after:null
  });

  return before;
}


/** Atualização, exclusão, auditoria e recibo idempotente em uma única transação Sheets. */
function commit_(ctx,result){
  const changes=
    ctx.changes.slice();

  ctx.changes.forEach(c=>{
    const target=
      c.after||
      c.before;

    changes.push({
      entity:'Historico',
      after:record_(
        'Historico',
        uid_(),
        {
          entidade:c.entity,
          registroId:
            target.id,
          antes:
            JSON.stringify(
              ctx.redactDeletionAudit&&
              c.before&&
              c.after===null
                ?{
                    excluido:true,
                    entidade:c.entity
                  }
                :authAuditRecord_(c.entity,c.before)
            ),
          depois:
            JSON.stringify(
              ctx.redactDeletionAudit&&
              c.before&&
              c.after===null
                ?null
                :authAuditRecord_(c.entity,c.after)
            ),
          operacao:ctx.op
        },
        null,
        ctx.email
      )
    });
  });

  changes.push({
    entity:'Operacoes',
    after:record_(
      'Operacoes',
      ctx.op,
      {
        hash:ctx.hash,
        resultado:JSON.stringify(
          result
        )
      },
      null,
      ctx.email
    )
  });

  const deletes=
    changes
      .filter(c=>
        c.before&&
        c.after===null
      )
      .map(c=>{
        const sh=
          ensureEntitySchema_(
            c.entity
          );

        const index=
          row_(
            c.entity,
            c.before.id
          );

        if(index===null){
          fail_(
            'Registro a excluir não localizado: '+
            c.entity
          );
        }

        return {
          entity:c.entity,
          sheetId:sh.getSheetId(),
          index
        };
      })
      .sort((a,b)=>{
        if(a.sheetId!==b.sheetId){
          return a.sheetId-b.sheetId;
        }

        return b.index-a.index;
      });

  const next={};
  const requests=[];

  deletes.forEach(item=>{
    requests.push({
      deleteDimension:{
        range:{
          sheetId:item.sheetId,
          dimension:'ROWS',
          startIndex:item.index,
          endIndex:item.index+1
        }
      }
    });
  });

  changes
    .filter(c=>
      c.after!==null
    )
    .forEach(c=>{
      const sh=
        ensureEntitySchema_(
          c.entity
        );

      let index=
        row_(
          c.entity,
          c.after.id
        );

      if(index===null){
        if(
          next[c.entity]===
          undefined
        ){
          next[c.entity]=
            sh.getLastRow();
        }

        index=
          next[c.entity]++;
      }

      if(
        index>=
        sh.getMaxRows()
      ){
        requests.push({
          appendDimension:{
            sheetId:
              sh.getSheetId(),
            dimension:'ROWS',
            length:
              index-
              sh.getMaxRows()+
              1
          }
        });
      }

      const values=
        headers_(
          c.entity
        ).map(k=>({
          userEnteredValue:{
            stringValue:String(
              c.after[k]===
                undefined
                ?''
                :c.after[k]
            )
          }
        }));

      requests.push({
        updateCells:{
          range:{
            sheetId:
              sh.getSheetId(),
            startRowIndex:index,
            endRowIndex:index+1,
            startColumnIndex:0,
            endColumnIndex:
              values.length
          },
          rows:[
            {
              values
            }
          ],
          fields:
            'userEnteredValue'
        }
      });
    });

  Sheets.Spreadsheets.batchUpdate(
    {
      requests
    },
    ss_().getId()
  );

  SpreadsheetApp.flush();
  resetData_();

  /*
   * Invalida logicamente caches de leitura compartilhados. As chaves
   * antigas expiram sozinhas; novas leituras passam a usar outra revisão.
   */
  props_().setProperty(
    'PDA_DATA_REVISION',
    uid_()
  );

  return result;
}

function version_(row,expected){
  if(row.versao!==Number(expected))fail_('CONFLITO: registro alterado por outro usuário. Reabra a ficha.');
}

function touch_(ctx,a){
  return change_(
    ctx,
    'Atendimentos',
    a.id,
    Object.assign({},a,{
      revisao:Number(a.revisao||0)+1,
      conferencia:'',
      situacao:'EM_PREPARACAO'
    }),
    a.versao
  );
}

function snapshot_(a,p){
  return hash_({
    atendimento:a,
    pessoa:p,
    documentos:effectiveDocs_(a),
    pendencias:all_('Pendencias').filter(d=>d.atendimentoId===a.id)
  });
}

