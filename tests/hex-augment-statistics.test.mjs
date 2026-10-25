import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs/promises';import path from 'node:path';import os from 'node:os';import {generateKeyPairSync,sign,createHash} from 'node:crypto';
import {hexAugmentStatistics,validateHexAugmentStatistics,normalizeHexAugmentStatistics,isHexStatisticsSourceURL,HEX_AUGMENT_INDEX} from '../src/core/hex-augment-statistics.mjs';
import {hexAugmentRankingView} from '../src/hex-augment-ranking-view.mjs';
import {fetchHexAugmentStatistics} from '../services/server-data-hex-statistics-source.mjs';
import {verifyHexStatisticsEnvelope,HEX_STATISTICS_PATH} from '../services/hex-augment-statistics-feed.mjs';
import {publishHexStatistics} from '../services/server-data-hex-statistics-publish.mjs';
import {createHexStatisticsCache} from '../services/hex-augment-statistics-cache.mjs';
import {createServerDataFetch} from '../services/server-data-fetch.mjs';
import {generationBaseIdentity} from '../services/data-generation.mjs';
import {hexOrdinaryAugments} from '../src/core/hex-acquisition.mjs';
const data=JSON.parse(await fs.readFile(new URL('../data/game.json',import.meta.url))),snapshot=structuredClone(hexAugmentStatistics(data)),keysPair=generateKeyPairSync('ed25519'),keys={test:keysPair.publicKey.export({format:'pem',type:'spki'})},at=Date.parse('2026-10-25T12:00:00Z');
function envelope(reference=structuredClone(snapshot),sequence=1,extra={}){const p={schema:1,kind:'hex-augment-statistics',patch:reference.patch,publishedAt:new Date(at).toISOString(),sequence,reference,...extra},b=Buffer.from(JSON.stringify(p));return {keyId:'test',payload:b.toString('base64'),signature:sign(null,b,keysPair.privateKey).toString('base64')};}
async function fixture(t,{idle=false,...options}={}){const root=await fs.mkdtemp(path.join(os.tmpdir(),'rb-hex-stats-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));let game=structuredClone(data),allowed=idle,incoming=envelope(),changed=0;const cache=await createHexStatisticsCache({root,getData:()=>game,canActivate:()=>allowed,onChange:()=>changed++,download:async()=>{if(incoming instanceof Error)throw incoming;return incoming;},keys,clock:()=>at,...options});return {root,cache,get:()=>game,set:v=>game=v,idle:v=>allowed=v,serve:v=>incoming=v,changes:()=>changed};}

test('bundled global statistics are current, independently sourced, and never fill the unobserved nine augments with zeros',()=>{
 assert.equal(snapshot.rows.length,226);assert.equal(snapshot.patch,data.patch);assert.equal(snapshot.dataDate,'2026-10-25');assert.equal(snapshot.region,null);assert.equal(snapshot.scope,'all');
 assert.deepEqual(snapshot.rows.find(r=>r.id===3086),{id:3086,winRate:.5174,pickRate:.081,samples:8523447});
 const observed=new Set(snapshot.rows.map(r=>r.id));assert.equal(hexOrdinaryAugments(data).filter(a=>!observed.has(a.id)).length,9);
 assert.equal(generationBaseIdentity({...data,hexAugmentStats:snapshot}),generationBaseIdentity(data));
});
test('reject wrong mode, patch, dates, IDs, bounds, denominator substitutions and invented region labels',()=>{
 for(const change of [r=>r.mode='arena',r=>r.patch='16.20',r=>r.dataDate='2026-02-30',r=>r.fetchedAt=2026,r=>r.fetchedAt='2026-10-25T12:00:00',r=>r.rows.push({...r.rows[0]}),r=>r.rows[0].winRate=51.74,r=>r.rows[0].pickRate=1.1,r=>r.rows[0].samples=null,r=>r.rows[0].id=999999,r=>r.region='CN',r=>r.scope='high',r=>r.dataPath='https://example.com/private']){const ref=structuredClone(snapshot);change(ref);assert.throws(()=>validateHexAugmentStatistics(ref,data));assert.equal(hexAugmentStatistics({...data,hexAugmentStats:ref}),null);}
 assert.equal(hexAugmentStatistics({...data,patch:'16.22',version:'16.22.1'}),null);
 for(const value of ['https://aramkit.com/en-US/augments?token=x','https://aramkit.com/en-US/augments\n','https://aramkit.com/elsewhere'])assert.equal(isHexStatisticsSourceURL(value),false);assert(isHexStatisticsSourceURL(snapshot.sourceUrl));
});
test('freeze the advertised immutable resource, preserve source date and read rates from the all-stage table only',async()=>{
 const meta={version:data.patch,dataPath:snapshot.dataPath,dataDate:snapshot.dataDate},raw={all:snapshot.rows.slice(0,2).map(r=>({id:r.id,winRate:r.winRate,pickRate:r.pickRate,sampleCount:r.samples})),stages:{1:[{id:3086,winRate:1,sampleCount:1}]}};
 const bytes=Buffer.from(JSON.stringify(raw)),calls=[],fetcher=async(url,options)=>{calls.push(url);assert.equal(options.redirect,'error');assert.equal(options.credentials,'omit');return new Response(url===HEX_AUGMENT_INDEX?JSON.stringify({latest:data.patch,versions:[meta]}):bytes);};
 const ref=await fetchHexAugmentStatistics(data,{fetcher,clock:()=>new Date(at).toISOString()});assert.equal(ref.dataDate,'2026-10-25');assert.equal(ref.rows.length,2);assert.deepEqual(ref.rows,snapshot.rows.slice(0,2));assert.equal(ref.rawSha256,createHash('sha256').update(bytes).digest('hex'));assert.deepEqual(calls,[HEX_AUGMENT_INDEX,'https://data.aramkit.com/'+meta.dataPath+'/stats/all/augment-rankings.json']);
 let requests=0;await assert.rejects(fetchHexAugmentStatistics(data,{fetcher:async()=>{requests++;return new Response(JSON.stringify({latest:data.patch,versions:[{...meta,dataPath:'../secret'}]}));}}));assert.equal(requests,1);
 assert.throws(()=>normalizeHexAugmentStatistics(raw,{...meta,version:'16.20'},{data,fetchedAt:snapshot.fetchedAt,rawSha256:snapshot.rawSha256}));
});
test('the ranking has 24 compact initial icons, truthful hover samples, descending rates and no duplicated hero board',()=>{
 const html=hexAugmentRankingView(data),first=html.split('<details')[0];assert.equal((first.match(/class="hex-augment-rank-icon"/g)||[]).length,24);assert.match(html,/data-game-tooltip-kind="augment"/);assert.match(html,/选取率/);assert.match(html,/样本/);assert.match(html,/地区未披露/);assert.doesNotMatch(html,/国服|全球服|<table|出现概率\s*\d/);
 const visible=first.replace(/<[^>]+>/g,'');assert.doesNotMatch(visible,/拔剑|小蜜蜂|样本|选取率/);assert.match(visible,/\d+\.\d%/);
 const lowest=structuredClone(snapshot);lowest.rows[0].samples=100;assert(!hexAugmentRankingView({...data,hexAugmentStats:lowest}).includes('data-id="'+lowest.rows[0].id+'"'));
});
test('server fetch permits only the fixed index and exact immutable all-stage path',async()=>{
 const hits=[],network=createServerDataFetch({intervalMs:0,transport:async url=>{hits.push(url);return new Response('{}');}});
 for(const url of ['https://data.aramkit.com/data/versions.json?secret=x','https://data.aramkit.com/account','https://data.aramkit.com/'+snapshot.dataPath+'/stats/high/augment-rankings.json','https://data.aramkit.com/'+snapshot.dataPath+'/stats/all/augment-rankings.json#x'])await assert.rejects(network.fetcher(url),{code:'SOURCE_NOT_ALLOWED'});
 assert.equal(hits.length,0);await network.fetcher(HEX_AUGMENT_INDEX);await network.fetcher('https://data.aramkit.com/'+snapshot.dataPath+'/stats/all/augment-rankings.json');assert.equal(hits.length,2);
});
test('busy downloads remain pending through restart, accepted state restores offline, idle activation changes only the statistics field',async t=>{
 const f=await fixture(t),before=generationBaseIdentity(f.get());await f.cache.check();assert.equal(f.get().hexAugmentStats,undefined);assert.equal(f.cache.summary().phase,'pending');assert.equal(f.changes(),0);
 const restored=await createHexStatisticsCache({root:f.root,getData:f.get,canActivate:()=>false,keys,clock:()=>at,download:async()=>{throw Error('offline');}});assert.equal(f.get().hexAugmentStats,undefined);assert.equal(restored.activate(),false);
 f.idle(true);assert.equal(f.cache.activate(),true);assert.equal(f.changes(),1);assert.equal(generationBaseIdentity(f.get()),before);assert.equal(f.get().hexAugmentStats.rows.length,226);
 const next=structuredClone(data),offline=await createHexStatisticsCache({root:f.root,getData:()=>next,canActivate:()=>false,keys,clock:()=>at,download:async()=>{throw Error('offline');}});assert.equal(next.hexAugmentStats.rows.length,226);await offline.check();assert.equal(next.hexAugmentStats.rows.length,226);
});
test('invalid signature, future publication and authenticated bad content never overwrite accepted bytes',async t=>{
 const f=await fixture(t,{idle:true});await f.cache.check();const before=await fs.readFile(path.join(f.root,'hex-augment-stats.json'),'utf8'),active=f.get().hexAugmentStats;
 const bad=envelope();bad.signature='A'.repeat(86)+'==';const wrong=structuredClone(snapshot);wrong.mode='arena';const future=envelope(snapshot,2,{publishedAt:'2026-10-26T12:00:00Z'});
 for(const e of [bad,envelope(wrong,2),future]){f.serve(e);await f.cache.check({force:true});assert.equal(f.get().hexAugmentStats,active);assert.equal(await fs.readFile(path.join(f.root,'hex-augment-stats.json'),'utf8'),before);}
 assert.throws(()=>verifyHexStatisticsEnvelope(bad,{data,keys,clock:()=>at}));
});
test('signed watermark survives corrupt active bytes and blocks replay and same-sequence equivocation',async t=>{
 const f=await fixture(t,{idle:true});f.serve(envelope(snapshot,8));await f.cache.check();await fs.writeFile(path.join(f.root,'hex-augment-stats.json'),'broken');
 let incoming=envelope(snapshot,7),game=structuredClone(data);const cache=await createHexStatisticsCache({root:f.root,getData:()=>game,canActivate:()=>true,keys,clock:()=>at,download:async()=>incoming});await cache.check();assert.equal(game.hexAugmentStats,undefined);
 const changed=structuredClone(snapshot);changed.rows[0].winRate=.1;incoming=envelope(changed,8);await cache.check({force:true});assert.equal(game.hexAugmentStats,undefined);
 incoming=envelope(snapshot,8);await cache.check({force:true});assert.equal(game.hexAugmentStats.rows.length,226);
});
test('late pending persistence cannot attach old-patch statistics to a new base and promotion failure preserves accepted state',async t=>{
 let release,held=false;const {atomicJSON}=await import('../services/data.mjs');const f=await fixture(t,{idle:true,write:async(file,value)=>{if(held&&file.includes('hex-augment-stats.pending.json.'))await new Promise(r=>release=r);return atomicJSON(file,value);}});await f.cache.check();const active=f.get().hexAugmentStats;
 const next=structuredClone(snapshot);next.rows[0].winRate=.4;f.serve(envelope(next,2));held=true;const task=f.cache.check({force:true});for(let i=0;i<100&&!release;i++)await new Promise(r=>setTimeout(r,5));assert(release);f.set({...structuredClone(data),patch:'16.22',version:'16.22.1'});release();await task;assert.equal(f.get().hexAugmentStats,undefined);assert.equal(f.cache.activate(),false);assert(active);
 const broken=await fixture(t,{idle:true,promote:()=>{throw Error('locked');}});await broken.cache.check();assert.equal(broken.get().hexAugmentStats,undefined);assert.equal(broken.cache.summary().phase,'pending');
});

test('a committed staging file cannot promote a different in-memory pending generation during a concurrent idle poll',async t=>{
 let hold=false,release;const {atomicJSON}=await import('../services/data.mjs'),f=await fixture(t,{idle:true,write:async(file,value)=>{await atomicJSON(file,value);if(hold&&file.includes('hex-augment-stats.pending.json.'))await new Promise(r=>release=r);}});
 await f.cache.check();const accepted=f.get().hexAugmentStats;f.idle(false);const b=structuredClone(snapshot);b.rows[0].winRate=.2;f.serve(envelope(b,2));await f.cache.check({force:true});
 const c=structuredClone(snapshot);c.rows[0].winRate=.3;f.serve(envelope(c,3));hold=true;const checking=f.cache.check({force:true});for(let i=0;i<100&&!release;i++)await new Promise(r=>setTimeout(r,5));assert(release);f.idle(true);assert.equal(f.cache.activate(),false);assert.equal(f.get().hexAugmentStats,accepted);
 assert.equal(verifyHexStatisticsEnvelope(JSON.parse(await fs.readFile(path.join(f.root,'hex-augment-stats.pending.json'))),{data,keys,clock:()=>at}).sequence,2);
 release();await checking;assert.equal(f.get().hexAugmentStats.rows[0].winRate,.3);const persisted=verifyHexStatisticsEnvelope(JSON.parse(await fs.readFile(path.join(f.root,'hex-augment-stats.json'))),{data,keys,clock:()=>at});assert.equal(persisted.sequence,3);assert.equal(f.cache.summary().phase,'ready');assert.equal(await fs.stat(path.join(f.root,'hex-augment-stats.pending.json')).then(()=>true,()=>false),false);
});
test('publisher signs one bounded current file, keeps protocol generations untouched and retains it on source failure',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'rb-hex-publish-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));const publicRoot=path.join(root,'public'),keyFile=path.join(root,'private.pem');await fs.writeFile(keyFile,keysPair.privateKey.export({format:'pem',type:'pkcs8'}));await fs.mkdir(publicRoot);await fs.writeFile(path.join(publicRoot,'generation-sentinel'),'keep');
 const options={data,publicRoot,keyFile,keyId:'test',keys,clock:()=>new Date(at).toISOString(),fetchReference:async()=>snapshot};const result=await publishHexStatistics(options);assert.equal(result.rows,226);const filename=path.join(publicRoot,HEX_STATISTICS_PATH.slice(1)),prior=await fs.readFile(filename,'utf8');assert.equal(verifyHexStatisticsEnvelope(JSON.parse(prior),{data,keys,clock:()=>at}).reference.region,null);
 assert.equal((await publishHexStatistics(options)).changed,false);assert.equal(await fs.readFile(filename,'utf8'),prior);await assert.rejects(publishHexStatistics({...options,fetchReference:async()=>{throw Error('source outage');}}));assert.equal(await fs.readFile(filename,'utf8'),prior);assert.equal(await fs.readFile(path.join(publicRoot,'generation-sentinel'),'utf8'),'keep');
});
