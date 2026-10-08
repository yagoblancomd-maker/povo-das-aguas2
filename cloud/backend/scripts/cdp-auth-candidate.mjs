import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';

const chrome='C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const port=9227;
const profile='C:\\Users\\yagof\\AppData\\Local\\Temp\\pda-cdp-auth-candidate';
const url='https://candidate---povo-das-aguas-api-22665r35ja-rj.a.run.app/';
const outDir='C:\\Users\\yagof\\PovoDasAguasCloud\\ux-check';
await fs.rm(profile,{recursive:true,force:true}).catch(()=>{});
await fs.mkdir(outDir,{recursive:true});
const args=['--remote-debugging-port='+port,'--remote-allow-origins=*','--user-data-dir='+profile,'--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--window-size=1440,1000',url];
const proc=spawn(chrome,args,{stdio:'ignore',detached:false});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
let list;
let target;
for(let i=0;i<60;i++){try{list=await (await fetch('http://127.0.0.1:'+port+'/json/list')).json();target=list.find(x=>x.type==='page'&&String(x.url||'').startsWith(url));if(target?.webSocketDebuggerUrl)break;}catch{} await sleep(250);}
if(!target?.webSocketDebuggerUrl)throw new Error('Aba da aplicacao nao localizada no CDP');
const ws=new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res,rej)=>{ws.onopen=res;ws.onerror=rej});
let seq=0; const pending=new Map();
ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){const x=pending.get(m.id);pending.delete(m.id);m.error?x.rej(new Error(m.error.message)):x.res(m.result);}};
function cdp(method,params={}){return new Promise((res,rej)=>{const id=++seq;pending.set(id,{res,rej});ws.send(JSON.stringify({id,method,params}));});}
await cdp('Page.enable'); await cdp('Runtime.enable'); await cdp('Network.enable');
for(let i=0;i<80;i++){const r=await cdp('Runtime.evaluate',{expression:'document.readyState',returnByValue:true});if(r.result.value==='complete')break;await sleep(250);}
await sleep(800);
const evalv=async expression=>(await cdp('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true})).result.value;
const snap=async name=>{const s=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await fs.writeFile(outDir+'\\'+name,Buffer.from(s.data,'base64'));};
const suffix=Date.now().toString().slice(-7);
const username='ux'+suffix;
const email=username+'@example.invalid';
await evalv(`(()=>{document.querySelector('[data-auth-page="register"]').click();return true})()`);
await sleep(250);
await evalv(`(()=>{const f=document.querySelector('#pda-auth-register-form');const set=(n,v)=>{const e=f.querySelector('[name="'+n+'"]');e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));};set('nome','Teste UX Cloud');set('nomeUsuario',${JSON.stringify(username)});set('email',${JSON.stringify(email)});set('funcao','Colaborador');set('senha','UxA9!'+crypto.randomUUID().replaceAll('-',''));f.requestSubmit();return true})()`);
let logged=false;
for(let i=0;i<80;i++){await sleep(250);logged=await evalv(`(()=>{const o=document.querySelector('.pda-auth-overlay');return !!o&&(o.hidden||getComputedStyle(o).display==='none')})()`);if(logged)break;}
if(!logged)throw new Error('Cadastro/login de teste nao concluiu');
await sleep(900);
const homeText=(await evalv('document.body.innerText')).slice(0,7000);
await snap('candidate-home-desktop.png');
async function open(label,file){const clicked=await evalv(`(()=>{const els=[...document.querySelectorAll('button,a,[role="button"]')];const e=els.find(x=>x.textContent.trim()===${JSON.stringify(label)}||x.textContent.trim().startsWith(${JSON.stringify(label)}));if(!e)return false;e.click();return true})()`);await sleep(900);const text=(await evalv('document.body.innerText')).slice(0,5000);if(clicked)await snap(file);return {clicked,text};}
const screens={};
for(const [label,file] of [['Consultas','candidate-consultas-desktop.png'],['Tarefas','candidate-tarefas-desktop.png'],['Meu perfil','candidate-perfil-desktop.png']])screens[label]=await open(label,file);
await cdp('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});await sleep(500);await snap('candidate-current-mobile.png');
async function openGroup(label,file){const opened=await evalv(`(()=>{const s=[...document.querySelectorAll('summary')].find(x=>x.textContent.trim().startsWith(${JSON.stringify(label)}));if(!s)return false;s.click();return s.parentElement.open===true})()`);await sleep(350);const visible=await evalv(`(()=>{const s=[...document.querySelectorAll('summary')].find(x=>x.textContent.trim().startsWith(${JSON.stringify(label)}));if(!s||!s.parentElement.open)return [];return [...s.parentElement.querySelectorAll('.nav-submenu button')].filter(x=>getComputedStyle(x).display!=='none').map(x=>x.textContent.trim())})()`);if(opened)await snap(file);await evalv(`(()=>{const s=[...document.querySelectorAll('summary')].find(x=>x.textContent.trim().startsWith(${JSON.stringify(label)}));if(s&&s.parentElement.open)s.click();return true})()`);return {opened,visible};}
const groups={Consultas:await openGroup('Consultas','candidate-consultas-mobile.png'),Distribuicao:await openGroup('Distribuição','candidate-distribuicao-mobile.png')};
const mobile={scrollWidth:await evalv('document.documentElement.scrollWidth'),clientWidth:await evalv('document.documentElement.clientWidth'),scrollHeight:await evalv('document.documentElement.scrollHeight')};
console.log('UX_AUTH='+JSON.stringify({username,email,logged,homeText,screens,groups,mobile}));
ws.close(); proc.kill();
