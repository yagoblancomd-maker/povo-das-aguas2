const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');

const base=__dirname;
const read=name=>fs.readFileSync(path.join(base,name),'utf8');

const app=read('App_Script.html');
assert.match(app,/async function refreshCurrentModule_\(/);
assert.match(app,/refreshCurrent:refreshCurrentModule_/);

const adm=read('ADM_Script.html');
assert.doesNotMatch(adm,/await\s+go\(\s*['"]ADM['"]/);
assert.doesNotMatch(adm,/App\.refreshCurrent\(\{code:'ADM'\}\)/);
assert.match(adm,/invalidate_\('adminUsuarios'\)/);
assert.match(adm,/renderUsers_\(fresh\)/);

const acomp=read('ACOMP_Script.html');
assert.match(acomp,/App\.refreshCurrent\(\{code:'ACOMP',pessoaId:p\.id\}\)/);
assert.match(acomp,/pessoaExcluirDefinitivo[\s\S]*?await\s+go\(\s*['"]ACOMP['"]/);

const min=read('MIN_Script.html');
assert.doesNotMatch(min,/await\s+go\(\s*['"]MIN['"]/);
assert.match(min,/App\.refreshCurrent\(\{code:'MIN',pessoaId:p\.id\}\)/);

const perf=read('PERF_Script.html');
assert.doesNotMatch(perf,/App\.start\(['"]PERF['"]\)/);
assert.doesNotMatch(perf,/App\.refreshCurrent\(\{code:'PERF'\}\)/);
assert.match(perf,/App\.state\.boot=/);

const dist=read('DIST_Script.html');
assert.match(dist,/dist-live-content/);
assert.doesNotMatch(
  dist,
  /Mensagem enviada\.['"]\);\s*dialog\.close\(\);\s*await refresh\(\)/s
);
assert.doesNotMatch(
  dist,
  /PDF\(s\) anexado\(s\)\.['"]\);\s*dialog\.close\(\);\s*await refresh\(\)/s
);

const tasks=read('TAREFAS_Script.html');
assert.match(tasks,/tasks-live-content/);
assert.doesNotMatch(
  tasks,
  /Mensagem enviada\.['"]\);\s*dialog\.close\(\);\s*await refresh\(\)/s
);
assert.doesNotMatch(
  tasks,
  /PDF\(s\) anexado\(s\)\.['"]\);\s*dialog\.close\(\);\s*await refresh\(\)/s
);

// Novo cadastro navega intencionalmente para a ficha concluída.
// Essa transição é mudança de módulo, não recarga do módulo atual.
const pess=read('PESS_Script.html');
assert.match(pess,/await\s+go\(\s*['"]ACOMP['"]/);

console.log('PASS salvamentos não reiniciam a aplicação nem recarregam o módulo atual.');
