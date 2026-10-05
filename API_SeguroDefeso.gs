const PORTAL_TRANSPARENCIA_API_KEY_PROPERTY='PORTAL_TRANSPARENCIA_API_KEY';
const SEGURO_DEFESO_API_URL='https://api.portaldatransparencia.gov.br/api-de-dados/seguro-defeso-codigo';
const SEGURO_DEFESO_PERIODO_INICIO='2025-01-01';
const SEGURO_DEFESO_PERIODO_FIM='2025-12-31';

function portalTransparenciaStatus_(){
  return {
    configurada:!!String(
      props_().getProperty(PORTAL_TRANSPARENCIA_API_KEY_PROPERTY)||''
    ).trim(),
    fonte:'Portal da Transparência do Governo Federal — Controladoria-Geral da União',
    endpoint:SEGURO_DEFESO_API_URL
  };
}

function portalApiKeySave_(ctx,q){
  const key=String(q.chave||'').trim();

  if(key.length<8){
    fail_('Informe uma chave válida da API do Portal da Transparência.');
  }

  props_().setProperty(
    PORTAL_TRANSPARENCIA_API_KEY_PROPERTY,
    key
  );

  ctx.effects.push(
    'Chave da API do Portal da Transparência atualizada nas propriedades do script.'
  );

  return {
    configurada:true,
    mensagem:'Chave da API do Portal da Transparência salva com segurança.'
  };
}

function portalApiKey_(){
  const key=String(
    props_().getProperty(PORTAL_TRANSPARENCIA_API_KEY_PROPERTY)||''
  ).trim();

  if(!key){
    fail_(
      'A chave da API do Portal da Transparência não está configurada. '+
      'Informe a chave em Administração.'
    );
  }

  return key;
}

function seguroDefesoCodigo_(value){
  const codigo=String(value||'').replace(/\D/g,'');

  if(!/^\d{11}$/.test(codigo)){
    fail_('Informe um CPF/NIS com 11 dígitos para consultar o Seguro-Defeso.');
  }

  return codigo;
}

function apiContentText_(response){
  const headers=response.getAllHeaders();
  const contentType=String(
    headers['Content-Type']||
    headers['content-type']||
    ''
  );

  try{
    if(/iso-8859-1/i.test(contentType)){
      return response.getContentText('ISO-8859-1');
    }
  }catch(e){}

  return response.getContentText();
}

function seguroDefesoApiPage_(codigo,pagina,key){
  const url=
    SEGURO_DEFESO_API_URL+
    '?codigo='+
    encodeURIComponent(codigo)+
    '&pagina='+
    encodeURIComponent(String(pagina));

  const response=UrlFetchApp.fetch(
    url,
    {
      method:'get',
      headers:{
        accept:'application/json',
        'chave-api-dados':key
      },
      muteHttpExceptions:true,
      followRedirects:true
    }
  );

  const code=response.getResponseCode();
  const text=apiContentText_(response);

  if(code===401){
    fail_(
      'A API do Portal da Transparência recusou a autenticação. '+
      'Confira a chave cadastrada em Administração.'
    );
  }

  if(code===400){
    fail_(
      'A API do Portal da Transparência recusou os parâmetros da consulta.'
    );
  }

  if(code<200||code>=300){
    fail_(
      'Falha ao consultar a API do Portal da Transparência. HTTP '+
      code+
      '.'
    );
  }

  let data;

  try{
    data=JSON.parse(text||'[]');
  }catch(e){
    fail_(
      'A API do Portal da Transparência retornou uma resposta que não pôde ser interpretada.'
    );
  }

  if(!Array.isArray(data)){
    fail_(
      'A API do Portal da Transparência retornou um formato inesperado.'
    );
  }

  return data;
}

function seguroDefesoFlatten_(row){
  const pessoa=row&&row.pessoaSeguroDefeso||{};
  const municipio=row&&row.municipio||{};
  const uf=municipio.uf||{};

  return {
    id:String(row&&row.id!==undefined?row.id:''),
    cpfFormatado:String(pessoa.cpfFormatado||''),
    nis:String(pessoa.nis||''),
    nome:String(pessoa.nome||''),
    codigoIBGE:String(municipio.codigoIBGE||''),
    nomeIBGE:String(municipio.nomeIBGE||''),
    codigoRegiao:String(municipio.codigoRegiao||''),
    nomeRegiao:String(municipio.nomeRegiao||''),
    pais:String(municipio.pais||''),
    ufSigla:String(uf.sigla||''),
    ufNome:String(uf.nome||''),
    portaria:String(row&&row.portaria||''),
    dataMesReferencia:String(row&&row.dataMesReferencia||''),
    dataSaque:String(row&&row.dataSaque||''),
    dataEmissaoParcela:String(row&&row.dataEmissaoParcela||''),
    situacao:String(row&&row.situacao||''),
    rgp:String(row&&row.rgp||''),
    parcela:String(row&&row.parcela||''),
    valor:Number(row&&row.valor||0)
  };
}

function seguroDefesoConsulta_(codigoInput){
  const codigo=seguroDefesoCodigo_(codigoInput);
  const key=portalApiKey_();
  const all=[];
  const seenPages=new Set();
  let paginas=0;

  for(let pagina=1;pagina<=100;pagina++){
    const rows=seguroDefesoApiPage_(
      codigo,
      pagina,
      key
    );

    paginas=pagina;

    if(!rows.length){
      break;
    }

    const signature=hash_(
      rows.map(row=>[
        row&&row.id,
        row&&row.dataMesReferencia,
        row&&row.parcela,
        row&&row.valor
      ])
    );

    if(seenPages.has(signature)){
      break;
    }

    seenPages.add(signature);
    all.push(...rows);

    Utilities.sleep(80);
  }

  const periodo=all
    .filter(row=>{
      const ref=String(row&&row.dataMesReferencia||'').slice(0,10);
      return (
        ref>=SEGURO_DEFESO_PERIODO_INICIO&&
        ref<=SEGURO_DEFESO_PERIODO_FIM
      );
    })
    .map(seguroDefesoFlatten_)
    .sort((a,b)=>{
      const byDate=String(a.dataMesReferencia||'')
        .localeCompare(String(b.dataMesReferencia||''));

      if(byDate!==0)return byDate;

      return String(a.parcela||'')
        .localeCompare(
          String(b.parcela||''),
          'pt-BR',
          {numeric:true}
        );
    });

  const total=periodo.reduce(
    (sum,row)=>sum+Number(row.valor||0),
    0
  );

  return {
    fonte:'Portal da Transparência do Governo Federal — Controladoria-Geral da União',
    endpoint:SEGURO_DEFESO_API_URL,
    codigoConsultado:codigo,
    consultadoEm:now_(),
    periodoInicio:SEGURO_DEFESO_PERIODO_INICIO,
    periodoFim:SEGURO_DEFESO_PERIODO_FIM,
    paginasConsultadas:paginas,
    registrosRecebidos:all.length,
    registrosForaPeriodo:all.length-periodo.length,
    quantidade:periodo.length,
    valorTotal:total,
    registros:periodo
  };
}

function seguroDefesoConsultar_(q){
  required_(q.codigo,'CPF/NIS');
  return seguroDefesoConsulta_(q.codigo);
}

function reportDateBR_(value){
  const s=String(value||'').slice(0,10);

  if(!/^\d{4}-\d{2}-\d{2}$/.test(s)){
    return String(value||'');
  }

  return s.slice(8,10)+'/'+s.slice(5,7)+'/'+s.slice(0,4);
}

function reportMoneyBR_(value){
  return 'R$ '+Number(value||0).toLocaleString(
    'pt-BR',
    {
      minimumFractionDigits:2,
      maximumFractionDigits:2
    }
  );
}

function seguroDefesoReportBaseName_(p){
  return safeName_(
    'RELATORIO.SEGURO_DEFESO_2025.'+
    String(p.nome||'').toUpperCase()
  );
}

function findSeguroDefesoReportFile_(folder,marker,mime){
  const iterator=folder.getFiles();

  while(iterator.hasNext()){
    const file=iterator.next();

    if(
      !file.isTrashed()&&
      file.getMimeType()===mime&&
      String(file.getDescription()||'')===marker
    ){
      return file;
    }
  }

  return null;
}

function seguroDefesoReportRows_(consulta){
  return consulta.registros.map(r=>[
    r.id,
    r.cpfFormatado,
    r.nis,
    r.nome,
    r.codigoIBGE,
    r.nomeIBGE,
    r.codigoRegiao,
    r.nomeRegiao,
    r.pais,
    r.ufSigla,
    r.ufNome,
    r.portaria,
    reportDateBR_(r.dataMesReferencia),
    reportDateBR_(r.dataSaque),
    reportDateBR_(r.dataEmissaoParcela),
    r.situacao,
    r.rgp,
    r.parcela,
    reportMoneyBR_(r.valor)
  ]);
}

function renderSeguroDefesoReport_(doc,p,consulta){
  const body=doc.getBody();
  body.clear();

  body.appendParagraph(
    'RELATÓRIO DE CONSULTA — SEGURO-DEFESO 2025'
  ).setHeading(
    DocumentApp.ParagraphHeading.HEADING1
  );

  body.appendParagraph(
    'Pessoa: '+
    String(p.nome||'').toUpperCase()
  );

  body.appendParagraph(
    'CPF: '+
    cpfDisplay_(p.cpf)
  );

  body.appendParagraph(
    'Período de referência considerado: 01/01/2025 a 31/12/2025.'
  );

  body.appendParagraph(
    'Consulta realizada em '+
    Utilities.formatDate(
      new Date(consulta.consultadoEm),
      PDA.tz,
      'dd/MM/yyyy HH:mm:ss'
    )+
    ' por meio da API oficial do Portal da Transparência do Governo Federal, '+
    'mantido pela Controladoria-Geral da União. Os valores, situações, datas e '+
    'demais informações abaixo reproduzem os registros disponibilizados pelos '+
    'portais oficiais na data e hora desta consulta.'
  );

  body.appendParagraph(
    'Endpoint oficial consultado: '+
    consulta.endpoint
  );

  body.appendParagraph(
    'Registros recebidos pela API: '+
    consulta.registrosRecebidos+
    '. Registros dentro do período de referência de 2025: '+
    consulta.quantidade+
    '. Registros fora do período de 2025 desconsiderados neste relatório: '+
    consulta.registrosForaPeriodo+
    '.'
  );

  body.appendParagraph(
    'Valor total dos registros de 2025 localizados: '+
    reportMoneyBR_(consulta.valorTotal)+
    '.'
  ).setHeading(
    DocumentApp.ParagraphHeading.HEADING2
  );

  if(!consulta.registros.length){
    body.appendParagraph(
      'Nenhum registro com data de mês de referência entre 01/01/2025 e 31/12/2025 foi localizado nesta consulta.'
    );

  }else{
    const headers=[
      'ID',
      'CPF',
      'NIS',
      'Nome',
      'Código IBGE',
      'Município',
      'Código Região',
      'Região',
      'País',
      'UF',
      'Nome UF',
      'Portaria',
      'Mês de referência',
      'Data do saque',
      'Data de emissão da parcela',
      'Situação',
      'RGP',
      'Parcela',
      'Valor'
    ];

    const table=body.appendTable(
      [headers].concat(
        seguroDefesoReportRows_(consulta)
      )
    );

    const headerRow=table.getRow(0);

    for(let i=0;i<headerRow.getNumCells();i++){
      headerRow
        .getCell(i)
        .editAsText()
        .setBold(true);
    }
  }

  body.appendParagraph(
    'Observação: a inexistência de registro nesta consulta, isoladamente, não é tratada pelo sistema como prova conclusiva de ausência de pagamento. O relatório registra apenas o conteúdo disponibilizado pela API oficial no momento da consulta.'
  );

  doc.saveAndClose();
}

function seguroDefesoRelatorioGerar_(ctx,q){
  required_(q.pessoaId,'pessoa');

  const p=get_('Pessoas',q.pessoaId);
  const consulta=seguroDefesoConsulta_(p.cpf);
  const folder=personFolder_(p);
  const baseName=seguroDefesoReportBaseName_(p);
  const docMarker='PDA_SEGDEF_DOC_OP:'+ctx.op;
  const pdfMarker='PDA_SEGDEF_PDF_OP:'+ctx.op;

  let docFile=findSeguroDefesoReportFile_(
    folder,
    docMarker,
    MimeType.GOOGLE_DOCS
  );

  if(!docFile){
    const doc=DocumentApp.create(
      baseName+' - EM GERAÇÃO'
    );

    docFile=DriveApp.getFileById(
      doc.getId()
    );

    docFile.moveTo(folder);
    docFile.setDescription(docMarker);

    ctx.effects.push(
      'Relatório Seguro-Defeso criado no Drive: '+
      docFile.getUrl()
    );
  }

  const doc=openDocument_(
    docFile.getId()
  );

  renderSeguroDefesoReport_(
    doc,
    p,
    consulta
  );

  if(docFile.getName()!==baseName){
    docFile.setName(baseName);
  }

  let pdfFile=findSeguroDefesoReportFile_(
    folder,
    pdfMarker,
    MimeType.PDF
  );

  if(!pdfFile){
    pdfFile=folder.createFile(
      docFile
        .getAs(MimeType.PDF)
        .setName(baseName+'.pdf')
    );

    pdfFile.setDescription(pdfMarker);

    ctx.effects.push(
      'PDF do relatório Seguro-Defeso criado no Drive: '+
      pdfFile.getUrl()
    );
  }

  if(pdfFile.getName()!==baseName+'.pdf'){
    pdfFile.setName(baseName+'.pdf');
  }

  const sameDocs=folder.getFilesByName(baseName);

  while(sameDocs.hasNext()){
    const current=sameDocs.next();

    if(
      current.getId()!==docFile.getId()&&
      current.getMimeType()===MimeType.GOOGLE_DOCS
    ){
      current.setTrashed(true);
    }
  }

  const samePdfs=folder.getFilesByName(baseName+'.pdf');

  while(samePdfs.hasNext()){
    const current=samePdfs.next();

    if(
      current.getId()!==pdfFile.getId()&&
      current.getMimeType()===MimeType.PDF
    ){
      current.setTrashed(true);
    }
  }

  return Object.assign(
    {},
    consulta,
    {
      relatorio:{
        nome:baseName,
        fileId:docFile.getId(),
        url:docFile.getUrl(),
        pdfFileId:pdfFile.getId(),
        pdfUrl:pdfFile.getUrl()
      }
    }
  );
}
