import fs from 'node:fs/promises';
import path from 'node:path';
import {createPrivateKey,createPublicKey,sign} from 'node:crypto';
import {atomicJSON} from './data.mjs';
import {DATA_FEED_KEYS} from './data-feed.mjs';
import {createServerDataFetch} from './server-data-fetch.mjs';
import {fetchHexAugmentStatistics} from './server-data-hex-statistics-source.mjs';
import {validateHexAugmentStatistics} from '../src/core/hex-augment-statistics.mjs';
import {verifyHexStatisticsEnvelope,HEX_STATISTICS_PATH,HEX_STATISTICS_LIMIT} from './hex-augment-statistics-feed.mjs';

// Called only under the collector's existing flock. This is an independent
// statistical publication, never a mutation of the four-file base generation.
export async function publishHexStatistics({data,publicRoot,keyFile,keyId='data-20261014',keys=DATA_FEED_KEYS,clock=()=>new Date().toISOString(),fetchReference=fetchHexAugmentStatistics,network=createServerDataFetch({maxRequests:2,maxBytes:1200000,durationMs:60000})}){
 if(path.resolve(keyFile).startsWith(path.resolve(publicRoot)+path.sep))throw Error('强化统计密钥不能位于公开目录');
 const reference=await fetchReference(data,{fetcher:network.fetcher,clock});validateHexAugmentStatistics(reference,data);
 const key=createPrivateKey(await fs.readFile(keyFile));if(key.asymmetricKeyType!=='ed25519'||!Object.hasOwn(keys,keyId)||!createPublicKey(key).export({format:'der',type:'spki'}).equals(createPublicKey(keys[keyId]).export({format:'der',type:'spki'})))throw Error('强化统计签名密钥不匹配');
 const destination=path.join(publicRoot,HEX_STATISTICS_PATH.slice(1));let prior=null;
 try{const stat=await fs.stat(destination);if(stat.size>HEX_STATISTICS_LIMIT)throw Error('强化统计公开文件过大');prior=verifyHexStatisticsEnvelope(JSON.parse(await fs.readFile(destination)),{keys,clock:()=>Date.parse(clock())});}catch(e){if(e.code!=='ENOENT')throw e;}
 const compare=(a,b)=>{const x=a.split('.').map(Number),y=b.split('.').map(Number);return Math.sign(x[0]-y[0]||x[1]-y[1]);};
 if(prior&&(compare(reference.patch,prior.patch)<0||reference.patch===prior.patch&&reference.dataDate<prior.reference.dataDate))throw Error('强化统计来源倒退');
 if(prior?.patch===reference.patch&&prior.reference.rawSha256===reference.rawSha256&&prior.reference.dataPath===reference.dataPath)return {changed:false,patch:prior.patch,sequence:prior.sequence,dataDate:prior.reference.dataDate,network:network.stats()};
 const publishedAt=clock(),payload={schema:1,kind:'hex-augment-statistics',patch:reference.patch,publishedAt,sequence:Math.max(Date.parse(publishedAt),(prior?.sequence||0)+1),reference},bytes=Buffer.from(JSON.stringify(payload)),envelope={keyId,payload:bytes.toString('base64'),signature:sign(null,bytes,key).toString('base64')};
 verifyHexStatisticsEnvelope(envelope,{data,keys,clock:()=>Date.parse(clock())});if(Buffer.byteLength(JSON.stringify(envelope))>HEX_STATISTICS_LIMIT)throw Error('强化统计超过公开上限');
 const folder=path.dirname(destination);await fs.mkdir(folder,{recursive:true});for(const dir of [path.dirname(folder),folder])await fs.chmod(dir,0o755);await atomicJSON(destination,envelope,{mode:0o644});return {changed:true,patch:payload.patch,sequence:payload.sequence,dataDate:reference.dataDate,rows:reference.rows.length,network:network.stats()};
}
