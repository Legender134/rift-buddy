import bundled from './hex-augment-statistics.json' with {type:'json'};
import {isCurrentHexData} from './hex-data-current.mjs';
import {hexOrdinaryAugments} from './hex-acquisition.mjs';

export const HEX_AUGMENT_INDEX='https://data.aramkit.com/data/versions.json';
export const HEX_AUGMENT_SOURCE='https://aramkit.com/en-US/augments';
export const isHexStatisticsSourceURL=value=>value===HEX_AUGMENT_SOURCE||value==='https://aramgg.com/data/champions-stats.json';
const exact=(value,keys)=>!!value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===[...keys].sort().join(',');
const date=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
const rate=value=>Number.isFinite(value)&&value>=0&&value<=1;
export function validateHexAugmentStatistics(ref,data){
 const fields=['schema','mode','patch','source','sourceUrl','scope','region','dataDate','fetchedAt','dataPath','rawSha256','rows'];
 if(!exact(ref,fields)||ref.schema!==1||ref.mode!=='aram-mayhem'||!/^\d{1,3}\.\d{1,3}$/.test(ref.patch)||ref.source!=='ARAMKit'||ref.sourceUrl!==HEX_AUGMENT_SOURCE||ref.scope!=='all'||ref.region!==null||!date(ref.dataDate)||(typeof ref.fetchedAt!=='string'||!/(?:Z|[+-]\d{2}:\d{2})$/.test(ref.fetchedAt)||!Number.isFinite(Date.parse(ref.fetchedAt)))||Date.parse(ref.dataDate)>Date.parse(ref.fetchedAt)||!/^data\/\d{1,3}\.\d{1,3}-\d{8}-[a-f0-9]{12}$/.test(ref.dataPath)||!ref.dataPath.startsWith('data/'+ref.patch+'-'+ref.dataDate.replaceAll('-','')+'-')||!/^[a-f0-9]{64}$/.test(ref.rawSha256)||!Array.isArray(ref.rows)||!ref.rows.length||ref.rows.length>400)throw Error('强化统计版本或口径不符');
 if(data&&(!isCurrentHexData(data)||ref.patch!==data.patch))throw Error('强化统计补丁不匹配');
 const allowed=data?new Set(hexOrdinaryAugments(data).map(a=>a.id)):null,seen=new Set();
 for(const row of ref.rows){if(!exact(row,['id','winRate','pickRate','samples'])||!Number.isSafeInteger(row.id)||row.id<=0||seen.has(row.id)||allowed&&!allowed.has(row.id)||!rate(row.winRate)||!rate(row.pickRate)||!Number.isSafeInteger(row.samples)||row.samples<1||row.samples>1e9)throw Error('强化统计条目不符');seen.add(row.id);}
 return ref;
}
export function normalizeHexAugmentStatistics(raw,meta,{data,fetchedAt,rawSha256}){
 if(!meta||meta.version!==data.patch||!Array.isArray(raw?.all))throw Error('强化统计来源版本不匹配');
 return validateHexAugmentStatistics({schema:1,mode:'aram-mayhem',patch:meta.version,source:'ARAMKit',sourceUrl:HEX_AUGMENT_SOURCE,scope:'all',region:null,dataDate:meta.dataDate,fetchedAt,dataPath:meta.dataPath,rawSha256,rows:raw.all.map(r=>({id:r.id,winRate:r.winRate,pickRate:r.pickRate,samples:r.sampleCount}))},data);
}
export function hexAugmentStatistics(data){
 const ref=data.hexAugmentStats??bundled;try{return validateHexAugmentStatistics(ref,data);}catch{return null;}
}
export function bundledHexAugmentStatistics(data){try{return validateHexAugmentStatistics(bundled,data);}catch{return null;}}
