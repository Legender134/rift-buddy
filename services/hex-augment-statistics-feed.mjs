import {createPublicKey,verify} from 'node:crypto';
import {DATA_FEED_KEYS,DATA_FEED_ORIGIN} from './data-feed.mjs';
import {readPublicJSON} from './build-json.mjs';
import {validateHexAugmentStatistics} from '../src/core/hex-augment-statistics.mjs';

export const HEX_STATISTICS_PATH='/hex-stats/v1/latest.json',HEX_STATISTICS_LIMIT=256000;
export function verifyHexStatisticsEnvelope(envelope,{data,keys=DATA_FEED_KEYS,clock=Date.now}={}){
 if(!envelope||Object.keys(envelope).sort().join(',')!=='keyId,payload,signature'||!Object.hasOwn(keys,envelope.keyId)||typeof envelope.payload!=='string'||envelope.payload.length>220000||typeof envelope.signature!=='string'||!/^[A-Za-z0-9+/]{86}==$/.test(envelope.signature))throw Error('强化统计签名格式无效');
 const bytes=Buffer.from(envelope.payload,'base64');if(bytes.toString('base64')!==envelope.payload||!verify(null,bytes,createPublicKey(keys[envelope.keyId]),Buffer.from(envelope.signature,'base64')))throw Error('强化统计签名校验失败');
 const p=JSON.parse(bytes);if(!p||Object.keys(p).sort().join(',')!=='kind,patch,publishedAt,reference,schema,sequence'||p.schema!==1||p.kind!=='hex-augment-statistics'||p.patch!==p.reference?.patch||!Number.isSafeInteger(p.sequence)||p.sequence<1||typeof p.publishedAt!=='string'||!/(?:Z|[+-]\d{2}:\d{2})$/.test(p.publishedAt)||!Number.isFinite(Date.parse(p.publishedAt))||Date.parse(p.publishedAt)>clock()+300000||Date.parse(p.reference?.fetchedAt)>clock()+300000)throw Error('强化统计清单无效');
 validateHexAugmentStatistics(p.reference,data);return p;
}
export async function downloadHexStatistics({fetcher=fetch}={}){
 return readPublicJSON(DATA_FEED_ORIGIN+HEX_STATISTICS_PATH,{fetcher,timeout:12000,limit:HEX_STATISTICS_LIMIT});
}
