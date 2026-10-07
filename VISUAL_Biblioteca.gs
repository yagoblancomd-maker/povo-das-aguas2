/**
 * POVO DAS ÁGUAS — BIBLIOTECA VISUAL
 * Fotos persistentes do projeto, armazenadas no Google Drive.
 */

const PDA_VISUAL_LIBRARY_FOLDER_ID='14ckm3idgREHg4pWEpFY1L_DqxrHBcR1z';
const PDA_VISUAL_MIMES=new Set([
  'image/jpeg',
  'image/png',
  'image/webp'
]);

function visualLibraryFolder_(){
  const configured=
    String(
      props_().getProperty(
        'PDA_VISUAL_LIBRARY_FOLDER_ID'
      )||
      PDA_VISUAL_LIBRARY_FOLDER_ID
    ).trim();

  try{
    return DriveApp.getFolderById(configured);
  }catch(e){
    const root=
      DriveApp.getFolderById(
        PDA.parent
      );

    const folders=
      root.getFoldersByName(
        'Povo das Aguas - Biblioteca Visual'
      );

    const folder=
      folders.hasNext()
        ?folders.next()
        :root.createFolder(
            'Povo das Aguas - Biblioteca Visual'
          );

    props_().setProperty(
      'PDA_VISUAL_LIBRARY_FOLDER_ID',
      folder.getId()
    );

    return folder;
  }
}

function visualDefaultUses_(name){
  const value=
    String(name||'')
      .toLowerCase();

  if(
    /pesca|porto|cais|molhes|agua/.test(value)
  ){
    return [
      'LOGIN',
      'PAINEL',
      'TERRITORIO'
    ];
  }

  if(
    /furg|historico|praca/.test(value)
  ){
    return [
      'LOGIN',
      'PAINEL',
      'INSTITUCIONAL'
    ];
  }

  if(
    /taim|capivara|fauna/.test(value)
  ){
    return [
      'LOGIN',
      'PAINEL',
      'TERRITORIO'
    ];
  }

  return [
    'LOGIN',
    'PAINEL'
  ];
}

function visualMeta_(file){
  let meta={};

  try{
    const raw=
      String(
        file.getDescription()||
        ''
      );

    if(
      raw.indexOf(
        'PDA_VISUAL:'
      )===0
    ){
      meta=
        JSON.parse(
          raw.slice(
            'PDA_VISUAL:'.length
          )
        )||
        {};
    }
  }catch(e){}

  const uses=
    Array.isArray(meta.usos)
      ?meta.usos
        .map(value=>
          String(value||'')
            .trim()
            .toUpperCase()
        )
        .filter(Boolean)
      :visualDefaultUses_(
          file.getName()
        );

  return {
    ativo:
      meta.ativo!==false,
    usos:
      uses.length
        ?uses
        :['LOGIN','PAINEL'],
    legenda:
      String(
        meta.legenda||
        ''
      ),
    ordem:
      Number(
        meta.ordem||
        0
      )
  };
}

function visualPublicRow_(file){
  const meta=
    visualMeta_(file);

  return {
    id:file.getId(),
    nome:file.getName(),
    mime:file.getMimeType(),
    ativo:meta.ativo,
    usos:meta.usos,
    legenda:meta.legenda,
    ordem:meta.ordem,
    atualizadoEm:
      file.getLastUpdated()
        .toISOString()
  };
}

function visualLibraryList_(){
  const folder=
    visualLibraryFolder_();

  const files=
    folder.getFiles();

  const rows=[];

  while(files.hasNext()){
    const file=
      files.next();

    if(
      file.isTrashed()||
      !PDA_VISUAL_MIMES.has(
        file.getMimeType()
      )
    ){
      continue;
    }

    rows.push(
      visualPublicRow_(file)
    );
  }

  rows.sort((a,b)=>
    Number(a.ordem||0)-
    Number(b.ordem||0)||
    String(a.nome)
      .localeCompare(
        String(b.nome),
        'pt-BR',
        {sensitivity:'base'}
      )
  );

  return {
    pastaId:folder.getId(),
    quantidade:rows.length,
    imagens:rows
  };
}

function visualFileBelongs_(id){
  const folder=
    visualLibraryFolder_();

  const files=
    folder.getFiles();

  while(files.hasNext()){
    const file=
      files.next();

    if(
      file.getId()===
      String(id||'')
    ){
      return file;
    }
  }

  return null;
}

function visualImageContent_(q){
  q=q||{};

  const file=
    visualFileBelongs_(
      required_(
        q.id,
        'imagem'
      )
    );

  if(!file){
    fail_(
      'Imagem não localizada na biblioteca visual.'
    );
  }

  const mime=
    file.getMimeType();

  if(
    !PDA_VISUAL_MIMES.has(
      mime
    )
  ){
    fail_(
      'O arquivo informado não é uma imagem válida.'
    );
  }

  const blob=
    file.getBlob();

  const bytes=
    blob.getBytes();

  if(
    bytes.length>
    3*1024*1024
  ){
    fail_(
      'A imagem ultrapassa 3 MB. Reenvie uma versão otimizada pela Administração.'
    );
  }

  return {
    id:file.getId(),
    nome:file.getName(),
    mime,
    base64:
      Utilities.base64Encode(
        bytes
      )
  };
}

function visualRandomImage_(q){
  q=q||{};

  const usage=
    String(
      q.uso||
      'PAINEL'
    )
      .trim()
      .toUpperCase();

  const data=
    visualLibraryList_();

  const eligible=
    data.imagens
      .filter(item=>
        item.ativo&&
        (
          !usage||
          (item.usos||[])
            .includes(
              usage
            )
        )
      );

  if(!eligible.length){
    return null;
  }

  const index=
    Math.floor(
      Math.random()*
      eligible.length
    );

  return visualImageContent_({
    id:eligible[index].id
  });
}

/**
 * Uso público restrito ao portal de login.
 * Não recebe IDs e só retorna uma imagem da pasta visual dedicada.
 */
function visualPortalPhoto(){
  try{
    return visualRandomImage_({
      uso:'LOGIN'
    });
  }catch(e){
    return null;
  }
}

function visualImageUpload_(ctx,q){
  q=q||{};

  const mime=
    String(
      q.mime||
      ''
    ).toLowerCase();

  if(
    !PDA_VISUAL_MIMES.has(
      mime
    )
  ){
    fail_(
      'Envie uma imagem JPEG, PNG ou WebP.'
    );
  }

  const base64=
    String(
      required_(
        q.base64,
        'imagem'
      )
    );

  if(
    !/^[A-Za-z0-9+/]+={0,2}$/.test(
      base64
    )
  ){
    fail_(
      'Conteúdo de imagem inválido.'
    );
  }

  const bytes=
    Utilities.base64Decode(
      base64
    );

  if(
    !bytes.length||
    bytes.length>
    1200*1024
  ){
    fail_(
      'A imagem otimizada deve ter no máximo 1,2 MB.'
    );
  }

  const extension=
    mime==='image/png'
      ?'png'
      :mime==='image/webp'
        ?'webp'
        :'jpg';

  const name=
    safeName_(
      String(
        q.nome||
        'imagem'
      )
        .replace(
          /\.[^.]+$/,
          ''
        )
    )+
    '.'+
    extension;

  const folder=
    visualLibraryFolder_();

  const file=
    folder.createFile(
      Utilities.newBlob(
        bytes,
        mime,
        name
      )
    );

  const usos=
    Array.isArray(q.usos)
      ?q.usos
        .map(value=>
          String(value||'')
            .trim()
            .toUpperCase()
        )
        .filter(Boolean)
      :[
          'LOGIN',
          'PAINEL'
        ];

  file.setDescription(
    'PDA_VISUAL:'+
    JSON.stringify({
      ativo:true,
      usos:
        usos.length
          ?usos
          :['LOGIN','PAINEL'],
      legenda:
        String(
          q.legenda||
          ''
        ),
      ordem:0,
      criadoPor:ctx.email,
      criadoEm:now_()
    })
  );

  return visualPublicRow_(file);
}

function visualImageMetaSave_(ctx,q){
  const file=
    visualFileBelongs_(
      required_(
        q.id,
        'imagem'
      )
    );

  if(!file){
    fail_(
      'Imagem não localizada.'
    );
  }

  const usos=
    Array.isArray(q.usos)
      ?q.usos
        .map(value=>
          String(value||'')
            .trim()
            .toUpperCase()
        )
        .filter(Boolean)
      :[];

  file.setDescription(
    'PDA_VISUAL:'+
    JSON.stringify({
      ativo:
        q.ativo!==false,
      usos:
        usos.length
          ?usos
          :['LOGIN','PAINEL'],
      legenda:
        String(
          q.legenda||
          ''
        ),
      ordem:
        Number(
          q.ordem||
          0
        ),
      alteradoPor:ctx.email,
      alteradoEm:now_()
    })
  );

  return visualPublicRow_(file);
}

function visualImageDelete_(ctx,q){
  const file=
    visualFileBelongs_(
      required_(
        q.id,
        'imagem'
      )
    );

  if(!file){
    fail_(
      'Imagem não localizada.'
    );
  }

  const name=
    file.getName();

  file.setTrashed(true);

  return {
    id:String(q.id),
    nome:name,
    removida:true
  };
}
