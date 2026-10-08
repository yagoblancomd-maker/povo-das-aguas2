import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(new URL('..',import.meta.url).pathname.replace(/^\//,''));
const checks=[];
const fail=[];
const ok=(name,value)=>{checks.push([name,!!value]);if(!value)fail.push(name);};
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

function module(name){
  const data=JSON.parse(read('public/modules/'+name+'.json'));
  const body=String(data.script||'')
    .replace(/^\s*<script>\s*/i,'')
    .replace(/\s*<\/script>\s*$/i,'');
  new Function(body);
  ok(name+' JSON/script válido',!!data.view&&!!data.style&&!!data.script);
  return data;
}

const index=read('public/index.html');
ok('CPF enviado na exclusão global',index.includes("cpfConfirmacao:String(typed||'').replace(/\\D/g,'')"));
ok('PDF usa visualização interna por blob',index.includes("frame.src=objectUrl")&&index.includes("pda-file-viewer-frame"));
ok('Documento legado tem abertura direta',index.includes('Documento legado do Google Drive')&&index.includes('result.redirect'));

const acomp=module('ACOMP');
ok('CPF enviado na exclusão da ficha',acomp.script.includes("cpfConfirmacao:String(typed||'').replace(/\\D/g,'')"));
ok('Consulta pré-carrega índice',acomp.script.includes('preloadedRows')&&acomp.script.includes('precarregar:true'));
ok('Consulta filtra localmente',acomp.script.includes('localRows_'));
ok('Ficha carrega Hub de Minutas',acomp.script.includes("'modelosDocumentosListar'")&&acomp.script.includes("'modeloDocumentoGerar'"));
ok('Documentos têm atalho gerar por modelo',acomp.script.includes('Gerar documento por modelo'));

const dist=module('DIST');
ok('Checkbox usa coluna lateral',dist.style.includes('grid-template-columns:40px minmax(0,1fr)')&&dist.style.includes('position:static!important'));
ok('Checkbox envolve conteúdo em rail',dist.script.includes('dist-bulk-card-content')&&!dist.script.includes('card.prepend(label)'));

const min=module('MIN');
ok('Modelo possui automação',min.script.includes('automatico:automatic.checked')&&min.script.includes('Gerar automaticamente ao concluir cadastro'));
ok('Modelo filtra origem',min.script.includes('origensCadastro:origin.value'));
ok('Modelo filtra parcelas',min.script.includes('parcelas:parcels.value'));
ok('Modelo filtra demanda',min.script.includes('demandas:demands.value'));

const compat=read('src/compat.mjs');
ok('Preload backend aceita busca vazia',compat.includes('prewarm=q.precarregar')&&!compat.includes('aguardandoFiltro:true'));
ok('Documento legado retorna redirect',compat.includes('legado:true')&&compat.includes('redirect'));

const actions=read('src/actions.mjs');
ok('Conclusão gera modelos automáticos',actions.includes('generateAutomaticModels_')&&actions.includes('modelosAutomaticos:automaticos'));
ok('Aplicabilidade inclui origem/parcelas/demanda',actions.includes('origins.includes(origin)')&&actions.includes('parcels.includes(parcel)')&&actions.includes('demands.includes(demand)'));

const generator=read('src/generator.mjs');
ok('Catálogo persiste automático',generator.includes('automatico:q.automatico')&&generator.includes("gatilho:'CONCLUSAO_CADASTRO'"));
ok('Catálogo persiste filtros extras',generator.includes('origensCadastro:normalizeList')&&generator.includes('parcelas:normalizeList')&&generator.includes('demandas:normalizeList'));

for(const [name,value] of checks)console.log((value?'PASS ':'FAIL ')+name);
if(fail.length){
  console.error('VERIFY_ROUND2_FAIL='+fail.join('; '));
  process.exit(1);
}
console.log('VERIFY_ROUND2_OK='+checks.length);
