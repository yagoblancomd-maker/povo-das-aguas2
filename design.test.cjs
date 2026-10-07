const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');

const base=__dirname;

function read(name){
  return fs.readFileSync(path.join(base,name),'utf8');
}

function script(name){
  const text=read(name);
  const match=text.match(/<script[^>]*>([\s\S]*?)<\/script>/i);
  assert.ok(match,'Script não encontrado em '+name);
  return match[1];
}

for(const name of [
  'App_Script.html',
  'AUTH_Script.html',
  'DIST_Script.html',
  'TAREFAS_Script.html',
  'PESS_Script.html',
  'PAINEL_Script.html'
]){
  assert.doesNotThrow(()=>new Function(script(name)),name+' contém erro de sintaxe');
}

for(const name of [
  '06_Modulos.gs',
  'DIST_TarefasGerais.gs'
]){
  assert.doesNotThrow(()=>new Function(read(name)),name+' contém erro de sintaxe');
}

const auth=read('AUTH_View.html');
for(const id of [
  'pda-auth-overlay',
  'pda-auth-logo',
  'pda-auth-faces',
  'pda-auth-title',
  'pda-auth-subtitle',
  'pda-auth-login-form',
  'pda-auth-register-form',
  'pda-auth-recovery-form',
  'pda-auth-reset-form',
  'pda-auth-message'
]){
  assert.ok(auth.includes('id="'+id+'"'),'AUTH_View perdeu #'+id);
}

assert.doesNotMatch(
  auth,
  /pda-auth-aurora|pda-auth-bubbles|pda-auth-net-bg|pda-auth-fisher-scene|pda-auth-journey/,
  'Portal voltou a usar decoração genérica removida pela direção de arte'
);

const index=read('Index.html');
for(const id of [
  'app-shell',
  'profileShortcut',
  'headerUserPhoto',
  'headerUserInitials',
  'identity',
  'headerUserFunction',
  'headerUserProfile',
  'taskNotificationButton',
  'taskNotificationBadge',
  'taskNotificationPanel',
  'profileButton',
  'logoutButton',
  'nav',
  'status',
  'app'
]){
  assert.ok(index.includes('id="'+id+'"'),'Index perdeu #'+id);
}

assert.doesNotMatch(
  index,
  /app-header-effects|app-header-wave/,
  'Cabeçalho voltou a usar efeitos decorativos removidos'
);

const appStyle=read('App_Style.html');
assert.match(appStyle,/SISTEMA VISUAL HUMANO \/ EDITORIAL/);
assert.match(appStyle,/width:min\(1180px/);
assert.match(appStyle,/--pda-paper:#f3f0e8/);
assert.match(appStyle,/--pda-sea:#1b5f67/);

const authStyle=read('AUTH_Style.html');
assert.match(authStyle,/Palatino Linotype/);
assert.doesNotMatch(authStyle,/aurora|bubble|fisher-scene/);

const appScript=read('App_Script.html');
assert.match(appScript,/const PROCESSING_PROFILES=Object\.freeze/);
assert.match(appScript,/notificacoesTarefasMarcarLidas/);
assert.match(appScript,/NAV_HELP=Object\.freeze/);

const index=read('Index.html');
assert.match(index,/id="navContextHelp"/);

const finalStyle=read('App_Style.html');
assert.match(finalStyle,/\.pda-sidebar\{[\s\S]*?z-index:1200!important/);
assert.match(finalStyle,/\.app-notification-panel\{[\s\S]*?z-index:1700!important/);
assert.match(finalStyle,/Iowan Old Style/);

const dashboard=read('PAINEL_Style.html');
assert.match(dashboard,/var\(--pda-photo-net\)/);
assert.match(dashboard,/home-action-photo-community/);
assert.match(dashboard,/home-action-photo-port/);
assert.doesNotMatch(read('PAINEL_Script.html'),/function fishingArt_/);

const photoAssets=read('PHOTO_Assets.html');
for(const token of [
  '--pda-photo-net',
  '--pda-photo-community',
  '--pda-photo-boat',
  '--pda-photo-port',
  '--pda-photo-channel'
]){
  assert.ok(
    photoAssets.includes(token),
    'Ativo fotográfico ausente: '+token
  );
}

const designSystem=read('DESIGN_SYSTEM.md');
assert.match(
  designSystem,
  /Não criar testemunhos, reportagens, entrevistas, matérias, citações/
);

console.log('PASS identidade visual editorial, IDs funcionais e scripts preservados.');
