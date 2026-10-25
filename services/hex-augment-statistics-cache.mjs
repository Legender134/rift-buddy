import fs from 'node:fs/promises';
import {renameSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import path from 'node:path';
import {atomicJSON} from './data.mjs';
import {DATA_FEED_KEYS} from './data-feed.mjs';
import {verifyHexStatisticsEnvelope,downloadHexStatistics,HEX_STATISTICS_LIMIT} from './hex-augment-statistics-feed.mjs';
import {bundledHexAugmentStatistics,validateHexAugmentStatistics} from '../src/core/hex-augment-statistics.mjs';

export async function createHexStatisticsCache({root,getData,canActivate=()=>false,onChange=()=>{},download=downloadHexStatistics,keys=DATA_FEED_KEYS,clock=Date.now,write=atomicJSON,promote=renameSync}){
 const activeFile=path.join(root,'hex-augment-stats.json'),pendingFile=path.join(root,'hex-augment-stats.pending.json'),watermarkFile=path.join(root,'hex-augment-stats.watermark.json');
 let active=null,pending=null,watermark=null,appliedData=null,flight=null,staging=false,lastAttempt=-Infinity,lastPatch=null;
 const decode=envelope=>({envelope,value:verifyHexStatisticsEnvelope(envelope,{keys,clock})});
 const read=async file=>{try{const stat=await fs.stat(file);if(stat.size>HEX_STATISTICS_LIMIT)throw Error('强化统计缓存过大');return decode(JSON.parse(await fs.readFile(file,'utf8')));}catch{return null;}};
 const same=(a,b)=>a.keyId===b.keyId&&a.payload===b.payload&&a.signature===b.signature;
 const follows=(next,prior)=>{if(!prior)return true;const a=next.value,b=prior.value,x=a.patch.split('.').map(Number),y=b.patch.split('.').map(Number),patch=x[0]-y[0]||x[1]-y[1];return patch>=0&&(patch>0||a.reference.dataDate>=b.reference.dataDate)&&Date.parse(a.publishedAt)>=Date.parse(b.publishedAt)&&(a.sequence>b.sequence||a.sequence===b.sequence&&same(next.envelope,prior.envelope));};
 const current=candidate=>{const data=getData(),ref=validateHexAugmentStatistics(candidate.value.reference,data),base=bundledHexAugmentStatistics(data);if(base&&ref.dataDate<base.dataDate)throw Error('强化统计比内置资料旧');return ref;};
 active=await read(activeFile);pending=await read(pendingFile);const remembered=await read(watermarkFile);
 for(const c of [remembered,active,pending].filter(Boolean))if(!watermark||c.value.sequence>watermark.value.sequence)watermark=c;
 if(active&&(active.value.sequence===watermark.value.sequence&&!same(active.envelope,watermark.envelope)||!follows(watermark,active)))active=null;if(pending&&!follows(pending,watermark))pending=null;
 function reconcile({restore=false,notify=true}={}){
  if(!restore&&!canActivate())return false;
  const data=getData();let ref=null;try{if(active)ref=current(active);}catch{}
  if(ref){if(appliedData===data&&data.hexAugmentStats===active.value.reference)return false;data.hexAugmentStats=active.value.reference;appliedData=data;if(notify)onChange();return true;}
  if(appliedData){delete data.hexAugmentStats;appliedData=null;if(notify)onChange();}return false;
 }
 function activate(){
  if(staging||!canActivate())return false;reconcile();if(!pending)return false;
  try{current(pending);}catch{return false;}
  if(!canActivate())return false;
  try{promote(pendingFile,activeFile);}catch{return false;}active=pending;pending=null;appliedData=null;return reconcile();
 }
 reconcile({restore:true,notify:false});
 const check=({force=false}={})=>{
  if(flight)return flight;if(!force&&lastPatch===getData().patch&&clock()-lastAttempt<12*3600000)return Promise.resolve(summary());lastPatch=getData().patch;lastAttempt=clock();
  flight=(async()=>{const original=getData();try{
   const candidate=decode(await download());current(candidate);if(!follows(candidate,watermark))throw Error('强化统计序号倒退或同序号内容变化');
   if(active&&same(active.envelope,candidate.envelope)&&!pending){reconcile();return summary();}
   const stage=pendingFile+'.'+process.pid+'-'+randomUUID()+'.stage';staging=true;
   try{
    await write(watermarkFile,candidate.envelope);watermark=candidate;
    if(getData()!==original)throw Error('强化统计基础上下文已变化');
    await write(stage,candidate.envelope);
    if(getData()!==original)throw Error('强化统计基础上下文已变化');
    renameSync(stage,pendingFile);pending=candidate;
   }finally{staging=false;await fs.unlink(stage).catch(()=>{});}
   if(getData()===original)activate();
  }catch{if(getData()!==original)lastAttempt=-Infinity;}return summary();})().finally(()=>flight=null);return flight;
 };
 const summary=()=>({phase:pending?'pending':active&&appliedData===getData()?'ready':'bundled',dataDate:active&&appliedData===getData()?active.value.reference.dataDate:bundledHexAugmentStatistics(getData())?.dataDate||null});
 return {check,activate,reconcile,summary};
}
