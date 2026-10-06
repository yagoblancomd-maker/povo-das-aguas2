function profilePhoto_(user){
  if(!user.fotoId)return '';
  try{
    const file=DriveApp.getFileById(user.fotoId),blob=file.getBlob();
    if(file.isTrashed()||!/^image\/(jpeg|png|webp)$/.test(blob.getContentType()))return '';
    return 'data:'+blob.getContentType()+';base64,'+Utilities.base64Encode(blob.getBytes());
  }catch(e){return '';}
}

function authProfile(token){
  return withAuthSession_(token,s=>({usuario:authPublicUser_(s.user),foto:profilePhoto_(s.user)}));
}

function profilePhotoFolder_(){
  const root=DriveApp.getFolderById(props_().getProperty('ROOT_FOLDER_ID'));
  const folders=root.getFoldersByName('Fotos de perfil');
  return folders.hasNext()?folders.next():root.createFolder('Fotos de perfil');
}

function profileCreatePhoto_(user,base64,mime){
  if(typeof base64!=='string'||base64.length>410000||!base64.length||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)||!/^image\/(jpeg|png|webp)$/.test(mime))
    fail_('Selecione uma imagem JPEG, PNG ou WebP de até 300 KB.');
  const bytes=Utilities.base64Decode(base64),b=bytes.map(x=>(x+256)%256);
  const png=[137,80,78,71,13,10,26,10].every((x,i)=>b[i]===x);
  const jpeg=b[0]===255&&b[1]===216&&b[2]===255;
  const webp=b[0]===82&&b[1]===73&&b[2]===70&&b[3]===70&&b[8]===87&&b[9]===69&&b[10]===66&&b[11]===80;
  if(bytes.length>300*1024||!(mime==='image/png'?png:mime==='image/jpeg'?jpeg:webp))
    fail_('O arquivo não é uma imagem válida ou excede 300 KB.');
  const extension={'image/png':'png','image/jpeg':'jpg','image/webp':'webp'}[mime];
  return profilePhotoFolder_().createFile(Utilities.newBlob(bytes,mime,user.id+'_'+uid_()+'.'+extension));
}

function profileMigrateEmailReferences_(ctx,oldEmail,newEmail){
  // Mantém tarefas atuais na mesma conta; autoria histórica é resolvida por aliases.
  ['Tarefas','Atendimentos','Distribuicao','Processos'].forEach(entity=>{
    all_(entity).filter(r=>String(r.responsavel||'').trim().toLowerCase()===oldEmail).forEach(r=>{
      change_(ctx,entity,r.id,Object.assign({},r,{responsavel:newEmail}),r.versao);
    });
  });
}

function authUpdateProfile(token,q){
  q=q||{};
  return withAuthSession_(token,s=>{
    const user=s.user;version_(user,q.versao);
    const nome=String(q.nome||'').trim().replace(/\s+/g,' ');
    const nomeUsuario=String(q.nomeUsuario||'').trim().replace(/\s+/g,' ');
    const email=authEmail_(q.email),emailChanged=email!==user.email;
    if(!nome||nome.length>140||!nomeUsuario||nomeUsuario.length>80)fail_('Informe o nome e o nome de usuário (até 140 e 80 caracteres).');
    if(emailChanged){
      authLimit_('profile-password',user.id,8,15);
      if(!authPasswordMatches_(user,authPassword_(q.senhaAtual)))fail_('Senha atual incorreta.');
      authCheckAvailableEmail_(email,user.id);
    }
    const ctx=authContext_(user.email);
    let created=null;
    const aliases=authAliases_(user);
    if(emailChanged&&!aliases.includes(user.email))aliases.push(user.email);
    let fotoId=user.fotoId||'';
    if(q.removerFoto===true)fotoId='';
    if(q.base64){created=profileCreatePhoto_(user,q.base64,String(q.mime||''));fotoId=created.getId();}
    try{
      const updated=change_(ctx,'Usuarios',user.id,Object.assign({},user,{
        nome,nomeUsuario,email,fotoId,emailsAnteriores:JSON.stringify(aliases),
        sessionVersion:Number(user.sessionVersion||0)+(emailChanged?1:0)
      }),user.versao);
      if(emailChanged)profileMigrateEmailReferences_(ctx,user.email,email);
      const session=emailChanged?authNewSession_(ctx,updated):null;
      authPersist_(ctx);
      // Só descarta a foto anterior depois de confirmar a alteração.
      if(user.fotoId&&user.fotoId!==fotoId){try{DriveApp.getFileById(user.fotoId).setTrashed(true);}catch(e){}}
      return Object.assign({ok:true,usuario:authPublicUser_(updated)},session||{});
    }catch(e){
      // Uma resposta perdida pode ocorrer após commit. Confira o banco antes de descartar.
      if(created){
        try{resetData_();if(get_('Usuarios',user.id).fotoId!==created.getId())created.setTrashed(true);}catch(ignore){}
      }
      throw e;
    }
  });
}

function authChangePassword(token,senhaAtual,novaSenha){
  authPassword_(novaSenha);authPassword_(senhaAtual);
  return withAuthSession_(token,s=>{
    const user=s.user;authLimit_('profile-password',user.id,8,15);
    if(!authPasswordMatches_(user,senhaAtual))fail_('Senha atual incorreta.');
    const ctx=authContext_(user.email);
    const updated=change_(ctx,'Usuarios',user.id,Object.assign({},user,authPasswordFields_(novaSenha),{
      sessionVersion:Number(user.sessionVersion||0)+1
    }),user.versao);
    const result=authNewSession_(ctx,updated);authPersist_(ctx);return result;
  });
}
