const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),crypto=require('crypto');
const path=require('path');const src=__dirname;
let email='admin@example.test',failBatch=false,loseReply=false;const properties={OWNER_EMAIL:email};let counter=0;const files=new Map(),folders=new Map(),books=new Map();
const iter=items=>{let i=0;return {hasNext:()=>i<items.length,next:()=>items[i++]};};
class File{constructor(name,mime,bytes=[]){this.id='file-'+(++counter);this.name=name;this.mime=mime;this.bytes=bytes;this.modified=1;files.set(this.id,this);}getId(){return this.id}getName(){return this.name}getMimeType(){return this.mime}isTrashed(){return !!this.trashed}setTrashed(v){this.trashed=v;return this}getDescription(){return this.description||''}setDescription(v){this.description=v;return this}setName(v){this.name=v;return this}getUrl(){return 'https://drive.google.com/file/d/'+this.id}moveTo(f){this.folder=f.id;return this}getLastUpdated(){return new Date(this.modified)}makeCopy(name,f){const copy=new File(name,this.mime);copy.text=this.text;copy.folder=f.id;return copy;}}
class Folder{constructor(name){this.id='folder-'+(++counter);this.name=name;folders.set(this.id,this);}getId(){return this.id}getName(){return this.name}getUrl(){return 'https://drive.google.com/drive/folders/'+this.id}createFolder(name){const f=new Folder(name);f.parent=this.id;return f}getFiles(){return iter([...files.values()].filter(f=>f.folder===this.id))}getFolders(){return iter([...folders.values()].filter(f=>f.parent===this.id))}getFoldersByName(name){return iter([...folders.values()].filter(f=>f.parent===this.id&&f.name===name))}getFilesByName(name){return iter([...files.values()].filter(f=>f.folder===this.id&&f.name===name))}createFile(blob){const f=new File(blob.name,blob.mime,blob.bytes);f.folder=this.id;return f}}
class Sheet{constructor(name){this.name=name;this.id=++counter;this.rows=[];this.max=1000;}getSheetId(){return this.id}getLastRow(){return this.rows.length}getLastColumn(){return Math.max(0,...this.rows.map(r=>r.length))}getMaxRows(){return this.max}setFrozenRows(){}getDataRange(){return this.getRange(1,1,Math.max(1,this.getLastRow()),Math.max(1,this.getLastColumn()))}getRange(row,col,n=1,m=1){const sh=this;const r={getDisplayValues:()=>Array.from({length:n},(_,i)=>Array.from({length:m},(_,j)=>String(sh.rows[row-1+i]?.[col-1+j]??''))),setValues:values=>{values.forEach((v,i)=>{sh.rows[row-1+i]??=[];v.forEach((x,j)=>sh.rows[row-1+i][col-1+j]=x)});return r;},setBackground:()=>r,setFontColor:()=>r,setNumberFormat:()=>r};return r;}}
class Book{constructor(name){const f=new File(name,'sheets');this.id=f.id;this.sheets=[];books.set(this.id,this);}getId(){return this.id}getUrl(){return 'https://docs.google.com/spreadsheets/d/'+this.id}setSpreadsheetTimeZone(){}getSheetByName(n){return this.sheets.find(s=>s.name===n)}insertSheet(n){const s=new Sheet(n);this.sheets.push(s);return s}}
const parent=new Folder('authorized parent');folders.set('1wKO6B73R2e-H8E5R_vxRAHmUOIFz3bu7',parent);
const context={console,Date,JSON,Math,Object,Array,String,Number,Boolean,RegExp,Error,Set,Buffer,
 PropertiesService:{getScriptProperties:()=>({getProperty:k=>properties[k],setProperty:(k,v)=>properties[k]=v})},Session:{getActiveUser:()=>({getEmail:()=>email})},ScriptApp:{getScriptId:()=> 'independent-project'},LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock:()=>{}})},MimeType:{GOOGLE_SHEETS:'sheets',GOOGLE_DOCS:'docs'},
 Utilities:{getUuid:()=>crypto.randomUUID(),DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(_,x)=>[...crypto.createHash('sha256').update(typeof x==='string'?x:Buffer.from(x)).digest()],base64Decode:x=>[...Buffer.from(x,'base64')],newBlob:(bytes,mime,name)=>({bytes,mime,name}),formatDate:()=> '05/10/2026'},
 DriveApp:{getFolderById:id=>folders.get(id)||assert.fail('missing folder'),getFileById:id=>files.get(id)||assert.fail('missing file '+id),getFilesByName:name=>iter([...files.values()].filter(f=>f.name===name))},
 SpreadsheetApp:{openById:id=>books.get(id),create:name=>new Book(name),flush:()=>{}},
 Sheets:{Spreadsheets:{batchUpdate:({requests},id)=>{if(failBatch){failBatch=false;throw Error('Falha Sheets simulada');}const book=books.get(id);for(const req of requests){if(req.appendDimension){book.sheets.find(s=>s.id===req.appendDimension.sheetId).max+=req.appendDimension.length;continue;}const u=req.updateCells;const s=book.sheets.find(s=>s.id===u.range.sheetId);s.rows[u.range.startRowIndex]=u.rows[0].values.map(v=>v.userEnteredValue.stringValue);}if(loseReply){loseReply=false;throw Error('Resposta perdida após confirmação');}}}},
 DocumentApp:{TabType:{DOCUMENT_TAB:'doc'},openById:id=>{const f=files.get(id);const body={getText:()=>f.text,replaceText:(pattern,value)=>{f.text=f.text.replace(new RegExp(pattern,"g"),value)},findText:token=>{const start=f.text.indexOf(token);return start<0?null:{getStartOffset:()=>start,getEndOffsetInclusive:()=>start+token.length-1,getElement:()=>({asText:()=>({getAttributes:()=>({}),deleteText:(a,b)=>f.text=f.text.slice(0,a)+f.text.slice(b+1),insertText:(a,t)=>f.text=f.text.slice(0,a)+t+f.text.slice(a),setAttributes:()=>{}})})}}};return {getTabs:()=>[{getType:()=> 'doc',asDocumentTab:()=>({getBody:()=>body,getHeader:()=>null,getFooter:()=>null}),getChildTabs:()=>[]}],saveAndClose:()=>{}};}}
};vm.createContext(context);vm.runInContext(fs.readdirSync(src).filter(f=>f.endsWith('.gs')).sort().map(f=>fs.readFileSync(path.join(src,f),'utf8')).join('\n'),context);
const C=context;const run=(a,p={})=>C.api(a,{...p,op:p.op||crypto.randomUUID()});let passed=0;function test(name,fn){fn();console.log('PASS '+name);passed++;}const rows=t=>C.all_(t);const fresh=(t,id)=>C.get_(t,id);const config=(key,val)=>{const r=rows('Configuracoes').find(r=>r.chave===key);run('configSalvar',{chave:key,valor:val,versao:r.versao})};

folders.set(vm.runInContext("PDA.parent",context),parent);
let p,a;
test("instalação e cadastro preservam parcelas e valor automático",()=>{C.instalar();p=run("pessoaSalvar",{nome:"Pessoa Fictícia",cpf:"01234567890",nascimento:"29/02/2000",telefone:"53996321234",tipoVia:"Rua",via:"Via Teste",numero:"105",bairro:"Centro",cidade:"Rio Grande",uf:"RS",entidade:"COLÔNIA Z-1",analfabeto:"NAO",parcelasNaoRecebidas:"3",jurisdicao:"FORJADA"});assert.equal(p.jurisdicao,"RIO GRANDE");assert.equal(p.parcelasNaoRecebidas,"3");assert.equal(C.personDraftValues_(p).VALOR_CAUSA,"4.554,00");a=run("atendimentoSalvar",{pessoaId:p.id,demanda:"Seguro-Defeso 2025",referencia:"TESTE",parcelas:"Todas de 2025",valorCausa:"999,99"});assert.equal(a.valorCausa,"4.554,00");});
test('36 municípios retornam a jurisdição definida, inclusive sem acentos',()=>{
 const groups={PELOTAS:'Amaral Ferrador|Arroio do Padre|Arroio Grande|Canguçu|Capão do Leão|Cerrito|Herval|Jaguarão|Morro Redondo|Pedro Osório|Pelotas|Piratini|São Lourenço do Sul|Turuçu','RIO GRANDE':'Chuí|Rio Grande|Santa Vitória do Palmar|São José do Norte','CAPÃO DA CANOA':'Arroio do Sal|Balneário Pinhal|Capão da Canoa|Caraá|Cidreira|Dom Pedro de Alcântara|Imbé|Itati|Mampituba|Maquiné|Morrinhos do Sul|Osório|Terra de Areia|Torres|Tramandaí|Três Cachoeiras|Três Forquilhas|Xangri-lá'};
 let count=0;
 for(const [jurisdicao,municipios] of Object.entries(groups))for(const cidade of municipios.split('|')){
  count++;assert.equal(C.determinarJurisdicao(cidade),jurisdicao);
  assert.equal(C.determinarJurisdicao('  '+cidade.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()+'  '),jurisdicao);
  assert.ok(C.cfg_().municipios.includes(cidade));
 }
 assert.equal(count,36);assert.equal(C.determinarJurisdicao('Xangri – lá'),'CAPÃO DA CANOA');
});
test('jurisdição enviada manualmente é ignorada e gravada em Pessoas',()=>{
 for(const [cidade,jurisdicao] of [['Canguçu','PELOTAS'],['Chuí','RIO GRANDE'],['Torres','CAPÃO DA CANOA']]){
  p=run('pessoaSalvar',{...p,cidade,jurisdicao:'FORJADA'});
  assert.equal(p.jurisdicao,jurisdicao);assert.equal(fresh('Pessoas',p.id).jurisdicao,jurisdicao);
  assert.equal(C.personDraftValues_(p).JURISDICAO,jurisdicao);
 }
});
test('município adicional preservado sem presumir jurisdição; UF diferente bloqueia minuta',()=>{
 config('municipios',[...C.cfg_().municipios,'Porto Alegre']);
 assert.ok(C.cfg_().municipios.includes('Porto Alegre'));
 p=run('pessoaSalvar',{...p,cidade:'Porto Alegre',jurisdicao:'RIO GRANDE'});
 assert.equal(p.jurisdicao,'');assert.throws(()=>C.personDraftValues_(p),/sem jurisdição/);
 assert.equal(C.jurisdicaoPessoa_({cidade:'Pelotas',uf:'SC'}),'');
 assert.throws(()=>C.personDraftValues_({...p,cidade:'Pelotas',uf:'SC'}),/sem jurisdição/);
 p=run('pessoaSalvar',{...p,cidade:'Pelotas'});
});
test('instalação antiga é migrada sem deslocar colunas, com auditoria e repetição segura',()=>{
 const sh=C.ss_().getSheetByName('Pessoas'),cfgSh=C.ss_().getSheetByName('Configuracoes');
 const oldHeads=C.headers_('Pessoas').slice(0,-1),original=sh.rows.map(r=>r.slice(0,-1));
 sh.rows=original.map(r=>r.slice());
 const cf=rows('Configuracoes').find(r=>r.chave==='municipios');
 cfgSh.rows[C.row_('Configuracoes',cf.id)][C.headers_('Configuracoes').indexOf('valor')]='["Rio Grande","Pelotas","São José do Norte","Porto Alegre"]';
 C.resetData_();
 const beforeHist=rows('Historico').length;
 const boot=run('bootstrap');
 assert.ok(boot.config.municipios.includes('Torres'));assert.ok(boot.config.municipios.includes('Porto Alegre'));
 assert.equal(sh.rows[0].at(-1),'jurisdicao');
 const updated=fresh('Pessoas',p.id);assert.equal(updated.jurisdicao,'PELOTAS');
 original.forEach((r,i)=>r.forEach((v,j)=>{if(i===0||!['versao','alteradoEm','usuario'].includes(oldHeads[j]))assert.equal(sh.rows[i][j],v);}));
 assert.equal(updated.versao,p.versao+1);assert.ok(rows('Historico').length>beforeHist);
 const snapshot=JSON.stringify(sh.rows),hist=rows('Historico').length;
 run('bootstrap');assert.equal(JSON.stringify(sh.rows),snapshot);assert.equal(rows('Historico').length,hist);
 p=updated;
});
test('falha na gravação da migração pode ser reconciliada na próxima abertura',()=>{
 const sh=C.ss_().getSheetByName('Pessoas');sh.rows=sh.rows.map(r=>r.slice(0,-1));C.resetData_();
 failBatch=true;assert.throws(()=>run('bootstrap'),/Falha Sheets/);
 assert.equal(sh.rows[0].at(-1),'jurisdicao');
 run('bootstrap');p=fresh('Pessoas',p.id);assert.equal(p.jurisdicao,'PELOTAS');
});
test('migração rejeita cabeçalho divergente e conserva todas as células',()=>{
 const sh=C.ss_().getSheetByName('Pessoas'),original=sh.rows.map(r=>r.slice());
 sh.rows[0][5]='nome_indevido';const snapshot=JSON.stringify(sh.rows);C.resetData_();
 assert.throws(()=>run('bootstrap'),/Cabeçalhos alterados/);assert.equal(JSON.stringify(sh.rows),snapshot);
 sh.rows=original;C.resetData_();
});

test('modelo preenche JURISDIÇÃO e JURISDICAO nos dois fluxos de minuta',()=>{
 for(const token of ['JURISDIÇÃO','JURISDICAO']){
  const template=new File('modelo jurisdição','docs');
  template.text=vm.runInContext('PERSON_TEMPLATE_PLACEHOLDERS',context).map(k=>'<<'+k+'>>').join('\n')+'\n<<'+token+'>>';
  config('templateId',template.id);
  C.validatePersonTemplate_(template.id);
  const copy=template.makeCopy('teste',C.personFolder_(p));
  C.fillTemplateCopy_(copy,p);
  assert.ok(files.get(copy.id).text.includes('PELOTAS'));
  assert.ok(files.get(copy.id).text.includes('4.554,00'));
  assert.ok(!files.get(copy.id).text.includes('<<'));
  const result=run('pessoaFinalizarCadastro',{pessoaId:p.id});
  assert.ok(files.get(result.minutaBase.fileId).text.includes('PELOTAS'));
  assert.equal(result.minutaBase.parcelas,3);assert.equal(result.minutaBase.valorCausa,4554);
 }
});
test('minuta do atendimento usa jurisdição salva e mantém o cálculo de três parcelas',()=>{
 config('vencimentoFuturo','RECUSAR');config('anexoOrientacao','Anexo fictício de teste');
 for(const categoria of C.cfg_().categorias){
  const out=run('pessoaUpload',{pessoaId:p.id,categoria,mime:'application/pdf',base64:Buffer.from('%PDF-1.4 '+categoria).toString('base64'),vencimento:categoria==='RESIDENCIA'?'05/10/2026':''});
  run('documentoConferir',{...out.documento,conferido:true,processoCompleto:true,anexoPresente:true});
 }
 a=fresh('Atendimentos',a.id);a=run('encaminhar',{id:a.id,versao:a.versao});a=run('atendimentoConferir',{id:a.id,versao:a.versao});
 const m=run('minutaGerar',{id:a.id,versao:a.versao});
 assert.ok(files.get(m.fileId).text.includes('PELOTAS'));assert.ok(files.get(m.fileId).text.includes('4.554,00'));
 assert.ok(!files.get(m.fileId).text.includes('<<'));
});
test('modelo legado permanece válido e marcador desconhecido é bloqueado',()=>{
 const template=new File('legado','docs');template.text=vm.runInContext('PERSON_TEMPLATE_PLACEHOLDERS',context).map(k=>'<<'+k+'>>').join('\n');
 C.validatePersonTemplate_(template.id);template.text+='<<DESCONHECIDO>>';
 assert.throws(()=>C.validatePersonTemplate_(template.id),/desconhecidos/);
 assert.throws(()=>C.personDraftValues_({...p,jurisdicao:'RIO GRANDE'}),/desatualizada/);
});
test('acesso não autorizado não modifica os registros',()=>{
 const sh=C.ss_().getSheetByName('Pessoas'),before=JSON.stringify(sh.rows);email='intruso@example.test';
 assert.throws(()=>run('bootstrap'),/não autorizado/);assert.equal(JSON.stringify(sh.rows),before);email='admin@example.test';
});
console.log(passed+' cenários de jurisdição aprovados com serviços Google simulados.');
