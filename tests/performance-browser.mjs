import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const base=process.env.PERFORMANCE_BASELINE || '7214cd2ca0fec8be3e541d6d581f54df32273959';
const old=p=>execFileSync('git',['show',`${base}:src/js/${p}.js`],{maxBuffer:20e6}).toString();
const target=await(await fetch('http://127.0.0.1:9337/json/new?about:blank',{method:'PUT'})).json();
const ws=new WebSocket(target.webSocketDebuggerUrl);
await new Promise(r=>ws.addEventListener('open',r,{once:true}));
let id=0;const pending=new Map(),errors=[];
ws.addEventListener('message',e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result);}if(m.method==='Runtime.exceptionThrown')errors.push(m.params.exceptionDetails);});
const send=(method,params={})=>new Promise((resolve,reject)=>{const n=++id;pending.set(n,{resolve,reject});ws.send(JSON.stringify({id:n,method,params}));});
const ev=async expression=>{const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;};
try{
 await send('Page.enable');await send('Runtime.enable');
 await send('Emulation.setDeviceMetricsOverride',{width:800,height:600,deviceScaleFactor:1,mobile:false});
 await send('Page.addScriptToEvaluateOnNewDocument',{source:`let seed=7;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};window.addEventListener('DOMContentLoaded',()=>{Engine.snapPump=()=>{};Engine.mapPrefetchList=()=>[];});const raf=requestAnimationFrame;window.requestAnimationFrame=fn=>fn.name==='frame'?0:raf(fn);`});
 await send('Page.navigate',{url:pathToFileURL(path.resolve('Open Waters.html')).href+'?seed=42#seed-42&map&climate-temperate'});
 let ready=false;for(let i=0;i<180;i++){await new Promise(r=>setTimeout(r,500));if(await ev('typeof Engine!=="undefined" && !!Engine.ang && !document.getElementById("loading")')){ready=true;break;}}
 assert.ok(ready,'game booted');assert.ok(await ev("Birds.draw.toString().includes('drawGroups')"),'fresh candidate code loaded');console.log('Game booted; comparing frozen scenes.');
 const shaderSource=old('shaders/lit')+'\n'+old('shaders/water')+'\nreturn {LIT_VS,LIT_FS,WATER_VS,WATER_FS};';
 const oldBird=old('birds');const drawStart=oldBird.indexOf('    draw(R, gl, L, E) {');const drawEnd=oldBird.indexOf('\n    },\n  };',drawStart);
 const birdDraw='function(R, gl, L, E) {'+oldBird.slice(drawStart+'    draw(R, gl, L, E) {'.length,drawEnd)+'\n}';
 const result=await ev(`(()=>{
  const E=Engine,gl=E.gl,sh=new Function(${JSON.stringify(shaderSource)})();
  const compile=(vs,fs)=>{const p=gl.createProgram();for(const [type,text]of [[gl.VERTEX_SHADER,vs],[gl.FRAGMENT_SHADER,fs]]){const s=gl.createShader(type);gl.shaderSource(s,text);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));gl.attachShader(p,s);gl.deleteShader(s);}gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));const u={};for(let i=0;i<gl.getProgramParameter(p,gl.ACTIVE_UNIFORMS);i++){const n=gl.getActiveUniform(p,i).name;u[n]=gl.getUniformLocation(p,n);}return {p,u}};
  const baseline={lit:compile(sh.LIT_VS,sh.LIT_FS),water:compile(sh.WATER_VS,sh.WATER_FS)};
  const candidate={lit:E.lit,water:E.water},originalBird=${birdDraw},batchedBird=Birds.draw;
  const rawAnimal=E.animalMesh;
  const rawMesh=(mesh,stride=40)=>{const ib=gl.createBuffer(),vbo=E.vbo(mesh);return {ib,vbo,vb:vbo,vao:E.litVao(vbo,VB,ib,stride),n:mesh.length/VS}};
  E.showMap=false;E.pauseOpen=false;E.time=18;E.tod=.4;E.bgLeft=0;E.drawOverlay=()=>{};
  E.streamChunks(2000,4);for(const ch of E.chunks.values())if(!ch.ground)ch.ground=E.groundGen(ch);
  const treeMeshesData=treeMeshes(),rawTrees=TREE_KINDS.map(k=>({hi:{vbo:E.vbo(treeMeshesData[k]),n:treeMeshesData[k].length/VS},lo:{vbo:E.vbo(treeMeshesData[k+'L']),n:treeMeshesData[k+'L'].length/VS}}));
  const indexedTrees=E.treeKinds,treeStates=[{batches:{},treeSig:0,propKey:'',propUsed:[]},{batches:{},treeSig:0,propKey:'',propUsed:[]}];let cur=-1;
  const fishGpu=[[],[]],birdGpu=new Map();for(const b of Birds.list)birdGpu.set(b.sp,[[],[]]);
  const state=mode=>{if(cur>=0)Object.assign(treeStates[cur],{batches:E.batches,treeSig:E.treeSig,propKey:E.propKey,propUsed:E.propUsed});cur=mode;E.lit=mode?candidate.lit:baseline.lit;E.water=mode?candidate.water:baseline.water;E.treeKinds=mode?indexedTrees:rawTrees;Object.assign(E,treeStates[mode]);FishDB.gpu=fishGpu[mode];E.animalMesh=mode?rawAnimal:rawMesh;Birds.draw=mode?batchedBird:originalBird;for(const [sp,gs]of birdGpu)sp.gpu=gs[mode];};
  const pixels=mode=>{state(mode);gl.bindFramebuffer(gl.FRAMEBUFFER,null);E.render();const w=E.canvas.width,h=E.canvas.height,a=new Uint8Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,a);const err=gl.getError();if(err)throw Error('WebGL error '+err);return a};
  const compare=name=>{const a=pixels(0),b=pixels(1);let changed=0,max=0,sum=0;for(let i=0;i<a.length;i++){const d=Math.abs(a[i]-b[i]);if(d)changed++;max=Math.max(max,d);sum+=d;}return {name,changedChannels:changed,maxChannelDifference:max,meanDifference:sum/a.length};};
  const scenes=[];scenes.push(compare('shore'));
  Object.assign(ENV,{snowCover:0,rain:1,wind:.9});scenes.push(compare('rain'));
  Object.assign(ENV,{snowCover:.8,rain:0,iceLake:.6,icePond:.8});scenes.push(compare('winter'));
  Object.assign(ENV,{snowCover:0,rain:0,iceLake:0,icePond:0});
  const P=E.P,home={...P};sample(P.x,P.y);P.z=SW-EYE-1;P.pitch=0;
  const D=FishDB.byId.rainbow_trout,si=FishDB.list.indexOf(D),ca=Math.cos(P.a),sa=Math.sin(P.a);
  E.fish=[];for(let i=0;i<6;i++){const f=E.makeFish({si,id:'test'+i,hx:P.x+ca*(3+i*2)-sa*(i%2),hy:P.y+sa*(3+i*2)+ca*(i%2),size:{cm:80,kg:3},lead:-1,r:.4});Object.assign(f,{z:P.z+EYE,a:P.a+Math.PI/2,pitch:.25,ph:i,open:i/6,len:i<3?.8:.12});E.fish.push(f);}scenes.push(compare('underwater fish'));
  // Nearby birds share a pose but have independent roll and pitch. Compare both geometry paths.
  Object.assign(P,home);if(Birds.list.length){const b=Birds.list[0];Birds.list=Array.from({length:12},(_,i)=>({...b,st:'fly',frame:i<8?0:1,x:P.x+ca*(8+(i%4)*2)-sa*((i/4|0)-1)*3,y:P.y+sa*(8+(i%4)*2)+ca*((i/4|0)-1)*3,z:P.z+EYE+2+(i%3)*.4,roll:(i-6)*.08,pitch:(i%3)*.12}));scenes.push(compare('flock with independent tilt'));}
  state(1);let birdDraws=0;const draw=E.drawMesh;E.drawMesh=function(...args){birdDraws++;return draw.apply(this,args)};gl.useProgram(E.lit.p);Birds.draw(E,gl,E.lit,[P.x,P.y,P.z+EYE]);E.drawMesh=draw;
  // Compare cached and rebuilt batches, plus stale high/low animal mesh replacement.
  scenes.push(compare('repeat cached batches'));const g=E.fishGpu(si);E.fishGpu(si,true);g.stale=true;E.fishGpu(si);if(gl.getError())throw Error('stale mesh replacement');
  const dbg=gl.getExtension('WEBGL_debug_renderer_info');return {scenes,birds:Birds.list.length,birdDraws,renderer:dbg?gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL):'unknown',chunks:E.chunks.size};
 })()`);
 console.log(JSON.stringify(result,null,2));
 for(const s of result.scenes)assert.ok(s.maxChannelDifference<=1 && s.meanDifference<.01,`${s.name}: image changed`);
 assert.equal(result.birdDraws,2,'12 birds in two pose batches');assert.deepEqual(errors,[],'no runtime errors');
 console.log('Browser rendering checks passed.');
} finally {ws.close();}
