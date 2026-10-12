import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createPreparationStore,configurationKey,configurationPatch,CONFIGURATION_FIELDS} from '../src/core/preparation.mjs';

const source=fs.readFileSync(new URL('../src/app.mjs',import.meta.url),'utf8');
const functions=source.slice(source.indexOf('function acceptGuideSelection('),source.indexOf('function runeTargetNotice('));
const hero=extra=>({id:'Nautilus',role:'support',mode:'rift',coreIndex:0,conditions:[],...extra});
const page=hero({runeId:'source-guardian',coreId:'core-3190-3109-3222'});
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return {promise,resolve};};
async function tick(){await new Promise(r=>setImmediate(r));}
function setup(updateGuide){
 const preparations=createPreparationStore(),remembered=[],rendered=[];preparations.remember(page);
 const context=vm.createContext({preparations,configurationPatch,CONFIGURATION_FIELDS,buildChoiceKey:configurationKey,structuredClone,
  api:{updateGuide},saveChain:Promise.resolve(),restoringSave:false,guideSelection:hero(),guideSyncBase:hero(),guideRevision:3,guideSyncPending:0,guideSyncChain:Promise.resolve(),lastGuideSyncKey:'',
  buildView:null,windowLayout:{docked:true},rememberPreparation:value=>{remembered.push(structuredClone(value));return preparations.remember(value);},render:()=>rendered.push(preparations.recall(page)),renderBuild:()=>{},toast:()=>{}});
 vm.runInContext(functions,context);return {context,preparations,remembered,rendered};
}

test('accepted guide response precedes IPC without saving old defaults or leaving stale sidebar controls',async()=>{
 const response=deferred(),s=setup(()=>response.promise);s.context.syncPreparedGuide(page);await tick();
 response.resolve({updated:true,selection:page,revision:4});await s.context.guideSyncChain;
 assert.equal(s.preparations.recall(page).runeId,page.runeId);assert.equal(s.preparations.recall(page).coreId,page.coreId);
 assert.equal(s.remembered.length,1);assert.equal(s.rendered.at(-1).coreId,page.coreId);
 s.context.receiveGuideSelection(hero(),3);s.context.receiveGuideSelection(page,4);
 assert.equal(s.remembered.length,1,'old or duplicate notifications must not be applied again');
});

test('newer guide event wins when an older invoke response completes later',async()=>{
 const response=deferred(),s=setup(()=>response.promise),newer=hero({runeId:'source-newer',coreId:'core-3190-3109-3107'});
 s.context.syncPreparedGuide(page);await tick();s.context.receiveGuideSelection(newer,6);
 response.resolve({updated:true,selection:page,revision:4});await s.context.guideSyncChain;
 assert.equal(s.preparations.recall(page).runeId,newer.runeId);assert.equal(s.preparations.recall(page).coreId,newer.coreId);assert.equal(s.context.guideRevision,6);
});

test('queued local edits survive the first response and are sent by the next synchronization',async()=>{
 const first=deferred(),second=deferred(),sent=[],s=setup(value=>{sent.push(value);return sent.length===1?first.promise:second.promise;});
 s.context.syncPreparedGuide(page);await tick();
 const later={...page,coreId:'core-3190-3109-3107'};s.preparations.remember(later);s.context.syncPreparedGuide(later);
 first.resolve({updated:true,selection:page,revision:4});await tick();
 assert.equal(s.preparations.recall(page).coreId,later.coreId);assert.equal(sent.length,2);assert.equal(sent[1].coreId,later.coreId);
 second.resolve({updated:true,selection:later,revision:5});await s.context.guideSyncChain;
 assert.equal(s.preparations.recall(page).coreId,later.coreId);assert.equal(s.context.guideSyncPending,0);
});

test('failed or obsolete update does not save an unconfirmed old guide over local preparation',async()=>{
 for(const updateGuide of [async()=>({updated:false}),async()=>{throw Error('save failed');}]){
  const s=setup(updateGuide);s.context.syncPreparedGuide(page);await s.context.guideSyncChain;
  assert.equal(s.preparations.recall(page).coreId,page.coreId);assert.equal(s.preparations.recall(page).runeId,page.runeId);assert.equal(s.remembered.length,0);
 }
});
