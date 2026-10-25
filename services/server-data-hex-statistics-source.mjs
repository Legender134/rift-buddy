import {createHash} from 'node:crypto';
// Server collector only; desktop clients use the signed project feed.
import {HEX_AUGMENT_INDEX,normalizeHexAugmentStatistics} from '../src/core/hex-augment-statistics.mjs';

export async function fetchHexAugmentStatistics(data,{fetcher=fetch,clock=()=>new Date().toISOString()}={}){
 const read=async(url,limit)=>{const response=await fetcher(url,{redirect:'error',credentials:'omit',signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error('强化统计来源暂不可用');if(Number(response.headers.get('content-length'))>limit){await response.body?.cancel();throw Error('强化统计过大');}const reader=response.body?.getReader(),parts=[];let bytes=0;if(!reader)throw Error('强化统计为空');try{while(true){const p=await reader.read();if(p.done)break;bytes+=p.value.byteLength;if(bytes>limit)throw Error('强化统计过大');parts.push(p.value);}}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}return Buffer.concat(parts);};
 const index=JSON.parse(await read(HEX_AUGMENT_INDEX,128000));
 if(index?.latest!==data.patch||!Array.isArray(index.versions)||!index.versions.length||index.versions.length>100)throw Error('强化统计索引尚未提供当前补丁');
 const matches=index.versions.filter(r=>r.version===data.patch);if(matches.length!==1)throw Error('强化统计索引版本重复');const meta=matches[0];
 if(!/^data\/\d{1,3}\.\d{1,3}-\d{8}-[a-f0-9]{12}$/.test(meta.dataPath)||!/^\d{4}-\d{2}-\d{2}$/.test(meta.dataDate)||!meta.dataPath.startsWith('data/'+data.patch+'-'+meta.dataDate.replaceAll('-','')+'-'))throw Error('强化统计索引地址不符');
 const raw=await read('https://data.aramkit.com/'+meta.dataPath+'/stats/all/augment-rankings.json',1000000);
 return normalizeHexAugmentStatistics(JSON.parse(raw),meta,{data,fetchedAt:clock(),rawSha256:createHash('sha256').update(raw).digest('hex')});
}
