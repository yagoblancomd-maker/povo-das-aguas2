// DOM mínimo para executar scripts reais de autenticação/perfil. Não substitui navegador Google.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const {C,sentMail}=require('./tests/apps-script-fixture.cjs');
C.instalar_();
class Node{
 constructor(tag,attrs={}){this.tag=tag;this.children=[];this.attributes={...attrs};this.dataset={};this.value='';this.textContent='';this.hidden=false;this.disabled=false;
  for(const [key,value]of Object.entries(attrs)){if(key==='class')this.className=value;else if(key.startsWith('data-'))this.dataset[key.slice(5).replace(/-([a-z])/g,(_,a)=>a.toUpperCase())]=value;else this[key]=value;}
  this.classList={add:(...xs)=>this.className=[...new Set([...(this.className||'').split(' '),...xs])].filter(Boolean).join(' '),remove:x=>this.className=(this.className||'').split(' ').filter(y=>y!==x).join(' ')};
 }
 append(...nodes){nodes.forEach(n=>{n.parentElement=this;this.children.push(n)})}
 replaceChildren(...nodes){this.children=[];this.append(...nodes)}
 setAttribute(k,v){this.attributes[k]=v;if(k==='class')this.className=v;else this[k]=v}
 removeAttribute(k){delete this.attributes[k];delete this[k]}
 getAttribute(k){return this.attributes[k]}
 walk(){return [this,...this.children.flatMap(n=>n.walk())]}
 get elements(){return {namedItem:name=>this.walk().find(n=>n.name===name)}}
 matches(s){const attr=s.match(/\[([^=\]]+)(?:="?([^"\]]+)"?)?\]/),base=s.replace(/\[.*\]/,'');if(attr&&(attr[2]===undefined?(this[attr[1]]===undefined&&this.attributes[attr[1]]===undefined):String(this[attr[1]]??this.attributes[attr[1]])!==attr[2]))return false;
  if(base.startsWith('.'))return (this.className||'').split(' ').includes(base.slice(1));if(base.startsWith('#'))return this.id===base.slice(1);return !base||this.tag===base;
 }
 querySelectorAll(selector){return this.walk().slice(1).filter(n=>selector.split(',').some(raw=>{const parts=raw.trim().split(/\s+/);if(!n.matches(parts.pop()))return false;let parent=n.parentElement;while(parts.length&&parent){if(parent.matches(parts.at(-1)))parts.pop();parent=parent.parentElement}return parts.length===0}))}
 querySelector(s){return this.querySelectorAll(s)[0]||null}
 reportValidity(){return true}
}
function parse(html){const root=new Node('body'),stack=[root];for(const m of html.matchAll(/<\/?[a-zA-Z][^>]*>/g)){
 const s=m[0],tag=s.match(/^<\/?([^\s/>]+)/)[1];if(s.startsWith('</')){if(stack.length>1)stack.pop();continue;}
 const attrs={};for(const a of s.matchAll(/\s([\w-]+)(?:="([^"]*)")?/g))attrs[a[1]]=a[2]??true;
 const n=new Node(tag,attrs);stack.at(-1).append(n);if(!['input','img','meta','br','hr','link'].includes(tag)&&!s.endsWith('/>'))stack.push(n);
 }return root;}
const body=parse(fs.readFileSync('AUTH_View.html','utf8')),shell=new Node('div',{id:'app-shell'}),app=new Node('main',{id:'app'});shell.append(app);body.append(shell);const storage=new Map(),messages=[];
let started=0,context;
const document={body,getElementById:id=>body.walk().find(n=>n.id===id),createElement:tag=>new Node(tag),querySelectorAll:s=>body.querySelectorAll(s)};
const runner=()=>{let good,bad;const proxy=new Proxy({},{get:(_,key)=>key==='withSuccessHandler'?fn=>{good=fn;return proxy}:key==='withFailureHandler'?fn=>{bad=fn;return proxy}:(...args)=>{Promise.resolve().then(()=>{try{good(C[key](...args))}catch(e){bad(e)}})}});return proxy;};
const ui={el:(tag,text,cls)=>{const n=new Node(tag);n.textContent=text||'';n.className=cls||'';return n},card:title=>{const n=new Node('section');n.append(new Node('h3'));n.children[0].textContent=title;return n},button:(title,fn)=>{const b=new Node('button');b.textContent=title;b.onclick=fn;return b},status:(text,error)=>messages.push({text,error}),alive:()=>true,start:async()=>{started++}};
context={console,document,Promise,Error,String,Object,Array,JSON,Set,crypto:crypto.webcrypto,localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v),removeItem:k=>storage.delete(k)},window:{PDA_AUTH_BOOTSTRAP:C.authPageBootstrap_({}),PDA_MODULES:{},App:ui},google:{script:{get run(){return runner()}}}};vm.createContext(context);
const script=name=>fs.readFileSync(name,'utf8').replace(/^\s*<script>/,'').replace(/<\/script>\s*$/,'');vm.runInContext(script('AUTH_Script.html'),context);
const auth=context.window.PDA_AUTH,form=code=>document.getElementById('pda-auth-'+code+'-form'),field=(code,name)=>form(code).elements.namedItem(name),submit=code=>form(code).onsubmit({preventDefault(){}});
async function drain(check){for(let i=0;i<1000;i++){await new Promise(r=>setImmediate(r));if(check())return;}throw Error('Estado esperado não chegou');}
function setFields(code,data){for(const [k,v]of Object.entries(data))field(code,k).value=v;}
(async()=>{
 const initial=auth.ensureAuthenticated();assert.equal(form('login').hidden,false);document.querySelectorAll('[data-auth-page]').find(n=>n.dataset.authPage==='register').onclick();
 assert.equal(form('register').hidden,false);assert.equal(form('register').querySelectorAll('input[type="password"]').length,1);assert.ok(!field('register','confirmarSenha'));
 setFields('register',{nome:'Nome Teste',email:'ui@example.test',funcao:'Colaborador',senha:'a'});form('register').querySelector('.pda-password-toggle').onclick();assert.equal(field('register','senha').type,'text');submit('register');const result=await initial;assert.ok(result.sessionToken);assert.equal(shell.hidden,false);assert.equal(field('register','senha').value,'');console.log('PASS autocadastro e entrada com apenas um campo de senha');
 await auth.logout();assert.equal(form('login').hidden,false);assert.equal(app.children.length,0);setFields('login',{email:'ui@example.test',senha:'errada'});submit('login');await drain(()=>form('login').querySelector('button[type="submit"]').disabled===false);assert.equal(document.getElementById('pda-auth-message').hidden,false);
 setFields('login',{email:'ui@example.test',senha:'a'});submit('login');await drain(()=>shell.hidden===false);assert.equal(started,1);console.log('PASS login incorreto, logout no servidor e reentrada sem recarregar página');
 // Espera o finally do formulário antes de continuar.
 await drain(()=>form('login').querySelector('button[type="submit"]').disabled===false);
 const profile=parse(fs.readFileSync('PERF_View.html','utf8')).children[0];app.append(profile);vm.runInContext(script('PERF_Script.html'),context);await context.window.PDA_MODULES.PERF({root:profile,token:1});
 const pf=profile.querySelectorAll('form')[0];pf.elements.namedItem('nomeUsuario').value='Nome de usuário';pf.elements.namedItem('email').value='ui-novo@example.test';pf.elements.namedItem('senhaAtual').value='a';
 pf.onsubmit({preventDefault(){}});await drain(()=>started===2);assert.equal(C.authResume(auth.getSessionToken()).usuario.email,'ui-novo@example.test');assert.equal(C.authResume(auth.getSessionToken()).usuario.nomeUsuario,'Nome de usuário');console.log('PASS módulo de perfil usa assinatura correta e renova sessão após troca de e-mail');
 await drain(()=>profile.querySelectorAll('button').every(b=>!b.disabled));const pass=profile.querySelectorAll('form')[1];assert.equal(pass.querySelectorAll('input[type="password"]').length,2);pass.elements.namedItem('senhaAtual').value='a';pass.elements.namedItem('novaSenha').value='b';pass.onsubmit({preventDefault(){}});await drain(()=>started===3);assert.equal(C.authLogin('ui-novo@example.test','b').status,'AUTHENTICATED');console.log('PASS troca de senha no perfil sem campo de confirmação');
 await auth.logout();document.querySelectorAll('[data-auth-page]').find(n=>n.dataset.authPage==='recovery').onclick();setFields('recovery',{email:'ui-novo@example.test'});submit('recovery');await drain(()=>sentMail.length>0);assert.ok(sentMail.at(-1).body.includes('?reset='));
 await drain(()=>form('recovery').querySelector('button[type="submit"]').disabled===false);
 context.window.PDA_AUTH_BOOTSTRAP.resetToken=sentMail.at(-1).body.match(/reset=([a-f0-9]{64})/)[1];const recoveryReady=auth.ensureAuthenticated();assert.equal(form('reset').hidden,false);
 setFields('reset',{senha:'r'});submit('reset');await drain(()=>form('login').hidden===false);
 setFields('login',{email:'ui-novo@example.test',senha:'r'});submit('login');await recoveryReady;await drain(()=>form('login').querySelector('button[type="submit"]').disabled===false);
 await auth.ensureAuthenticated();assert.equal(shell.hidden,false);assert.equal(context.window.PDA_AUTH_BOOTSTRAP.resetToken,'');console.log('PASS recuperação, definição de senha e reentrada sem reapresentar o link usado');
 assert.ok(!messages.some(m=>m.error));console.log('5 fluxos da interface aprovados em DOM simulado.');
})().catch(e=>{console.error(e);process.exitCode=1});
