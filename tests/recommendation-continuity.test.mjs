import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {createSlots,mergeClientSession,recommend,clearClientPicks} from '../src/core/recommend.mjs';
import {recommendationDraft,comparisonDraft} from '../src/core/draft-intents.mjs';
import {reconcileClientDraft,restorePlayerPosition,unassignedPublicPicks,publicClientGameId,CLIENT_POSITION_ROLES,manualPlayerSlot} from '../src/core/draft.mjs';
import {currentPlayerSelection} from '../src/core/guide.mjs';
import {recommendationKey,createPreparationStore,createRuneApplicationState,partyRoutePreparations} from '../src/core/preparation.mjs';
import {localPickEligibility,pickEligibilityContext} from '../src/core/pick-eligibility.mjs';
import {companionHeroAction} from '../src/core/companion-action.mjs';
import {captureCreativePlan,creativeMemberCombo,creativeComboContext} from '../src/core/creative-plan.mjs';
import {matchupTargetKey} from '../src/core/matchup-plans.mjs';
import {getBuild} from '../src/core/builds.mjs';
import {runeWriteContext} from '../src/core/rune-context.mjs';
import {clientPreparationPlan,preparationGameId,clientPreparationKey} from '../src/client-preparation-view.mjs';
import {runeApplicationKey} from '../src/preparation-view.mjs';
import {renderResultCard} from '../src/draft-result-view.mjs';
import {resultPlayCard} from '../src/play-card-view.mjs';

const source=await fs.readFile(new URL('../src/app.mjs',import.meta.url),'utf8');
const data=JSON.parse(await fs.readFile(new URL('../data/game.json',import.meta.url),'utf8'));
data.builds={};data.catalog={version:'mock'};
const hero=id=>data.champions.find(c=>c.id===id);
const noop=()=>{};
function extract(start,end){
 const from=source.indexOf(start),to=source.indexOf(end,from);
 assert(from>=0&&to>from,`Missing application function boundaries: ${start}`);
 return source.slice(from,to);
}
const syncFunctions=extract('function cancelRecommendation(){','let client=')+
 extract('function queueCompanionRecommendation(){','function acceptWindowLayout(')+
 extract('function recommendationInput(){','function useCatalogResult(')+
 extract('async function performSync(','function reflectRunePending(');
const clickFunctions=extract('function resultCreativePlan(result){','function reconcileCreativePlan(')+
 extract('function taskOwnRole(){','function renderTaskMembers(')+
 extract('function memberHeroAction(','function readOnlyPreparation(')+
 extract('function readOnlyPreparation(','function clientControls(')+
 extract('function selectedClientPreparation(','function setCompanionRole(');
const buildBranch=extract("else if(action==='build'){","else if(action==='build-partner'");

function client(){
 return {connected:true,phase:'ChampSelect',mode:{id:'rift'},game:{gameId:'123'},session:{gameId:123,localPlayerCellId:1,myTeam:[{cellId:1,championId:0,championPickIntent:0,assignedPosition:'BOTTOM'}],theirTeam:[],bans:[],actions:[]}};
}
const partySlots=()=>createSlots().map(s=>({...s,party:['mid','bottom'].includes(s.role),...(s.role==='bottom'?{champion:'Ashe',locked:true,automaticPosition:true}:{})}));
function setup({slots=partySlots(),current=client(),incoming=client(),results=[{id:'existing candidate'}],now=Date.now()}={}){
 const timers=new Map(),calls={cancel:0,generated:[],prepared:[],readOnly:[],clients:[],stale:0};let nextTimer=0;
 const clock={now};class ClockDate extends Date{static now(){return clock.now;}}
 const context=vm.createContext({
  Date:ClockDate,data,slots,client:current,saved:{draft:{clientGameId:'123'},preferences:{autoParty:true,clickPrepare:true,pool:[],poolMode:'prefer',play:{},rolePools:{}},excluded:[]},
  route:'draft',scope:'party',soloRole:'bottom',style:'wild',offset:0,activeCreativePlan:null,unassigned:[],enemy:[],clientBans:[],
  generating:false,syncing:false,windowLayout:{docked:false},autoRecommendTimer:null,autoRecommendationKey:'',results,resultsSignature:'',
  recommendationRun:0,activeRecommendation:null,cancelRecommendationReveal:noop,
  lastRenderedClient:'',lastMatchupSession:'',lastMatchupSync:'',lastMatchupGame:'123',matchupTargets:new Map(),lastClientRead:'',
  lastAutoPartyContext:'',pendingIntentPreparation:null,pendingIntentPlanId:'',lastMatchupOwn:'',saveChain:Promise.resolve(),sharedClient:null,
  buildView:null,activeAppSelect:null,dragPick:null,document:{activeElement:{matches:()=>false}},
  preparations:createPreparationStore(),clientPreparing:false,runeApplying:false,itemSetPending:'',candidatePreparing:false,
  lastTaskSelection:null,companionPreview:null,companionTab:'recommend',draftComparing:false,creativePlanNotice:'',
  preparationRevision:0,preparationPendingKey:'',clientPreparationStatuses:new Map(),guideSyncChain:Promise.resolve(),runeAppliedKeys:createRuneApplicationState(),
  structuredClone,mergeClientSession,reconcileClientDraft,restorePlayerPosition,unassignedPublicPicks,publicClientGameId,CLIENT_POSITION_ROLES,
  currentPlayerSelection,recommendationDraft,comparisonDraft,recommendationKey,localPickEligibility,manualPlayerSlot,clearClientPicks,matchupTargetKey,
  companionHeroAction,captureCreativePlan,creativeMemberCombo,creativeComboContext,partyRoutePreparations,getBuild,
  runeWriteContext,clientPreparationPlan,preparationGameId,clientPreparationKey,runeApplicationKey,
  clientSyncOptions:()=>({autoArrange:true,autoParty:false}),clientRenderIdentity:()=>'',matchupContext:()=>'',publicMatchupIds:()=>[],currentRoleEvidence:()=>[],
  scheduleRoomPublish:noop,drainExternalState:noop,persist:async()=>{},reconcileCreativePlan:noop,render:noop,myPreparation:()=>null,
  companionPreparation:()=>null,currentPickIntent:()=>null,rememberedPreparation:()=>null,preservePlayerPosition:noop,closeOverlay:noop,
  syncPreparedGuide:noop,toast:noop,refreshClientClock:noop,
  markResultStale:()=>{calls.stale++;},
  setTimeout:callback=>{const id=++nextTimer;timers.set(id,callback);return id;},clearTimeout:id=>timers.delete(id),
  showBuild:(id,role,mode,selection)=>calls.readOnly.push({id,role,mode,selection}),
  champ:hero,
  api:{client:async fresh=>{calls.clients.push(fresh);return structuredClone(incoming);},prepareSelection:async value=>{
   calls.prepared.push(value);incoming.session.myTeam[0].championPickIntent=hero(value.champion).key;
   return {complete:true,steps:{hover:{status:'done'},runes:{status:'done',pageId:11},spells:{status:'done'},items:{status:'done'}}};
  }},
 });
 context.assignedPlayerRole=()=>CLIENT_POSITION_ROLES[context.client.session.myTeam.find(p=>p.cellId===context.client.session.localPlayerCellId)?.assignedPosition];
 context.rememberPreparation=value=>context.preparations.remember(value);
 context.generate=()=>{calls.generated.push(context.autoRecommendationKey);context.generating=true;};
 vm.runInContext(syncFunctions+clickFunctions+`async function clickBuild(el){const action=el.dataset.action;if(false){} ${buildBranch}}`,context);
 context.sync=(manual=false,{fresh=false}={})=>context.performSync(manual,fresh);
 context.resultsSignature=context.autoRecommendationKey=context.recommendationKey(context.recommendationInput());
 const worker={cancel:()=>{calls.cancel++;}};
 const startCalculation=()=>{context.generating=true;context.activeRecommendation=worker;};
 const runTimer=()=>{assert.equal(timers.size,1);const callback=timers.values().next().value;timers.clear();callback();};
 return {context,calls,timers,worker,startCalculation,runTimer,clock};
}

test('client identity bindings preserve candidates and an in-flight recommendation when its input is unchanged',async()=>{
 const incoming=client();incoming.session.myTeam[0].championId=hero('Ashe').key;
 const s=setup({incoming}),before=s.context.results,signature=s.context.resultsSignature;s.startCalculation();
 await s.context.performSync(false,true);
 assert.equal(s.context.slots.find(slot=>slot.role==='bottom').clientCellId,1);
 assert.equal(s.context.recommendationKey(s.context.recommendationInput()),signature);
 assert.equal(s.context.results,before);assert.equal(s.calls.stale,0);assert.equal(s.calls.cancel,0);
 assert.equal(s.context.activeRecommendation,s.worker);assert.equal(s.context.generating,true);assert.equal(s.context.recommendationRun,0);
});

test('real bans and selected-target changes invalidate old candidates and retry, including the same canceled input on the main draft page',async()=>{
 for(const change of [next=>{next.session.bans=[hero('Ashe').key];},next=>{next.session.myTeam[0].championId=hero('Jinx').key;}]){
  const incoming=client();change(incoming);const s=setup({incoming}),before=s.context.resultsSignature;s.startCalculation();
  await s.context.performSync(false,true);
  const signature=s.context.recommendationKey(s.context.recommendationInput());
  assert.notEqual(signature,before);assert.equal(s.context.results.length,0);assert.equal(s.calls.cancel,1);assert.equal(s.calls.stale,1);
  assert.equal(s.context.activeRecommendation,null);assert.equal(s.context.autoRecommendationKey,'');
  s.runTimer();assert.deepEqual(s.calls.generated,[signature]);
  s.context.cancelRecommendation();s.context.queueCompanionRecommendation();
  s.runTimer();assert.deepEqual(s.calls.generated,[signature,signature]);
 }
});

function avatar(html,id){
 const tag=html.match(new RegExp(`<button\\b[^>]*data-action="build"[^>]*data-id="${id}"[^>]*>`))?.[0];
 assert.ok(tag,`Missing ${id} avatar`);
 const attributes=Object.fromEntries([...tag.matchAll(/([a-z][\w-]*)="([^"]*)"/g)].map(match=>[match[1],match[2]]));
 return {dataset:Object.fromEntries(Object.entries(attributes).filter(([name])=>name.startsWith('data-')).map(([name,value])=>[name.slice(5).replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase()),value])),hasAttribute:name=>Object.hasOwn(attributes,name)};
}
test('list and detailed avatars route an explicit own click through preparation while teammate clicks remain read only',async()=>{
 const slots=partySlots().map(s=>s.role==='mid'?{...s,champion:'Ahri',locked:true}:s);
 const [result]=recommend({slots,champions:data.champions,scope:'party',limit:1});
 for(const html of [renderResultCard(result,0,data,{favorites:[],preferences:{}},'wild'),resultPlayCard(result,0,data)]){
  const own=avatar(html,'Ashe');assert.equal(own.dataset.prepareClick,'true');
  const s=setup({slots:structuredClone(slots),results:[structuredClone(result)]});
  await s.context.clickBuild(own);
  assert.equal(s.calls.prepared.length,1);assert.equal(s.calls.prepared[0].champion,'Ashe');assert.equal(s.calls.prepared[0].role,'bottom');
  assert.equal(s.calls.prepared[0].sessionGameId,'123');assert.equal(s.calls.readOnly.length,0);
  const teammate=avatar(html,'Ahri');assert.equal(teammate.dataset.prepareClick,'true');
  const other=setup({slots:structuredClone(slots),results:[structuredClone(result)]});
  await other.context.clickBuild(teammate);
  assert.equal(other.calls.prepared.length,0);assert.equal(other.calls.readOnly.length,1);assert.equal(other.calls.readOnly[0].selection.readOnly,true);
 }
});

function checkedClient(now,change=noop){
 const value=client();change(value);
 value.eligibility={context:pickEligibilityContext(value.session),localPlayerCellId:value.session.localPlayerCellId,receivedAt:new Date(now).toISOString(),pickable:[hero('Ashe').key,hero('Ahri').key],disabled:[]};
 return value;
}
function candidateSetup({current,incoming,now}){
 const slots=partySlots().map(s=>s.role==='mid'?{...s,champion:'Ahri',locked:true}:s);
 const [result]=recommend({slots,champions:data.champions,scope:'party',limit:1});
 const s=setup({slots,current,incoming,results:[result],now});
 return {...s,html:renderResultCard(result,0,data,{favorites:[],preferences:{}},'wild')};
}
test('eligibility age alone preserves candidate signatures and own or teammate avatar clicks',async()=>{
 const now=2000000;
 for(const id of ['Ashe','Ahri']){
  const current=checkedClient(now),incoming=checkedClient(now+16001),s=candidateSetup({current,incoming,now});
  const signature=s.context.resultsSignature;s.clock.now+=16001;
  assert.equal(localPickEligibility(current,s.context.slots,data.champions,{scope:'party',now:s.clock.now}).status,'unknown','Display freshness must still expire');
  assert.equal(s.context.recommendationKey(s.context.recommendationInput()),signature,'Recommendation context must not expire solely with time');
  await s.context.clickBuild(avatar(s.html,id));
  assert.equal(s.calls.prepared.length,id==='Ashe'?1:0);assert.equal(s.calls.readOnly.length,id==='Ahri'?1:0);
  if(id==='Ashe')assert.equal(s.calls.clients[0],true,'The click must force a fresh client read before preparing');
 }
});
test('a stale candidate refresh rejects newly disabled targets, different games, players, roles and modes before preparation',async()=>{
 const now=2000000;
 for(const kind of ['disabled','banned','game','player','role','mode','teammate']){
  const current=checkedClient(now),incoming=checkedClient(now+16001);
  if(kind==='disabled')incoming.eligibility.disabled=[hero('Ashe').key];
  if(kind==='banned')incoming.session.bans=[hero('Ashe').key];
  if(kind==='game'){incoming.session.gameId=124;incoming.game.gameId='124';}
  if(kind==='player'){incoming.session.localPlayerCellId=2;incoming.session.myTeam[0].cellId=2;}
  if(kind==='role')incoming.session.myTeam[0].assignedPosition='MIDDLE';
  if(kind==='mode')incoming.mode={id:'hex'};
  if(kind==='teammate')incoming.session.myTeam.push({cellId:2,championId:hero('Veigar').key,assignedPosition:'MIDDLE'});
  incoming.eligibility.context=pickEligibilityContext(incoming.session);incoming.eligibility.localPlayerCellId=incoming.session.localPlayerCellId;
  const s=candidateSetup({current,incoming,now});s.clock.now+=16001;
  await assert.rejects(s.context.clickBuild(avatar(s.html,'Ashe')),/变化|无法确认/,kind);
  assert.equal(s.calls.prepared.length,0,kind);assert.equal(s.context.activeCreativePlan,null,kind);
 }
});
test('the first click can learn previously unknown eligibility only when this candidate remains legal in the same draft',async()=>{
 const now=2000000;
 for(const legal of [true,false]){
  const current=client(),incoming=checkedClient(now);if(!legal)incoming.eligibility.disabled=[hero('Ashe').key];
  const s=candidateSetup({current,incoming,now});
  if(legal){await s.context.clickBuild(avatar(s.html,'Ashe'));assert.equal(s.calls.prepared.length,1);assert.equal(s.calls.prepared[0].champion,'Ashe');assert.equal(s.calls.clients[0],true);}
  else{await assert.rejects(s.context.clickBuild(avatar(s.html,'Ashe')),/变化/);assert.equal(s.calls.prepared.length,0);}
 }
});
test('comparison recommendation input releases assistant choices while retaining canonical picks and friend public hovers',()=>{
 const current=client();current.session.myTeam[0].championPickIntent=hero('Ashe').key;
 current.session.myTeam.push({cellId:2,championId:0,championPickIntent:hero('Ahri').key,assignedPosition:'MIDDLE'});
 const slots=partySlots().map(s=>s.role==='mid'?{...s,champion:'Orianna',locked:true,automaticPosition:true}:s);
 const s=setup({slots,current,incoming:structuredClone(current)}),before=structuredClone(slots);
 s.context.activeCreativePlan={id:'active',members:[{role:'bottom',champion:'Ashe'},{role:'mid',champion:'Orianna'}]};
 s.context.draftComparing=true;
 const input=s.context.recommendationInput();
 assert.equal(input.slots.find(slot=>slot.role==='bottom').champion,null);
 const friend=input.slots.find(slot=>slot.role==='mid');assert.equal(friend.champion,'Ahri');assert.equal(friend.publicIntent,true);assert.equal(friend.locked,false);
 assert.equal(input.creativePlan,null);assert.deepEqual(s.context.slots,before);
 s.context.draftComparing=false;assert.equal(s.context.recommendationInput().slots.find(slot=>slot.role==='bottom').champion,'Ashe');assert.deepEqual(s.context.slots,before);
});

test('solo comparison can replace an unconfirmed assistant choice but preserves actual selected heroes and manual locks',()=>{
 for(const kind of ['proposal','selected','manual']){
  const current=client();current.session.myTeam[0].championPickIntent=hero('Ashe').key;
  if(kind==='selected')current.session.myTeam[0].championId=hero('Ashe').key;
  const slots=partySlots().map(s=>s.role==='bottom'&&kind==='manual'?{...s,automaticPosition:false,manualPosition:true,clientCellId:1}:s);
  const before=structuredClone(slots),s=setup({slots,current,incoming:structuredClone(current)});
  s.context.scope='solo';s.context.activeCreativePlan={id:'active',members:[{role:'bottom',champion:'Ashe'}]};s.context.draftComparing=true;
  s.context.saved.preferences.pool=['Jinx'];s.context.saved.preferences.poolMode='only';
  const input=s.context.recommendationInput(),results=recommend(input);
  assert.equal(input.soloChampion,kind==='proposal'?null:'Ashe',kind);
  assert.ok(results.length,kind);assert.ok(results.every(result=>result.slots.find(slot=>slot.role==='bottom').champion===(kind==='proposal'?'Jinx':'Ashe')),kind);
  assert.deepEqual(s.context.slots,before,kind);
 }
});
