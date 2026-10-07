const PERSON_DOC_OWNER_PREFIX='PESSOA:';

const OPTIONAL_DOCUMENT_CATEGORIES=Object.freeze([
  'IDENTIDADE_TITULAR_RESIDENCIA'
]);

const DOCUMENT_LABELS={
  RG_CPF:'Documento de identidade e CPF',
  RESIDENCIA:'Comprovante de residência',
  IDENTIDADE_TITULAR_RESIDENCIA:'Carteira de identidade do titular da residência',
  INICIAL_SEGURO_DEFESO_2025:'Petição inicial — Seguro-Defeso 2025',
  RELATORIO_SEGURO_DEFESO_2025:'Relatório Seguro-Defeso 2025',
  PROCESSO_ADMINISTRATIVO:'Processo administrativo',
  PESCA:'Documentos de pesca',
  PROCURACAO:'Procuração',
  HIPOSSUFICIENCIA:'Declaração de hipossuficiência',
  ANEXO_TAREFA:'Anexo de tarefa'
};

const LEGACY_DOCUMENT_FOLDERS={
  '01 - Documento de identidade e CPF':'RG_CPF',
  '02 - Comprovante de residência':'RESIDENCIA',
  '03 - Processo administrativo':'PROCESSO_ADMINISTRATIVO',
  '04 - Documentos de pesca':'PESCA',
  '05 - Procuração':'PROCURACAO',
  '06 - Declaração de hipossuficiência':'HIPOSSUFICIENCIA'
};

function safeName_(value){
  return String(value||'')
    .trim()
    .replace(/[\\/:*?"<>|]/g,'-')
    .replace(/[\r\n\t]/g,' ')
    .replace(/\s+/g,' ')
    .slice(0,180);
}

function cpfDisplay_(cpf){
  const value=String(cpf||'').replace(/\D/g,'');

  if(value.length!==11)return String(cpf||'').trim();

  return value.replace(
    /(\d{3})(\d{3})(\d{3})(\d{2})/,
    '$1.$2.$3-$4'
  );
}

function personOwnerKey_(pessoaId){
  return PERSON_DOC_OWNER_PREFIX+pessoaId;
}

function personIdFromOwner_(owner){
  const value=String(owner||'');

  return value.startsWith(PERSON_DOC_OWNER_PREFIX)
    ?value.slice(PERSON_DOC_OWNER_PREFIX.length)
    :'';
}

function documentLabel_(categoria){
  return DOCUMENT_LABELS[categoria]||categoria;
}

function documentCategoryAllowed_(categoria,c){
  return (
    c.categorias.includes(categoria)||
    OPTIONAL_DOCUMENT_CATEGORIES.includes(categoria)
  );
}

function personDocumentBaseName_(categoria,p){
  if(categoria==='IDENTIDADE_TITULAR_RESIDENCIA'){
    return 'IDENTIDADE.TITULAR.RESIDÊNCIA';
  }

  return (
    documentLabel_(categoria)+
    '.'+
    safeName_(p.nome)
  );
}

function uniqueFileName_(folder,base,ext){
  let name=base+'.'+ext;

  if(!folder.getFilesByName(name).hasNext()){
    return name;
  }

  let n=2;

  while(
    folder
      .getFilesByName(base+' ('+n+').'+ext)
      .hasNext()
  ){
    n++;
  }

  return base+' ('+n+').'+ext;
}

function extensionFromFile_(file){
  const mime=file.getMimeType();

  if(mime==='application/pdf')return 'pdf';
  if(mime==='image/jpeg')return 'jpg';
  if(mime==='image/png')return 'png';

  const match=String(file.getName()||'').match(/\.([A-Za-z0-9]+)$/);
  return match?match[1].toLowerCase():'bin';
}

function flattenLegacyPersonFolders_(folder,p){
  const iterator=folder.getFolders();
  const legacy=[];

  while(iterator.hasNext()){
    const child=iterator.next();
    const categoria=LEGACY_DOCUMENT_FOLDERS[child.getName()];

    if(categoria){
      legacy.push({
        child,
        categoria
      });
    }
  }

  legacy.forEach(item=>{
    const files=item.child.getFiles();

    while(files.hasNext()){
      const file=files.next();
      const ext=extensionFromFile_(file);

      const base=
        documentLabel_(item.categoria)+
        '.'+
        safeName_(p.nome);

      const name=
        uniqueFileName_(
          folder,
          base,
          ext
        );

      file.setName(name);
      file.moveTo(folder);
    }

    item.child.setTrashed(true);
  });
}

function personFolder_(p){
  required_(p&&p.id,'id da pessoa');

  const root=DriveApp.getFolderById(PDA.parent);
  const desiredName=
    safeName_(p.nome)+
    ' - '+
    cpfDisplay_(p.cpf);

  const iterator=root.getFolders();
  const exact=[];
  const legacy=[];
  const rawCpf=String(p.cpf||'');
  const formattedCpf=cpfDisplay_(p.cpf);

  while(iterator.hasNext()){
    const folder=iterator.next();
    const name=folder.getName();

    if(name===desiredName){
      exact.push(folder);
      continue;
    }

    if(
      name.includes(p.id)||
      (rawCpf&&name.includes(rawCpf))||
      (formattedCpf&&name.includes(formattedCpf))
    ){
      legacy.push(folder);
    }
  }

  if(exact.length>1){
    fail_(
      'Há mais de uma pasta com o nome esperado para '+
      p.nome+
      '. Administração deve reconciliar as pastas.'
    );
  }

  if(exact.length===1&&legacy.length){
    fail_(
      'Há uma pasta atual e outra pasta antiga para '+
      p.nome+
      '. Administração deve reconciliar as pastas.'
    );
  }

  if(legacy.length>1){
    fail_(
      'Há mais de uma pasta antiga relacionada a '+
      p.nome+
      '. Administração deve reconciliar as pastas.'
    );
  }

  const folder=
    exact.length
      ?exact[0]
      :legacy.length
        ?legacy[0]
        :root.createFolder(desiredName);

  if(folder.getName()!==desiredName){
    folder.setName(desiredName);
  }

  flattenLegacyPersonFolders_(folder,p);

  return folder;
}

function atendimentoRoot_(p){
  const pessoaFolder=personFolder_(p);
  const iterator=pessoaFolder.getFoldersByName('Atendimentos');

  const folder=
    iterator.hasNext()
      ?iterator.next()
      :pessoaFolder.createFolder('Atendimentos');

  if(iterator.hasNext()){
    fail_(
      'Há mais de uma pasta "Atendimentos" para '+
      p.nome+
      '.'
    );
  }

  return folder;
}

function atendimentoFolderName_(a){
  return safeName_(
    a.demanda+
    ' - '+
    a.referencia
  ).slice(0,230);
}

function folder_(a){
  const p=get_('Pessoas',a.pessoaId);
  const desiredName=atendimentoFolderName_(a);

  if(a.folderId){
    try{
      const existing=DriveApp.getFolderById(a.folderId);

      if(existing.getName()!==desiredName){
        existing.setName(desiredName);
      }

      return existing;

    }catch(e){}
  }

  const root=atendimentoRoot_(p);
  const iterator=root.getFoldersByName(desiredName);

  const folder=
    iterator.hasNext()
      ?iterator.next()
      :root.createFolder(desiredName);

  if(iterator.hasNext()){
    fail_(
      'Há pastas duplicadas para este atendimento; administração deve reconciliar.'
    );
  }

  return folder;
}

function filePayload_(q){
  const mime=String(q.mime||'').trim();

  if(
    ![
      'application/pdf',
      'image/jpeg',
      'image/png'
    ].includes(mime)
  ){
    fail_('Use PDF, JPEG ou PNG.');
  }

  if(
    typeof q.base64!=='string'||
    q.base64.length>PDA.maxBytes*1.4
  ){
    fail_('Limite de 5 MB por arquivo.');
  }

  const bytes=Utilities.base64Decode(q.base64);

  if(
    !bytes.length||
    bytes.length>PDA.maxBytes
  ){
    fail_('Arquivo vazio ou maior que 5 MB.');
  }

  const sig=
    bytes
      .slice(0,8)
      .map(x=>(x+256)%256);

  if(
    mime==='application/pdf'&&
    String.fromCharCode(...sig.slice(0,5))!=='%PDF-'
  ){
    fail_('Conteúdo não corresponde a um PDF.');
  }

  if(
    mime==='image/jpeg'&&
    (
      sig[0]!==255||
      sig[1]!==216
    )
  ){
    fail_('Conteúdo não corresponde a uma imagem JPEG.');
  }

  if(
    mime==='image/png'&&
    sig.join(',')!=='137,80,78,71,13,10,26,10'
  ){
    fail_('Conteúdo não corresponde a uma imagem PNG.');
  }

  const digest=
    Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,
      bytes
    )
      .map(
        x=>(
          '0'+
          ((x+256)%256).toString(16)
        ).slice(-2)
      )
      .join('');

  const ext={
    'application/pdf':'pdf',
    'image/jpeg':'jpg',
    'image/png':'png'
  }[mime];

  return {
    bytes,
    digest,
    ext,
    mime
  };
}

function driveFileDigest_(file){
  return Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    file.getBlob().getBytes()
  )
    .map(
      x=>(
        '0'+
        ((x+256)%256).toString(16)
      ).slice(-2)
    )
    .join('');
}

function plannedDocumentName_(folder,categoria,p,payload,committedCount){
  const base=
    personDocumentBaseName_(
      categoria,
      p
    );

  const preferred=
    committedCount>0
      ?base+' ('+(committedCount+1)+').'+payload.ext
      :base+'.'+payload.ext;

  const iterator=
    folder.getFilesByName(preferred);

  if(!iterator.hasNext()){
    return preferred;
  }

  const existing=iterator.next();

  if(
    !iterator.hasNext()&&
    driveFileDigest_(existing)===payload.digest
  ){
    return preferred;
  }

  return uniqueFileName_(
    folder,
    base,
    payload.ext
  );
}

function createOrReuseDocumentFile_(folder,name,payload){
  const iterator=
    folder.getFilesByName(name);

  if(iterator.hasNext()){
    const existing=iterator.next();

    if(
      !iterator.hasNext()&&
      driveFileDigest_(existing)===payload.digest
    ){
      return existing;
    }
  }

  return folder.createFile(
    Utilities.newBlob(
      payload.bytes,
      payload.mime,
      name
    )
  );
}

function personUpload_(ctx,q){
  const p=get_('Pessoas',q.pessoaId);

  authorizePersonContentWrite_(
    p
  );

  const c=cfg_();

  if(!documentCategoryAllowed_(q.categoria,c)){
    fail_('Categoria inválida.');
  }

  const payload=filePayload_(q);
  const owner=personOwnerKey_(p.id);

  const prior=
    all_('Documentos')
      .find(d=>
        d.atendimentoId===owner&&
        d.categoria===q.categoria&&
        d.hash===payload.digest&&
        bool_(d.vigente)
      );

  if(prior){
    return {
      documento:prior,
      pessoa:p,
      mensagem:
        'Arquivo já anexado; preservado sem duplicação.'
    };
  }

  if(q.categoria==='RESIDENCIA'){
    date_(q.vencimento);

    if(
      bool_(q.terceiro)&&
      !bool_(q.declaracaoTerceiro)
    ){
      fail_(
        'Quando o comprovante estiver em nome de terceiro, confirme que há declaração de residência no documento.'
      );
    }
  }

  const folder=personFolder_(p);
  const did=id_('DOC',ctx.op);

  const committedCount=
    all_('Documentos')
      .filter(d=>
        d.atendimentoId===owner&&
        d.categoria===q.categoria&&
        bool_(d.vigente)
      )
      .length;

  const name=
    plannedDocumentName_(
      folder,
      q.categoria,
      p,
      payload,
      committedCount
    );

  const file=
    createOrReuseDocumentFile_(
      folder,
      name,
      payload
    );

  ctx.effects.push(
    'Documento da pessoa preservado no Drive: '+
    file.getUrl()
  );

  const documento=
    change_(
      ctx,
      'Documentos',
      did,
      {
        atendimentoId:owner,
        categoria:q.categoria,
        fileId:file.getId(),
        url:file.getUrl(),
        nome:name,
        hash:payload.digest,
        mime:payload.mime,
        substituiId:'',
        vigente:true,
        vencimento:q.vencimento||'',
        terceiro:bool_(q.terceiro),
        conferido:false,
        declaracaoTerceiro:bool_(q.declaracaoTerceiro),
        processoCompleto:false,
        anexoPresente:false,
        rogo:false,
        testemunhas:false,
        observacoes:''
      }
    );

  return {
    documento,
    pessoa:p,
    folderId:folder.getId(),
    folderUrl:folder.getUrl(),
    mensagem:
      'Documento salvo na pasta da pessoa.'
  };
}

function effectiveDocs_(a){
  const owner=
    personOwnerKey_(
      a.pessoaId
    );

  const docs=
    all_('Documentos')
      .filter(d=>
        bool_(d.vigente)&&
        (
          d.atendimentoId===a.id||
          d.atendimentoId===owner
        )
      );

  const result=[];

  cfg_().categorias
    .forEach(category=>{
      const specific=
        docs.filter(d=>
          d.categoria===category&&
          d.atendimentoId===a.id
        );

      const shared=
        docs.filter(d=>
          d.categoria===category&&
          d.atendimentoId===owner
        );

      result.push(
        ...(
          specific.length
            ?specific
            :shared
        )
      );
    });

  return result;
}

function upload_(ctx,q){
  const a=get_('Atendimentos',q.atendimentoId);
  version_(a,q.versao);

  const c=cfg_();

  if(!documentCategoryAllowed_(q.categoria,c)){
    fail_('Categoria inválida.');
  }

  const payload=filePayload_(q);

  const prior=
    all_('Documentos')
      .find(d=>
        d.atendimentoId===a.id&&
        d.categoria===q.categoria&&
        d.hash===payload.digest&&
        bool_(d.vigente)
      );

  if(prior){
    return {
      documento:prior,
      atendimento:a,
      mensagem:
        'Arquivo já anexado; preservado sem duplicação.'
    };
  }

  if(q.categoria==='RESIDENCIA'){
    date_(q.vencimento);

    if(
      bool_(q.terceiro)&&
      !bool_(q.declaracaoTerceiro)
    ){
      fail_(
        'Quando o comprovante estiver em nome de terceiro, confirme que há declaração de residência no documento.'
      );
    }
  }

  let previous=null;

  if(q.substituiId){
    previous=
      get_(
        'Documentos',
        q.substituiId
      );

    if(
      previous.atendimentoId!==a.id||
      previous.categoria!==q.categoria||
      !bool_(previous.vigente)
    ){
      fail_('Substituição inválida.');
    }
  }

  const p=get_('Pessoas',a.pessoaId);
  const folder=folder_(a);
  const did=id_('DOC',ctx.op);

  const committedCount=
    all_('Documentos')
      .filter(d=>
        d.atendimentoId===a.id&&
        d.categoria===q.categoria&&
        bool_(d.vigente)&&
        (
          !previous||
          d.id!==previous.id
        )
      )
      .length;

  const name=
    plannedDocumentName_(
      folder,
      q.categoria,
      p,
      payload,
      committedCount
    );

  const file=
    createOrReuseDocumentFile_(
      folder,
      name,
      payload
    );

  ctx.effects.push(
    'Arquivo preservado no Drive: '+
    file.getUrl()
  );

  if(previous){
    change_(
      ctx,
      'Documentos',
      previous.id,
      Object.assign(
        {},
        previous,
        {
          vigente:false
        }
      ),
      previous.versao
    );
  }

  const d=
    change_(
      ctx,
      'Documentos',
      did,
      {
        atendimentoId:a.id,
        categoria:q.categoria,
        fileId:file.getId(),
        url:file.getUrl(),
        nome:name,
        hash:payload.digest,
        mime:payload.mime,
        substituiId:q.substituiId||'',
        vigente:true,
        vencimento:q.vencimento||'',
        terceiro:bool_(q.terceiro),
        conferido:false,
        declaracaoTerceiro:bool_(q.declaracaoTerceiro),
        processoCompleto:false,
        anexoPresente:false,
        rogo:false,
        testemunhas:false,
        observacoes:''
      }
    );

  const changed=
    touch_(
      ctx,
      Object.assign(
        {},
        a,
        {
          folderId:
            folder.getId()
        }
      )
    );

  return {
    documento:d,
    atendimento:changed,
    mensagem:
      'Arquivo gravado. Conferência humana pendente.'
  };
}


/**
 * Exclui um documento geral da pessoa.
 * O arquivo é enviado para a lixeira do Drive e o registro é mantido apenas
 * para fins de auditoria, com vigente=false.
 */
function personDocumentDelete_(ctx,q){
  required_(q.id,'documento');
  required_(q.pessoaId,'pessoa');

  const p=get_('Pessoas',q.pessoaId);

  authorizePersonRetification_(
    p
  );

  const d=get_('Documentos',q.id);

  version_(d,q.versao);

  const owner=personOwnerKey_(p.id);

  if(d.atendimentoId!==owner){
    fail_('Somente documentos do cadastro individual da pessoa podem ser excluídos por esta operação.');
  }

  if(!bool_(d.vigente)){
    return {
      documento:d,
      pessoa:p,
      mensagem:'Documento já estava excluído.'
    };
  }

  let file=null;

  try{
    file=DriveApp.getFileById(d.fileId);
  }catch(e){
    file=null;
  }

  if(file&&!file.isTrashed()){
    file.setTrashed(true);
    ctx.effects.push('Documento removido da pasta da pessoa: '+d.nome);
  }

  if(d.categoria==='ANEXO_TAREFA'){
    all_('TarefaAnexos')
      .filter(item=>
        item.documentoId===d.id
      )
      .forEach(item=>
        remove_(
          ctx,
          'TarefaAnexos',
          item.id,
          item.versao
        )
      );
  }

  const observacaoExclusao=
    '[EXCLUÍDO '+now_()+' por '+ctx.email+']';

  const updated=change_(
    ctx,
    'Documentos',
    d.id,
    Object.assign(
      {},
      d,
      {
        vigente:false,
        observacoes:
          [
            String(d.observacoes||'').trim(),
            observacaoExclusao
          ].filter(Boolean).join('\n')
      }
    ),
    d.versao
  );

  all_('Atendimentos')
    .filter(a=>a.pessoaId===p.id)
    .forEach(a=>touch_(ctx,a));

  return {
    documento:updated,
    pessoa:p,
    mensagem:'Documento excluído e removido da pasta da pessoa.'
  };
}
