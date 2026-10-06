/** Executar somente no editor, nunca pelo navegador. Configure OWNER_EMAIL nas propriedades primeiro. */
function instalar_(){
  return lock_(function(){
    resetData_();

    const email=String(
      Session.getActiveUser().getEmail()||
      ''
    )
      .trim()
      .toLowerCase();
    if(email!==props_().getProperty('OWNER_EMAIL')){
      fail_('Configure OWNER_EMAIL com o e-mail da conta responsável, nas propriedades do script.');
    }

    const parent=DriveApp.getFolderById(PDA.parent);
    let rootId=props_().getProperty('ROOT_FOLDER_ID');

    if(!rootId){
      const name=PDA.name+' — '+ScriptApp.getScriptId();
      const iter=parent.getFoldersByName(name);
      const folder=iter.hasNext()?iter.next():parent.createFolder(name);
      if(iter.hasNext())fail_('Pastas de instalação duplicadas; selecione ROOT_FOLDER_ID manualmente.');
      rootId=folder.getId();
      props_().setProperty('ROOT_FOLDER_ID',rootId);
    }

    const root=DriveApp.getFolderById(rootId);
    let sid=props_().getProperty('SPREADSHEET_ID');

    if(!sid){
      const name='PDA Banco — '+ScriptApp.getScriptId();
      const matches=DriveApp.getFilesByName(name);
      const found=[];

      while(matches.hasNext()){
        const f=matches.next();
        if(f.getMimeType()===MimeType.GOOGLE_SHEETS&&!f.isTrashed())found.push(f);
      }

      if(found.length>1)fail_('Mais de um banco encontrado; defina SPREADSHEET_ID.');
      sid=found.length?found[0].getId():SpreadsheetApp.create(name).getId();
      props_().setProperty('SPREADSHEET_ID',sid);
    }

    DriveApp.getFileById(sid).moveTo(root);

    const ss=SpreadsheetApp.openById(sid);
    ss.setSpreadsheetTimeZone(PDA.tz);

    Object.keys(SCHEMA).forEach(entity=>{
      const heads=headers_(entity);
      const sh=ss.getSheetByName(entity)||ss.insertSheet(entity);

      if(sh.getLastRow()===0){
        sh.getRange(1,1,1,heads.length).setValues([heads]);
        sh.setFrozenRows(1);
        sh.getRange(1,1,1,heads.length).setBackground('#12364a').setFontColor('#ffffff');
        sh.getRange(1,1,sh.getMaxRows(),heads.length).setNumberFormat('@');
      }else{
        ensureEntitySchema_(entity);
      }
    });

    SpreadsheetApp.flush();
    resetData_();

    const ctx={
      email,
      op:'install_'+uid_(),
      hash:'installation',
      changes:[]
    };

    Object.keys(DEFAULTS).forEach(chave=>{
      if(!all_('Configuracoes').some(r=>r.chave===chave)){
        change_(
          ctx,
          'Configuracoes',
          id_('CFG',chave),
          {chave,valor:JSON.stringify(DEFAULTS[chave])}
        );
      }
    });

    if(!all_('Usuarios').some(r=>r.id===id_('USR',email)||authUserEmailMatches_(r,email))){
      change_(
        ctx,
        'Usuarios',
        id_('USR',email),
        {email,perfil:'ADMIN',ativo:true}
      );
    }

    return commit_(ctx,{
      planilha:ss.getUrl(),
      pasta:root.getUrl(),
      mensagem:'Instalação estrutural concluída; homologação Google ainda necessária.'
    });
  });
}

