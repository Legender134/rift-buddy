import test from 'node:test';
import assert from 'node:assert/strict';
import game from '../data/game.json' with {type:'json'};
import {createCompositionMechanics} from '../src/core/composition-mechanics.mjs';
import {createSlots,recommend} from '../src/core/recommend.mjs';
import {createRecommendationLane,createRecommendationSearchSession} from '../src/core/recommendation-search.mjs';
import {meetsRecommendationFit,orderRecommendationPage} from '../src/core/recommendation-policy.mjs';
import {lineupFit} from '../src/core/room-ballot.mjs';

test('community search revisits the player role across batches and still covers other roles',()=>{
 const targets=['top','jungle','mid','bottom','support'];
 const fixed=targets.map(role=>({role,champion:null}));
 const candidates=Object.fromEntries(targets.map(role=>[role,[{id:role+'1'},{id:role+'2'}]]));
 const record=(id,roles,index=1)=>({id,roles,seed:fixed.map(slot=>roles.includes(slot.role)?{...slot,champion:slot.role+index}:slot)});
 const communityRecords=[record('a-bottom',['bottom','support']),record('b-bottom',['bottom','support'],2),record('m-mid',['mid','support']),
  record('top-jungle-a',['top','jungle']),record('top-jungle-b',['top','jungle'],2),record('top-mid-a',['top','mid']),record('top-mid-b',['top','mid'],2)];
 function firstVisits(communityAfter=''){
  const evaluated=new Set();
  const {community}=createRecommendationLane({fixed,targets,candidates,seeds:[],weights:{},communityRecords,focusRole:'top',randomSeed:'ranked',communityAfter,evaluate:(_slots,id)=>{evaluated.add(id);return null;}});
  for(let step=0;step<300&&!community.exhausted;step++)community.work(true,true);
  return [...evaluated];
 }
 const order=firstVisits();
 assert.deepEqual(new Set(order),new Set(communityRecords.map(record=>record.id)));
 assert.deepEqual(order.map(id=>id.startsWith('top-')),[true,true,false,true,true,false,false]);
 assert.notEqual(order[0].split('-')[1],order[1].split('-')[1]);
 assert.deepEqual(firstVisits(order[1]).slice(0,3),order.slice(2,5));
});

test('a manually selected position guides recipe search before it is bound to the client slot',()=>{
 const slots=createSlots().map(slot=>({...slot,party:['top','jungle'].includes(slot.role)}));
 const clientSession={localPlayerCellId:1,myTeam:[{cellId:1,championId:0,assignedPosition:''}]};
 const focusRole=recommend({slots,champions:game.champions,patch:game.patch,scope:'party',soloRole:'top',clientSession},lane=>lane.focusRole);
 assert.equal(focusRole,'top');
});

test('community pages explore distinct positions when several larger recipes all use bottom',()=>{
 const targets=['top','jungle','mid','bottom','support'];
 const fixed=targets.map(role=>({role,champion:null}));
 const roleGroups=[
  ['top','jungle','bottom'],['top','mid','bottom'],['top','support','bottom'],
  ['top','jungle'],['jungle','mid','bottom'],['mid','support'],
 ];
 const communityRecords=roleGroups.map((roles,index)=>({
  id:String(index),roles,seed:fixed.map(slot=>roles.includes(slot.role)?{...slot,champion:slot.role+index}:slot),
 }));
 const candidates=Object.fromEntries(targets.map(role=>[role,communityRecords.flatMap(record=>record.seed.filter(slot=>slot.role===role&&slot.champion).map(slot=>({id:slot.champion})))]));
 function collect(communityAfter=''){
  const lane=createRecommendationLane({
   fixed,targets,candidates,seeds:[],weights:{},communityRecords,communityAfter,focusRole:'top',randomSeed:'review',
   evaluate:(slots,id)=>({slots,recommendationFit:{score:85},communityCombinationId:id,reviewedCombinationIds:id?[id]:[]}),format:row=>row,
  });
  const session=createRecommendationSearchSession([lane]),ids=[];
  let newPage=false;
  for(let attempt=0;attempt<300&&ids.length<communityRecords.length;attempt++){
   const page=session.advance({limit:6,newPage});
   newPage=page.complete;
   if(page.complete)for(const row of page.rows)if(row.communityCombinationId&&!ids.includes(row.communityCombinationId))ids.push(row.communityCombinationId);
  }
  return ids;
 }
 const order=collect();
 assert.deepEqual(new Set(order),new Set(communityRecords.map(record=>record.id)));
 assert.ok(order.slice(0,2).every(id=>roleGroups[id].includes('top')));
 assert.ok(order.slice(0,3).some(id=>!roleGroups[id].includes('bottom')));
 const resumed=collect(order[0]);
 assert.ok(resumed.slice(0,3).some(id=>!roleGroups[id].includes('bottom')),JSON.stringify({order,resumed}));
});

test('a recipe excluded by member weights does not alter visible role coverage',()=>{
 const targets=['top','jungle','mid','support'];
 const fixed=targets.map(role=>({role,champion:null}));
 const candidates=Object.fromEntries(targets.map(role=>[role,[{id:role+'A'},{id:role+'B'}]]));
 const record=(id,roles,top)=>({id,roles,seed:fixed.map(slot=>({
  ...slot,champion:roles.includes(slot.role)?slot.role+(slot.role==='top'?top:'A'):null,
 }))});
 const legal=[record('jg',['top','jungle'],'A'),record('mid',['top','mid'],'A')];
 const excluded=record('off',['top','jungle','support'],'B');
 function visits(communityRecords){
  const ids=new Set();
  const {community}=createRecommendationLane({
   fixed,targets,candidates,seeds:[],weights:{top:{topA:1,topB:0}},communityRecords,focusRole:'top',randomSeed:'ranked',
   evaluate:(_slots,id)=>{ids.add(id);return null;},
  });
  for(let step=0;step<300&&!community.exhausted;step++)community.work(true,true);
  return [...ids];
 }
 assert.deepEqual(visits([...legal,excluded]),visits(legal));
 assert.deepEqual(new Set(visits(legal)),new Set(['jg','mid']));
});

test('area control and ally damage routes require the actual spell conditions',()=>{
 const graph=createCompositionMechanics(new Map(game.champions.map(champion=>[champion.id,champion])),game.patch);
 const kennen={role:'top',champion:'Kennen'},viktor={role:'mid',champion:'Viktor'};
 const area=graph.match(kennen,viktor,true).tactic.evidence;
 assert.equal(area.setupSpell,'Kennen_Passive.png');
 assert.equal(area.followSpell,'ViktorW');
 assert.match(area.condition,/三层雷缚印.*1\.25 秒/);
 assert.match(area.failure,/提前离开/);
 const jhin={role:'bottom',champion:'Jhin'},card={role:'mid',champion:'TwistedFate'};
 const mark=graph.match(card,jhin,true).tactic.evidence;
 assert.equal(mark.setupSpell,'PickACard');
 assert.equal(mark.followSpell,'JhinW');
 assert.match(mark.condition,/造成伤害.*第一个敌方英雄/);
});

test('a small search prefix explores both open positions and continuation visits each completion once',()=>{
 const targets=['top','jungle'];
 const fixed=targets.map(role=>({role,champion:null}));
 const candidates={top:['a','b','c'],jungle:['d','e','f','g','h']};
 for(const role of targets)candidates[role]=candidates[role].map(id=>({id}));
 const lane=createRecommendationLane({fixed,targets,candidates,seeds:[],weights:{},evaluate:slots=>({slots})});
 assert.equal(lane.prepare(),true);
 const {stream}=lane.draw(),rows=[];
 const compare=()=>0;
 assert.equal(stream.prepare(),true);
 while(stream.advance())rows.push(stream.take(compare).slots.map(slot=>slot.champion));
 assert.equal(stream.exhausted,true);
 assert.equal(new Set(rows.slice(0,3).map(([top])=>top)).size,3);
 assert.equal(new Set(rows.slice(0,3).map(([,jungle])=>jungle)).size,3);
 assert.equal(rows.length,15);
 assert.equal(new Set(rows.map(row=>row.join('|'))).size,15);
});

test('overlapping role pools offer a legal first completion and retain every legal assignment',()=>{
 const targets=['top','jungle','mid'];
 const fixed=targets.map(role=>({role,champion:null}));
 const heroes=['a','b','c','d'].map(id=>({id}));
 const candidates=Object.fromEntries(targets.map(role=>[role,heroes]));
 const lane=createRecommendationLane({fixed,targets,candidates,seeds:[],weights:{},evaluate:slots=>({slots})});
 lane.prepare();
 const {stream}=lane.draw(),rows=[];
 stream.prepare();
 assert.equal(stream.advance(),true);
 assert.equal(stream.hasRows,true);
 do{
  const row=stream.take(()=>0);
  if(row)rows.push(row.slots.map(slot=>slot.champion).join('|'));
 }while(stream.advance());
 assert.equal(rows.length,24);
 assert.equal(new Set(rows).size,24);
});

test('the score floor rejects an incomplete lineup when its public constraints already make it ineligible',()=>{
 assert.equal(meetsRecommendationFit({score:null,compatible:false}),false);
 assert.equal(meetsRecommendationFit({score:null,compatible:true,scoreCeiling:45}),false);
 assert.equal(meetsRecommendationFit({score:null,compatible:true}),true);
 assert.equal(meetsRecommendationFit({score:60,compatible:true}),true);
});

test('public matchup evidence breaks ties while known fit scores remain in descending order',()=>{
 const row=(id,score,adjustment=0,ranked=0)=>({id,recommendationFit:{score},opponentFit:{adjustment,ranked:{adjustment:ranked}}});
 const rows=[row('weak-fit',79,12,4),row('same-fit',81),row('known-matchup',81,0,2),row('strong-fit',83),row('unknown-fit',null,12,4)];
 assert.deepEqual(orderRecommendationPage(rows).map(r=>r.id),['strong-fit','known-matchup','same-fit','weak-fit','unknown-fit']);
});

test('the bundled Rift source supports unchanged verified spells and rejects changed source content',()=>{
 const byId=new Map(game.champions.map(c=>[c.id,c]));
 const vi={role:'jungle',champion:'Vi'},ahri={role:'mid',champion:'Ahri'};
 const graph=createCompositionMechanics(byId,game.patch);
 const detailed=graph.match(vi,ahri,true),scalar=graph.match(vi,ahri,false);
 assert.equal(detailed.tactic.evidence.setupSpell,'ViR');
 assert.equal(detailed.tactic.evidence.followSpell,'AhriE');
 assert.equal(detailed.tactic.evidence.patch,game.patch);
 assert.equal(detailed.relation.quality,scalar.relation.quality);
 assert.equal(detailed.tactic.tactic,scalar.tactic.tactic);
 const changed=structuredClone(byId.get('Ahri'));
 changed.mechanicSource.spells[2].tooltip+='changed';
 assert.equal(createCompositionMechanics(new Map(byId).set('Ahri',changed),game.patch).match(vi,ahri,true),null);
});

test('offline skill evidence distinguishes actual airborne and carried-zone triggers',()=>{
 const graph=createCompositionMechanics(new Map(game.champions.map(c=>[c.id,c])),game.patch);
 const match=(a,b)=>graph.match({role:'jungle',champion:a},{role:'mid',champion:b},true)?.tactic.evidence;
 assert.equal(match('JarvanIV','Yasuo').setupSpell,'JarvanIVDragonStrike');
 assert.equal(match('JarvanIV','Yasuo').followSpell,'YasuoR');
 assert.equal(match('Renekton','Yasuo'),undefined);
 assert.equal(match('Diana','Orianna').followSpell,'OrianaDetonateCommand');
});

test('cross-role mechanics require the actual second cast and enemy-targeted stun',()=>{
 const graph=createCompositionMechanics(new Map(game.champions.map(c=>[c.id,c])),game.patch);
 const match=(a,role,b)=>graph.match({role,champion:a},{role:'mid',champion:b},true).tactic.evidence;
 const arrival=match('Nocturne','jungle','Galio');
 assert.match(arrival.condition,/二段 R/);
 assert.equal(arrival.followSpell,'GalioR');
 const control=match('Renekton','top','Lissandra');
 assert.equal(control.setupSpell,'RenektonPreExecute');
 assert.match(control.failure,/自施 R/);
});

test('created terrain raises Poppy and Anivia fit without requiring an authored combination',()=>{
 const current=[{role:'top',party:true},{role:'mid',party:true}];
 const lineup=current.map(slot=>({...slot,champion:slot.role==='top'?'Poppy':'Anivia'}));
 const fit=lineupFit(lineup,current,game.champions,{patch:game.patch,scope:'party',editableRoles:['top','mid'],catalogStatus:{}});
 assert.ok(fit.score>=60);
 assert.equal(fit.tacticEvidence.setupSpell,'Crystallize');
 assert.equal(fit.tacticEvidence.followSpell,'PoppyE');
 assert.match(fit.tacticEvidence.failure,/墙体已经消失/);
});
