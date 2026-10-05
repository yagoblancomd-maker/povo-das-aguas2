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

function uniqueSeguroDefesoValues_(registros,key){
  const values=[];

  (registros||[]).forEach(r=>{
    const value=String(r&&r[key]||'').trim();

    if(
      value&&
      !values.includes(value)
    ){
      values.push(value);
    }
  });

  return values;
}

function seguroDefesoJoin_(values,separator){
  return (values||[])
    .filter(Boolean)
    .join(separator||' · ');
}

function seguroDefesoBeneficiaryRows_(consulta){
  const registros=consulta.registros||[];
  const first=registros[0]||{};

  const nomes=uniqueSeguroDefesoValues_(registros,'nome');
  const cpfs=uniqueSeguroDefesoValues_(registros,'cpfFormatado');
  const nis=uniqueSeguroDefesoValues_(registros,'nis');
  const rgps=uniqueSeguroDefesoValues_(registros,'rgp');
  const municipios=uniqueSeguroDefesoValues_(registros,'nomeIBGE');
  const ufs=uniqueSeguroDefesoValues_(registros,'ufSigla');
  const ufNomes=uniqueSeguroDefesoValues_(registros,'ufNome');
  const ibges=uniqueSeguroDefesoValues_(registros,'codigoIBGE');
  const regioes=uniqueSeguroDefesoValues_(registros,'nomeRegiao');
  const codigosRegiao=uniqueSeguroDefesoValues_(registros,'codigoRegiao');
  const paises=uniqueSeguroDefesoValues_(registros,'pais');
  const portarias=uniqueSeguroDefesoValues_(registros,'portaria');

  return [
    ['Nome',seguroDefesoJoin_(nomes)||first.nome||'—'],
    [
      'CPF / NIS',
      [
        seguroDefesoJoin_(cpfs),
        seguroDefesoJoin_(nis)
      ].filter(Boolean).join(' / ')||'—'
    ],
    ['RGP',seguroDefesoJoin_(rgps)||'—'],
    [
      'Município / UF',
      [
        seguroDefesoJoin_(municipios),
        seguroDefesoJoin_(ufs)
      ].filter(Boolean).join(' / ')||'—'
    ],
    [
      'UF / Região / País',
      [
        seguroDefesoJoin_(ufNomes),
        [
          seguroDefesoJoin_(codigosRegiao),
          seguroDefesoJoin_(regioes)
        ].filter(Boolean).join(' - '),
        seguroDefesoJoin_(paises)
      ].filter(Boolean).join(' · ')||'—'
    ],
    ['Código IBGE',seguroDefesoJoin_(ibges)||'—'],
    ['Portaria',seguroDefesoJoin_(portarias,' | ')||'—']
  ];
}

function seguroDefesoPaymentRows_(consulta){
  return (consulta.registros||[]).map(r=>[
    String(r.parcela||'—'),
    reportDateBR_(r.dataMesReferencia)||'—',
    reportDateBR_(r.dataEmissaoParcela)||'—',
    reportDateBR_(r.dataSaque)||'—',
    String(r.situacao||'—'),
    reportMoneyBR_(r.valor),
    String(r.id||'—')
  ]);
}

function cmToPt_(cm){
  return Number(cm||0)*28.3464567;
}

function povoDasAguasLogoBlob_(){
  try{
    const html=HtmlService
      .createHtmlOutputFromFile('Logo')
      .getContent();

    const match=html.match(
      /src=["']data:image\/([^;]+);base64,([^"']+)["']/i
    );

    if(!match){
      return null;
    }

    const mime=
      String(match[1]||'jpeg')
        .toLowerCase();

    const contentType=
      mime==='png'
        ?'image/png'
        :'image/jpeg';

    return Utilities.newBlob(
      Utilities.base64Decode(match[2]),
      contentType,
      'Povo das Águas'
    );
  }catch(e){
    return null;
  }
}

function clearContainer_(container){
  while(container.getNumChildren()>0){
    container.removeChild(
      container.getChild(0)
    );
  }
}

function appendSeguroDefesoHeader_(doc){
  let header=doc.getHeader();

  if(!header){
    header=doc.addHeader();
  }

  clearContainer_(header);

  const table=header.appendTable([
    ['', '']
  ]);

  const row=table.getRow(0);
  const logoCell=row.getCell(0);
  const titleCell=row.getCell(1);

  logoCell.setBackgroundColor('#EAF4F6');
  titleCell.setBackgroundColor('#EAF4F6');

  const logoBlob=
    povoDasAguasLogoBlob_();

  if(logoBlob){
    const logo=
      logoCell.appendImage(
        logoBlob
      );

    logo.setWidth(46);
    logo.setHeight(46);
  }else{
    const fallback=
      logoCell.appendParagraph(
        'POVO DAS ÁGUAS'
      );

    fallback.setAlignment(
      DocumentApp.HorizontalAlignment.CENTER
    );

    fallback
      .editAsText()
      .setBold(true)
      .setFontSize(8)
      .setForegroundColor('#123E52');
  }

  const project=
    titleCell.appendParagraph(
      'POVO DAS ÁGUAS'
    );

  project.setSpacingBefore(0);
  project.setSpacingAfter(0);
  project.setAlignment(
    DocumentApp.HorizontalAlignment.CENTER
  );

  project
    .editAsText()
    .setBold(true)
    .setFontSize(13)
    .setForegroundColor('#123E52');

  const subtitle=
    titleCell.appendParagraph(
      'CIDIJUS · Cadastro, atendimento e preparação de minutas'
    );

  subtitle.setSpacingBefore(0);
  subtitle.setSpacingAfter(1);
  subtitle.setAlignment(
    DocumentApp.HorizontalAlignment.CENTER
  );

  subtitle
    .editAsText()
    .setFontSize(7.5)
    .setForegroundColor('#466270');

  const reportTitle=
    titleCell.appendParagraph(
      'RELATÓRIO DE CONSULTA — SEGURO-DEFESO 2025'
    );

  reportTitle.setSpacingBefore(1);
  reportTitle.setSpacingAfter(0);
  reportTitle.setAlignment(
    DocumentApp.HorizontalAlignment.CENTER
  );

  reportTitle
    .editAsText()
    .setBold(true)
    .setFontSize(9.5)
    .setForegroundColor('#123E52');
}

function appendJustifiedParagraph_(body,text,size,bold){
  const p=body.appendParagraph(
    String(text||'')
  );

  p.setSpacingBefore(0);
  p.setSpacingAfter(3);
  p.setLineSpacing(1.05);
  p.setAlignment(
    DocumentApp.HorizontalAlignment.JUSTIFY
  );

  const t=p.editAsText();
  t.setFontSize(size||8.5);

  if(bold){
    t.setBold(true);
  }

  return p;
}

function appendSectionTitle_(body,text){
  const p=body.appendParagraph(
    String(text||'')
  );

  p.setSpacingBefore(4);
  p.setSpacingAfter(3);

  p.editAsText()
    .setBold(true)
    .setFontSize(9)
    .setForegroundColor('#123E52');

  return p;
}

function styleSeguroDefesoLabelValueTable_(table){
  for(let r=0;r<table.getNumRows();r++){
    const row=table.getRow(r);

    for(let c=0;c<row.getNumCells();c++){
      const cell=row.getCell(c);
      const text=cell.editAsText();

      text.setFontSize(7.8);

      if(c===0){
        text.setBold(true);
        cell.setBackgroundColor('#F1F7F8');
      }else{
        cell.setBackgroundColor('#FFFFFF');
      }
    }
  }
}

function styleSeguroDefesoSummaryTable_(table){
  const row=table.getRow(0);

  for(let c=0;c<row.getNumCells();c++){
    const cell=row.getCell(c);
    const text=cell.editAsText();

    text.setFontSize(7.8);

    if(c%2===0){
      text.setBold(true);
      cell.setBackgroundColor('#E7F1F3');
    }else{
      cell.setBackgroundColor('#FFFFFF');
    }
  }
}

function styleSeguroDefesoPaymentsTable_(table){
  for(let r=0;r<table.getNumRows();r++){
    const row=table.getRow(r);

    for(let c=0;c<row.getNumCells();c++){
      const cell=row.getCell(c);
      const text=cell.editAsText();

      text.setFontSize(7.4);

      if(r===0){
        text.setBold(true);
        cell.setBackgroundColor('#E7F1F3');
      }else{
        cell.setBackgroundColor(
          r%2===0
            ?'#F8FBFC'
            :'#FFFFFF'
        );
      }
    }
  }
}

function renderSeguroDefesoReport_(doc,p,consulta){
  const body=doc.getBody();
  body.clear();

  /*
   * 2 cm em todos os lados.
   */
  body.setMarginTop(
    cmToPt_(2)
  );
  body.setMarginBottom(
    cmToPt_(2)
  );
  body.setMarginLeft(
    cmToPt_(2)
  );
  body.setMarginRight(
    cmToPt_(2)
  );

  appendSeguroDefesoHeader_(
    doc
  );

  appendJustifiedParagraph_(
    body,
    'Interessado(a): '+
      String(p.nome||'').toUpperCase()+
      '. CPF: '+
      cpfDisplay_(p.cpf)+
      '.',
    9,
    true
  );

  appendJustifiedParagraph_(
    body,
    'Período de referência considerado: 01/01/2025 a 31/12/2025. '+
      'Consulta realizada em '+
      Utilities.formatDate(
        new Date(consulta.consultadoEm),
        PDA.tz,
        'dd/MM/yyyy HH:mm:ss'
      )+
      ' por meio da API oficial do Portal da Transparência do Governo Federal, mantido pela Controladoria-Geral da União.',
    8,
    false
  );

  const summary=body.appendTable([
    [
      'Registros em 2025',
      String(consulta.quantidade),
      'Valor localizado',
      reportMoneyBR_(consulta.valorTotal),
      'Fora do período',
      String(consulta.registrosForaPeriodo)
    ]
  ]);

  styleSeguroDefesoSummaryTable_(
    summary
  );

  if(!consulta.registros.length){
    appendSectionTitle_(
      body,
      'RESULTADO DA CONSULTA'
    );

    appendJustifiedParagraph_(
      body,
      'Não foram localizados registros com mês de referência entre 01/01/2025 e 31/12/2025 para o CPF consultado.',
      8,
      false
    );

  }else{
    appendSectionTitle_(
      body,
      'DADOS RETORNADOS PELA BASE OFICIAL'
    );

    const beneficiaryTable=
      body.appendTable(
        seguroDefesoBeneficiaryRows_(
          consulta
        )
      );

    styleSeguroDefesoLabelValueTable_(
      beneficiaryTable
    );

    appendSectionTitle_(
      body,
      'PARCELAS LOCALIZADAS EM 2025'
    );

    const paymentTable=
      body.appendTable(
        [
          [
            'Parcela',
            'Mês ref.',
            'Emissão',
            'Saque',
            'Situação',
            'Valor',
            'ID API'
          ]
        ].concat(
          seguroDefesoPaymentRows_(
            consulta
          )
        )
      );

    styleSeguroDefesoPaymentsTable_(
      paymentTable
    );
  }

  appendSectionTitle_(
    body,
    'FONTE'
  );

  appendJustifiedParagraph_(
    body,
    'Portal da Transparência do Governo Federal — Controladoria-Geral da União. Endpoint consultado: '+
      consulta.endpoint+
      '.',
    7.3,
    false
  );

  appendJustifiedParagraph_(
    body,
    'O relatório registra apenas o conteúdo disponibilizado pela API oficial no momento da consulta.',
    7.3,
    false
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

    const createdId=doc.getId();
    doc.saveAndClose();

    docFile=DriveApp.getFileById(
      createdId
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
