import { spawn } from 'child_process';
import fs from 'fs';
const base='http://localhost:8795/penguin-volley/';
const bin=process.env.CHROME||'google-chrome';
const chrome=spawn(bin,['--headless=new','--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--user-data-dir=/tmp/pv-chrome','--remote-debugging-port=9360','--window-size=1200,760','about:blank'],{stdio:'ignore'});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let ws,id=0,fails=0;const pending=new Map(),errors=[];
for(let i=0;i<60;i++){try{const t=await(await fetch('http://127.0.0.1:9360/json/new?about:blank',{method:'PUT'})).json();ws=new WebSocket(t.webSocketDebuggerUrl);await new Promise(r=>ws.addEventListener('open',r));break}catch{await sleep(250)}}
if(!ws)throw new Error('Chrome did not start');
ws.addEventListener('message',({data})=>{const m=JSON.parse(data);if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id)}else if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);else if(m.method==='Log.entryAdded'&&m.params.entry.level==='error')errors.push(m.params.entry.text)});
const send=(method,params={})=>new Promise(r=>{const i=++id;pending.set(i,r);ws.send(JSON.stringify({id:i,method,params}))});
const ev=async expression=>(await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true})).result.result.value;
const pass=(v,msg)=>{if(!v)fails++;console.log(`${v?'PASS':'FAIL'} ${msg}`)};
const shot=async name=>{const r=await send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(`pv-artifacts/${name}.png`,Buffer.from(r.result.data,'base64'))};
const touch=async sel=>{const [x,y]=await ev(`(()=>{const r=document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect();return [r.x+r.width/2,r.y+r.height/2]})()`);await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});await sleep(80);await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})};
await send('Page.enable');await send('Runtime.enable');await send('Log.enable');await send('Network.enable');
await send('Page.navigate',{url:base+'?debug'});await sleep(1800);
// Corrupt persistent data must migrate to safe defaults.
await ev(`localStorage.setItem('penguin-volley',JSON.stringify({level:'god',points:'x',sound:'yes',speed:'warp',guide:'x',matchesStarted:-9}));localStorage.setItem('penguin-volley-stats',JSON.stringify({cpu:{easy:{w:'x',l:-2}},streak:'bad',spikes:-1}))`);await send('Page.reload');await sleep(1600);
pass(await ev(`!document.documentElement.classList.contains('is-rotated')`),'desktop menu upright');
pass(await ev(`__penguinVolley.settings.level==='normal'&&__penguinVolley.settings.points===15&&__penguinVolley.settings.matchesStarted===0`),'corrupt settings normalized');
pass(await ev(`__penguinVolley.stats.cpu.easy.w===0&&__penguinVolley.stats.spikes===0`),'corrupt records normalized');
pass(await ev(`document.querySelector('#setup').open`),'desktop settings open');
const records=await ev(`import('./js/stats.js').then(m=>{let s=m.resetStats();m.recordMatch(s,{mode:'cpu',level:'hard',won:true,longestRally:12,spikes:4});return m.loadStats()})`);
pass(records.cpu.hard.w===1&&records.longestRally===12&&records.spikes===4,'records persist');
// Portrait phone: menu stays upright and compact.
await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:3,mobile:true,screenOrientation:{type:'portraitPrimary',angle:0}});await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});await ev(`localStorage.clear()`);await send('Page.reload');await sleep(1800);
pass(!(await ev(`document.documentElement.classList.contains('is-rotated')`)),'portrait landing menu upright');
pass(!(await ev(`document.querySelector('#setup').open`)),'phone settings collapsed');
const menu=await ev(`(()=>{const o=document.querySelector('#menu'),b=document.querySelector('[data-mode="cpu"]');const r=b.getBoundingClientRect();return {button:r.height,inside:r.top>=0&&r.bottom<=innerHeight,scroll:o.scrollHeight>=o.clientHeight}})()`);
pass(menu.button>=44&&menu.inside,'start button reachable and 44px');await shot('menu-portrait');
await touch('[data-mode="cpu"]');await sleep(700);const orient=await ev(`({rot:document.documentElement.classList.contains('is-rotated'),portrait:matchMedia('(orientation:portrait)').matches,mode:__penguinVolley.game.mode,playing:document.body.classList.contains('is-playing')})`);
pass(orient.mode==='cpu'&&orient.playing,'phone match starts');pass(!orient.portrait||orient.rot,'portrait match enters landscape or fallback rotation');
await sleep(2500);const boxes=await ev(`(()=>{const s=document.querySelector('.stage').getBoundingClientRect();const bs=[...document.querySelectorAll('#touch button')].map(x=>{const r=x.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height}});return{iw:innerWidth,ih:innerHeight,s:{x:s.x,y:s.y,w:s.width,h:s.height},bs}})()`);
pass(boxes.bs.every(b=>b.w>=52&&b.h>=52),'large touch targets');pass(boxes.bs.every(b=>b.x>=-1&&b.y>=-1&&b.x+b.w<=boxes.iw+1&&b.y+b.h<=boxes.ih+1),'touch targets inside viewport');pass(boxes.bs.every(b=>{const s=boxes.s;return b.x+b.w>=s.x&&b.x<=s.x+s.w&&b.y+b.h>=s.y&&b.y<=s.y+s.h}),'touch targets anchored to court');
const [rx,ry]=await ev(`(()=>{const r=document.querySelector('[data-key="right"]').getBoundingClientRect();return[r.x+r.width/2,r.y+r.height/2]})()`),x0=await ev(`__penguinVolley.game.world.players[0].x`);await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:rx,y:ry}]});await sleep(450);await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});const x1=await ev(`__penguinVolley.game.world.players[0].x`);pass(x1>x0+30,'rotated touch movement works');
const [ux,uy]=await ev(`(()=>{const r=document.querySelector('[data-key="up"]').getBoundingClientRect();return[r.x+r.width/2,r.y+r.height/2]})()`);const tapUp=async()=>{await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:ux,y:uy}]});await sleep(70);await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})};await tapUp();await sleep(160);await tapUp();await sleep(30);pass(await ev(`__penguinVolley.game.world.players[0].state==='air'&&__penguinVolley.game.world.players[0].autoSpike===true`),'one-thumb jump then spike');pass((await ev(`document.querySelector('#status').textContent`)).length>5,'score and hint announced');await shot('game-portrait');
// Menu restores portrait.
await ev(`document.querySelector('#pause-btn').click()`);await sleep(100);await ev(`document.querySelector('#pause [data-action="menu"]').click()`);await sleep(450);pass(!(await ev(`document.documentElement.classList.contains('is-rotated')`)),'return to menu restores portrait');
// Pre-connected gamepads: hints and player-two movement.
await ev(`(()=>{const b=p=>({pressed:p,value:p?1:0}),pad=i=>({axes:[0,0],buttons:Array.from({length:17},()=>b(false)),connected:true,index:i,id:'pad'+i,mapping:'standard'});window.__pads=[pad(0),pad(1)];navigator.getGamepads=()=>window.__pads})()`);await ev(`__penguinVolley.startMatch('2p')`);await sleep(100);const hint=await ev(`__penguinVolley.game.hint`);pass(Array.isArray(hint)&&hint.length===2&&hint.every(x=>x.includes('A jump')),'pre-connected gamepads get pad hints');await sleep(2200);const p0=await ev(`__penguinVolley.game.world.players[1].x`);await ev(`__pads[1].axes[0]=-1`);await sleep(400);await ev(`__pads[1].axes[0]=0`);const p1=await ev(`__penguinVolley.game.world.players[1].x`);pass(p1<p0-30,'second gamepad moves player two');
// Offline reload.
pass(await ev(`navigator.serviceWorker.ready.then(()=>true)`),'service worker ready');await send('Page.reload');await sleep(1600);await send('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:-1,uploadThroughput:-1});await send('Page.reload');await sleep(1800);pass(await ev(`!!document.querySelector('#court')&&typeof __penguinVolley==='object'`),'app reloads offline');await send('Network.emulateNetworkConditions',{offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1});
console.log('ERRORS',errors.length,errors.slice(0,3));pass(errors.length===0,'no runtime/CSP errors');console.log(fails?`FAILED ${fails}`:'ALL PASSED');ws.close();chrome.kill();process.exit(fails?1:0);
