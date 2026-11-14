import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

// Optional baseline revision allows a direct differential run against an earlier implementation.
const revision = process.argv[2];
const read = p => revision ? execFileSync('git', ['show', `${revision}:${p}`], {maxBuffer: 20e6}).toString() : fs.readFileSync(p, 'utf8');
// the island is split into world/island-*.js (one world/island.js in older revisions): take them from index.html, in order
const island = [...read('src/index.html').matchAll(/js\/(world\/island[\w-]*)\.js/g)].map(m => m[1]);
const files = ['config', 'world/worldgen', ...island, 'engine/shared', 'shaders/lit', 'world/seasons-weather', 'world/water-temp', 'world/water-plants-grid', 'world/habitat', 'world/fish-populations', 'models/mesh-builder', 'models/trees', 'creatures/fish', 'creatures/cephalopods-shellfish', 'creatures/jellies', 'creatures/reptiles-amphibians'];
const sim = [...read('src/index.html').matchAll(/<script src="(sim\/[\w-]+\.js)">/g)].map(m => read(`src/${m[1]}`));   // the shared simulation (src/sim/) goes first: the game's scripts build on it
// map features are built-in JSON, read at boot in the game (boot.js); older revisions without them get an empty list
const features = [...read('src/index.html').matchAll(/data-builtin="feature" src="([^"]+)"/g)].map(m => read(`src/${m[1]}`));
// plants likewise (src/plants/*.json, registered at boot); older revisions had them in code
const plants = [...read('src/index.html').matchAll(/data-builtin="plant" src="([^"]+)"/g)].map(m => read(`src/${m[1]}`));
const source = `var BUILTIN = { fish: [], boat: [], tackle: [], feature: [${features.join(',')}], plant: [${plants.join(',')}] };\n` + sim.concat(files.map(f => read(`src/js/${f}.js`))).join('\n')
  + `\nif (typeof registerPlants === 'function') registerPlants(BUILTIN.plant);`;
const fixtures = [];
for (const climate of ['temperate', 'tropical', 'arctic']) {
  const api = new Function('location', 'history', 'matchMedia', 'localStorage', 'Engine', source + `
    return { CONFIG, ENV, FishDB, treeMeshes, sample, getChunk, latticeGen, fillPoint, cache,
      plantAt, coverAt, cellFish, buildIsland, findWater, FISH_CELL, VS,
      state:()=>[SE,SM,SW,SK,SR], plant:()=>({...PL}),
      indexed:typeof indexMesh==='function'?indexMesh:null,
      partial:typeof partialLattices==='undefined'?null:partialLattices,
      clear(){cache.clear();lastKey=-1;lastChunk=null;if(typeof partialLattices!=='undefined')partialLattices.clear();},
      countFills(){let n=0;const orig=fillPoint;fillPoint=(...a)=>{n++;return orig(...a)};return ()=>{fillPoint=orig;return n;};},
      plantReset(){if(typeof plantCache!=='undefined')plantCache.type.fill(0);}
    };`)({search:'?seed=42',hash:`#seed-42&map&climate-${climate}`}, {replaceState(){}}, () => ({matches:false}), {getItem(){return null}}, {tod:0.4});
  api.buildIsland(true);
  for (const [, name] of read('src/index.html').matchAll(/data-builtin="fish" src="([^"]+)"/g)) {
    const r=api.FishDB.register(JSON.parse(read(`src/${name}`)),{quiet:true}); assert.ok(r.def, name);
  }
  if(api.partial){api.clear();const count=api.countFills();api.sample(6000,6000);assert.equal(count(),4,'a cold sample evaluates only four points');}
  const digest=createHash('sha256'), add=v=>digest.update(JSON.stringify(v));
  const points=[[-128.001,-.001],[-128,0],[-127.999,.001],[127.999,128.001],[6000,6000],[-6000,-6000],[0,0]];
  for(let i=0;i<80;i++)points.push([Math.sin(i*2.4)*3100,Math.cos(i*1.8)*3100]);
  // Direct full-grid reference: identical Float32 stores and interpolation, independent of cache path.
  const refs=new Map();
  function reference(x,y){const gx=x/2,gy=y/2,ix=Math.floor(gx),iy=Math.floor(gy),cx=Math.floor(ix/64),cy=Math.floor(iy/64),lx=ix-cx*64,ly=iy-cy*64,fx=gx-ix,fy=gy-iy,key=cx+','+cy;
    let c=refs.get(key);if(!c){c=new Float32Array(65*65*5);for(let j=0;j<=64;j++)for(let i=0;i<=64;i++)api.fillPoint(c,(j*65+i)*5,cx*128+i*2,cy*128+j*2);refs.set(key,c);}
    const k=(ly*65+lx)*5,k2=k+65*5,out=[];for(const q of [0,1,2]){const a=c[k+q]+(c[k+5+q]-c[k+q])*fx,b=c[k2+q]+(c[k2+5+q]-c[k2+q])*fx;out.push(a+(b-a)*fy);}const kn=(fy<.5?k:k2)+(fx<.5?0:5);out.push(c[kn+3],c[kn+4]);return out;}
  for(const [x,y]of points){api.sample(x,y);const actual=api.state();assert.deepEqual(actual,reference(x,y),'cold sample');add(actual);}
  // Interleave a yielding mesh build, samples, and synchronous completion of the same grid.
  api.clear();const gen=api.latticeGen(-1,0);gen.next();api.sample(-100.2,17.6);
  const full=api.getChunk(-1,0);while(!gen.next().done){};
  for(let j=0;j<=64;j++)for(let i=0;i<=64;i++){const p=new Float32Array(5);api.fillPoint(p,0,-128+i*2,j*2);assert.deepEqual(full.subarray((j*65+i)*5,(j*65+i+1)*5),p);}
  if(api.partial){const pending=api.latticeGen(60,60);pending.next();for(let i=0;i<80;i++)api.sample((80+i)*128+1,9000);assert.ok(api.partial.size<=64);while(!pending.next().done){}assert.ok(api.cache.has((60+1e6)*2e6+60+1e6),'evicted partial job still completes');}
  // Two passes exercise cache hits, collisions, and the dry-land r1 carry-over.
  const plantPoints=points.flatMap(([x,y])=>[[Math.floor(x/2.5),Math.floor(y/2.5)],[0,0],[1,1]]);
  for(let pass=0;pass<2;pass++)for(const [x,y]of plantPoints){add([api.plantAt(x,y),api.plant(),api.state()]);}
  for(const growth of [0,.3,1]) {api.ENV.growth=growth;api.ENV.dormant=1-growth;for(const [x,y]of points.slice(0,25))add([api.coverAt(x,y,3.5),api.coverAt(x,y,2.5,false)]);}
  const places=[[6000,6000],[0,0],[-105,9]];
  for(const kind of [1,2,3,4]){const p=api.findWater(kind,0,0,1800);if(p)places.push([p.wx,p.wy]);}
  let animals=0,cells=0;
  for(const level of [1,2,3]){api.CONFIG.wildlife=level;for(const [x,y]of places)for(let j=-2;j<=2;j++)for(let i=-2;i<=2;i++){const f=api.cellFish(Math.floor(x/16)+i,Math.floor(y/16)+j);add(f);animals+=f.length;cells++;}}
  const result={climate,digest:digest.digest('hex'),cells,animals};fixtures.push(result);console.log(result);
  if(api.indexed && climate==='temperate'){let oldBytes=0,newBytes=0;
    const meshes=[...Object.values(api.treeMeshes()),...api.FishDB.list.map(d=>d._mesh)];
    for(const mesh of meshes){const m=api.indexed(mesh);oldBytes+=mesh.byteLength;newBytes+=m.vertices.byteLength+(m.indices?.byteLength||0);const a=new Uint32Array(mesh.buffer,mesh.byteOffset,mesh.length),b=new Uint32Array(m.vertices.buffer,m.vertices.byteOffset,m.vertices.length);
      if(m.indices)for(let i=0;i<m.indices.length;i++)for(let q=0;q<10;q++)assert.equal(b[m.indices[i]*10+q],a[i*10+q]);else assert.deepEqual(a,b);
    }
    console.log({meshes:meshes.length,oldBytes,newBytes});
    // The 16-bit restart sentinel must never be emitted as a real vertex index.
    for(const unique of [65535,65536]) {
      const mesh=new Float32Array(unique*3*10);
      for(let i=0;i<unique*3;i++)mesh[i*10]=i%unique;
      const packed=api.indexed(mesh);
      assert.equal(packed.indices.BYTES_PER_ELEMENT,unique===65535?2:4);
      for(let i=0;i<unique*3;i++)assert.equal(packed.vertices[packed.indices[i]*10],mesh[i*10]);
    }
  }
}
const fixturePath=new URL('./performance-fixtures.json',import.meta.url);
if(revision)fs.writeFileSync(fixturePath,JSON.stringify(fixtures,null,2)+'\n');else assert.deepEqual(fixtures,JSON.parse(fs.readFileSync(fixturePath)),'baseline terrain, plants, cover and spawn records');
console.log('Performance regression checks passed.');
