// CPU-only benchmark. Run with an optional git revision to measure the prior implementation.
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
const rev=process.argv[2],read=p=>rev?execFileSync('git',['show',`${rev}:${p}`],{maxBuffer:20e6}).toString():fs.readFileSync(p,'utf8');
const island=[...read('src/index.html').matchAll(/js\/(world\/island[\w-]*)\.js/g)].map(m=>m[1]);   // world/island-*.js (one world/island.js in older revisions)
const files=['config','world/worldgen',...island,'engine/shared','world/seasons-weather','world/water-temp','world/water-plants-grid'];
const api=new Function('location','history','matchMedia','Engine',files.map(f=>read(`src/js/${f}.js`)).join('\n')+`\nreturn {sample,plantAt,buildIsland,clear(){cache.clear();lastKey=-1;lastChunk=null;if(typeof partialLattices!=='undefined')partialLattices.clear();},resetPlants(){if(typeof plantCache!=='undefined')plantCache.type.fill(0);}};`)({search:'?seed=42',hash:'#map&climate-temperate'},{replaceState(){}},()=>({matches:false}),{tod:.4});
api.buildIsland(true);
const summarize=a=>{a.sort((a,b)=>a-b);return {medianMs:+a[a.length/2|0].toFixed(3),p95Ms:+a[a.length*.95|0].toFixed(3),maxMs:+a.at(-1).toFixed(3)}};
const samples=[];for(let i=0;i<50;i++){api.clear();const t=performance.now();api.sample(6000+(i%7)*128,6000+(i%5)*128);samples.push(performance.now()-t);}
// Use a locality-heavy grid like repeated habitat queries. Warm before timing.
const plants=[];for(let i=0;i<5000;i++)api.plantAt(2400+i%32,2400+(i/32|0)%32);
for(let run=0;run<9;run++){const t=performance.now();for(let i=0;i<100000;i++)api.plantAt(2400+i%32,2400+(i/32|0)%32);plants.push(performance.now()-t);}
console.log(JSON.stringify({revision:rev||'working tree',coldSample:summarize(samples),plantQueries100000:summarize(plants)},null,2));
