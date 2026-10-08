import {spawn} from 'node:child_process';
import fs from 'node:fs/promises';

const chrome='C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const port=9226;
const profile='C:\\Users\\yagof\\AppData\\Local\\Temp\\pda-cdp-candidate-mobile';
const url='https://candidate---povo-das-aguas-api-22665r35ja-rj.a.run.app/';
const outDir='C:\\Users\\yagof\\PovoDasAguasCloud\\ux-check';
await fs.rm(profile,{recursive:true,force:true}).catch(()=>{});
await fs.mkdir(outDir,{recursive:true});
const args=['--remote-debugging-port='+port,'--remote-allow-origins=*','--user-data-dir='+profile,'--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--window-size=390,844',url];
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
await sleep(1000);
const text=(await cdp('Runtime.evaluate',{expression:'document.body.innerText',returnByValue:true})).result.value;
const html=(await cdp('Runtime.evaluate',{expression:'document.documentElement.outerHTML.slice(0,50000)',returnByValue:true})).result.value;
const perfExpr="(()=>{const n=performance.getEntriesByType('navigation')[0];return n?{domContentLoaded:n.domContentLoadedEventEnd,load:n.loadEventEnd,transferSize:n.transferSize,duration:n.duration}:null})()";
const perf=(await cdp('Runtime.evaluate',{expression:perfExpr,returnByValue:true})).result.value;
const shot=await cdp('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
await fs.writeFile(outDir+'\\candidate-login-mobile.png',Buffer.from(shot.data,'base64'));
await fs.writeFile(outDir+'\\candidate-login-mobile-dom.txt',text);
await fs.writeFile(outDir+'\\candidate-login-mobile-html.txt',html);
console.log(JSON.stringify({perf,text:text.slice(0,6000)},null,2));
ws.close(); proc.kill();

