const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');

const base=__dirname;
const read=name=>fs.readFileSync(path.join(base,name),'utf8');

const app=read('App_Script.html');
assert.match(app,/READ_CACHE_TTL_MS=30000/);
assert.match(app,/READ_CACHE_REFRESH_MS=8000/);
assert.match(app,/raw\(\s*'carregarModulos'/s);
assert.match(app,/raw\(\s*'aquecerDadosModulos'/s);
assert.match(app,/requestIdleCallback/);
assert.match(app,/function bindModulePrefetch_/);
assert.match(app,/'mouseenter'/);
assert.match(app,/'pointerdown'/);
assert.match(app,/prefetchModule_/);
assert.match(app,/window\.PDA_PERF/);
assert.match(app,/renderInstantModuleShell_/);
assert.match(app,/runModuleWarmup_\(\)/);

const modules=read('06_Modulos.gs');
assert.match(modules,/function aquecerDadosModulos\(/);
assert.match(modules,/function aquecerAplicacao\(/);
assert.match(modules,/'admin'/);
assert.match(modules,/cache\.put\([\s\S]*?60\s*\)/);

const access=read('02_Acesso.gs');
assert.match(access,/PDA_ACTIVE_USER_/);
assert.match(access,/CacheService[\s\S]*?120/);

const style=read('App_Style.html');
assert.match(style,/MENU — CONTRASTE DEFINITIVO/);
assert.match(style,/nav-group>\.nav-submenu[\s\S]*?rgba\(6,51,70/);
assert.match(style,/nav-submenu button\[aria-current="page"\]/);

console.log('PASS preload, cache, telemetria e contraste de menus protegidos.');
