const PERSON_TEMPLATE_PLACEHOLDERS=[
  'NOME_COMPLETO',
  'CPF',
  'ENDERECO',
  'CIDADE_UF',
  'TELEFONE',
  'PARCELAS_NAO_RECEBIDAS',
  'VALOR_CAUSA'
];

const TEMPLATE_PLACEHOLDER_ALIASES={
  'NOME COMPLETO':'NOME_COMPLETO',
  'ENDEREÇO':'ENDERECO',
  'ENDERECO':'ENDERECO',
  'CIDADE':'CIDADE_UF',
  'PARCELAS QUE NÃO RECEBEU':'PARCELAS_NAO_RECEBIDAS',
  'PARCELAS QUE NAO RECEBEU':'PARCELAS_NAO_RECEBIDAS',
  '##VALOR':'VALOR_CAUSA'
};

function docParts_(doc){
  const parts=[];

  if(typeof doc.getTabs==='function'&&DocumentApp.TabType){
    function visit(tab){
      if(tab.getType()===DocumentApp.TabType.DOCUMENT_TAB){
        const d=tab.asDocumentTab();
        parts.push(d.getBody());
        if(d.getHeader())parts.push(d.getHeader());
        if(d.getFooter())parts.push(d.getFooter());
      }

      tab.getChildTabs().forEach(visit);
    }

    doc.getTabs().forEach(visit);
  }else{
    parts.push(doc.getBody());
    if(doc.getHeader())parts.push(doc.getHeader());
    if(doc.getFooter())parts.push(doc.getFooter());
  }

  return parts;
}

function tokens_(parts){
  return parts.flatMap(p=>p.getText().match(/<<[^<>]+>>/g)||[]);
}

function regexEscape_(value){
  const special=['\\','^','$','.','|','?','*','+','(',')','[',']','{','}'];

  return String(value)
    .split('')
    .map(ch=>special.includes(ch)?'\\\\'+ch:ch)
    .join('');
}

function openDocument_(id){
  let lastError=null;

  for(let i=0;i<6;i++){
    try{
      return DocumentApp.openById(id);
    }catch(e){
      lastError=e;
      Utilities.sleep(300);
    }
  }

  throw lastError||new Error('Não foi possível abrir o Google Docs.');
}

function replaceToken_(parts,key,value){
  const token='<<'+key+'>>';
  const pattern=regexEscape_(token);
  const replacement=String(value===undefined||value===null?'':value);

  parts.forEach(part=>{
    let found=part.findText(pattern);

    while(found){
      const text=found.getElement().asText();
      const start=found.getStartOffset();
      const end=found.getEndOffsetInclusive();
      const attrs=text.getAttributes(start);

      text.deleteText(start,end);
      text.insertText(start,replacement);

      if(replacement.length){
        text.setAttributes(start,start+replacement.length-1,attrs);
      }

      found=part.findText(pattern);
    }
  });
}

function normalizeTemplatePlaceholders_(doc){
  const parts=docParts_(doc);

  Object.keys(TEMPLATE_PLACEHOLDER_ALIASES).forEach(alias=>{
    const canonical=TEMPLATE_PLACEHOLDER_ALIASES[alias];
    const from='<<'+alias+'>>';
    const to='<<'+canonical+'>>';

    if(from===to)return;

    parts.forEach(part=>{
      part.replaceText(regexEscape_(from),to);
    });
  });

  return parts;
}

function validatePersonTemplate_(id){
  required_(id,'modelo Google Docs');

  const file=DriveApp.getFileById(id);

  if(file.getMimeType()!==MimeType.GOOGLE_DOCS){
    fail_('Modelo deve ser Google Docs.');
  }

  const doc=openDocument_(id);
  const parts=normalizeTemplatePlaceholders_(doc);
  const found=tokens_(parts);

  const missing=PERSON_TEMPLATE_PLACEHOLDERS.filter(
    key=>!found.includes('<<'+key+'>>')
  );

  const unknown=[...new Set(found.filter(
    token=>!PERSON_TEMPLATE_PLACEHOLDERS.includes(token.slice(2,-2))
  ))];

  if(missing.length||unknown.length){
    doc.saveAndClose();

    fail_(
      'Modelo incompatível. Ausentes: '+(missing.join(', ')||'nenhum')+
      '; desconhecidos: '+(unknown.join(', ')||'nenhum')+'.'
    );
  }

  doc.saveAndClose();
  return true;
}

function templatesFolder_(){
  const root=DriveApp.getFolderById(PDA.parent);
  const iterator=root.getFoldersByName('MODELOS');
  const folder=iterator.hasNext()?iterator.next():root.createFolder('MODELOS');

  if(iterator.hasNext()){
    fail_('Há mais de uma pasta MODELOS na raiz do Povo das Águas.');
  }

  return folder;
}

function activeTemplate_(){
  const configured=String(cfg_().templateId||'').trim();

  if(configured){
    try{
      const file=DriveApp.getFileById(configured);

      if(
        !file.isTrashed()&&
        file.getMimeType()===MimeType.GOOGLE_DOCS
      ){
        return file;
      }
    }catch(e){}
  }

  const folder=templatesFolder_();
  const iterator=folder.getFilesByName(SEGURO_DEFESO_2025.modeloNome);
  const found=[];

  while(iterator.hasNext()){
    const file=iterator.next();

    if(
      !file.isTrashed()&&
      file.getMimeType()===MimeType.GOOGLE_DOCS
    ){
      found.push(file);
    }
  }

  if(found.length>1){
    fail_(
      'Há mais de um modelo ativo chamado "'+
      SEGURO_DEFESO_2025.modeloNome+
      '" na pasta MODELOS.'
    );
  }

  if(!found.length){
    fail_(
      'Nenhum modelo de minuta está ativo. Envie o arquivo DOCX em Administração > Modelo de minuta.'
    );
  }

  return found[0];
}

function templateStatus_(){
  try{
    const file=activeTemplate_();

    return {
      configurado:true,
      id:file.getId(),
      nome:file.getName(),
      url:file.getUrl(),
      alteradoEm:file.getLastUpdated().toISOString()
    };

  }catch(e){
    return {
      configurado:false,
      id:'',
      nome:'',
      url:'',
      alteradoEm:'',
      mensagem:e.message||String(e)
    };
  }
}

function parcelasText_(value){
  const n=parcelasDefeso_(value);

  return {
    1:'1 (uma) parcela',
    2:'2 (duas) parcelas',
    3:'3 (três) parcelas',
    4:'4 (quatro) parcelas'
  }[n];
}

function personDraftValues_(p){
  const qtd=parcelasDefeso_(p.parcelasNaoRecebidas);

  return {
    NOME_COMPLETO:p.nome||'',
    CPF:cpfDisplay_(p.cpf),
    ENDERECO:address_(p),
    CIDADE_UF:[p.cidade,p.uf].filter(Boolean).join('/'),
    TELEFONE:p.telefone||'',
    PARCELAS_NAO_RECEBIDAS:parcelasText_(qtd),
    VALOR_CAUSA:moneyBR_(valorCausaDefeso_(qtd))
  };
}

function values_(a,p){
  return personDraftValues_(p);
}

function fillTemplateCopy_(file,p){
  const doc=openDocument_(file.getId());
  const parts=normalizeTemplatePlaceholders_(doc);
  const map=personDraftValues_(p);

  Object.keys(map).forEach(
    key=>replaceToken_(parts,key,map[key])
  );

  const remaining=tokens_(parts);

  if(remaining.length){
    doc.saveAndClose();

    fail_(
      'Minuta incompleta. Permaneceram placeholders: '+
      [...new Set(remaining)].join(', ')+
      '.'
    );
  }

  doc.saveAndClose();
  return file;
}

function findFileByOperation_(folder,op){
  const iterator=folder.getFiles();
  const marker='PDA_OP:'+op;

  while(iterator.hasNext()){
    const file=iterator.next();

    if(
      !file.isTrashed()&&
      String(file.getDescription()||'')===marker
    ){
      return file;
    }
  }

  return null;
}

function generatePersonDraft_(ctx,p){
  const template=activeTemplate_();
  validatePersonTemplate_(template.getId());

  const folder=personFolder_(p);
  const finalName='MINUTA.'+safeName_(p.nome);

  let file=findFileByOperation_(folder,ctx.op);

  if(!file){
    file=template.makeCopy(finalName+' - EM GERAÇÃO',folder);
    file.setDescription('PDA_OP:'+ctx.op);
    ctx.effects.push('Cópia de minuta criada no Drive: '+file.getUrl());
  }

  fillTemplateCopy_(file,p);

  const existing=folder.getFilesByName(finalName);
  const old=[];

  while(existing.hasNext()){
    const current=existing.next();

    if(current.getId()!==file.getId()){
      old.push(current);
    }
  }

  old.forEach(current=>current.setTrashed(true));

  if(file.getName()!==finalName){
    file.setName(finalName);
  }

  return {
    fileId:file.getId(),
    url:file.getUrl(),
    nome:file.getName(),
    parcelas:Number(p.parcelasNaoRecebidas),
    salarioMinimo:SEGURO_DEFESO_2025.salarioMinimo,
    valorCausa:valorCausaDefeso_(p.parcelasNaoRecebidas),
    templateId:template.getId()
  };
}

function generate_(ctx,q){
  const a=get_('Atendimentos',q.id);
  version_(a,q.versao);

  if(a.demanda!=='Seguro-Defeso 2025'){
    fail_('Não existe modelo aprovado para esta demanda.');
  }

  const errors=eligibility_(a,true);

  if(a.situacao!=='CONFERIDO'){
    errors.push('Atendimento deve estar conferido.');
  }

  if(errors.length){
    fail_(errors.join('\n'));
  }

  const p=get_('Pessoas',a.pessoaId);
  const template=activeTemplate_();

  validatePersonTemplate_(template.getId());

  const folder=folder_(a);
  const mid=id_('MIN',ctx.op);
  const name='MINUTA_'+a.id+'_'+mid;
  const iterator=folder.getFilesByName(name);
  let file=iterator.hasNext()?iterator.next():null;

  if(iterator.hasNext()){
    fail_('Cópias duplicadas; reconciliação necessária.');
  }

  if(!file){
    file=template.makeCopy(name,folder);
    file.setDescription('PDA_OP:'+ctx.op);
    ctx.effects.push('Cópia de minuta no Drive: '+file.getUrl());
  }

  fillTemplateCopy_(file,p);

  const number=all_('Minutas').filter(m=>m.atendimentoId===a.id).length+1;

  return change_(ctx,'Minutas',mid,{
    atendimentoId:a.id,
    fileId:file.getId(),
    url:file.getUrl(),
    numero:number,
    situacao:'AGUARDA_REVISAO',
    snapshot:snapshot_(a,p),
    templateId:template.getId(),
    templateModified:String(template.getLastUpdated().getTime())
  });
}

function reviewMin_(ctx,q){
  const m=get_('Minutas',q.id);
  version_(m,q.versao);

  const a=get_('Atendimentos',m.atendimentoId);
  const p=get_('Pessoas',a.pessoaId);
  const template=activeTemplate_();

  if(
    eligibility_(a,true).length||
    m.snapshot!==snapshot_(a,p)||
    m.templateId!==template.getId()||
    m.templateModified!==String(template.getLastUpdated().getTime())
  ){
    fail_('Dados ou modelo alterados. Gere nova versão.');
  }

  const doc=openDocument_(m.fileId);
  const remaining=tokens_(docParts_(doc));
  doc.saveAndClose();

  if(remaining.length){
    fail_('Documento contém placeholders.');
  }

  return change_(
    ctx,
    'Minutas',
    m.id,
    Object.assign({},m,{
      situacao:'REVISADA',
      revisor:ctx.email,
      revisadaEm:now_()
    }),
    m.versao
  );
}
