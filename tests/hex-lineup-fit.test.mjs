import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {hexLineupFit,hexPartyDraft} from '../src/core/hex-party-draft.mjs';
const data=JSON.parse(await fs.readFile(new URL('../data/game.json',import.meta.url))),team=ids=>ids.map((id,cellId)=>({cellId,hero:data.champions.find(h=>h.id===id)||null})),score=ids=>hexLineupFit({data,team:team(ids)});

test('fixed teammates contribute once to whole-team mechanism coverage, never a win probability',()=>{
 const before=score(['Lux','Ashe','Veigar','Sona','Jinx']),after=score(['Malphite','Ashe','Veigar','Sona','Jinx']);
 assert.deepEqual([before.minimum,before.maximum],[70,70]);assert.deepEqual(before.missing,['承伤手段']);assert.deepEqual([after.minimum,after.maximum],[100,100]);
 assert.deepEqual(score(['Lux','Ashe','Malphite',null,null]),after,'Already confirmed tools stay present even with two unknown positions');
});

test('unknown mechanics form a range instead of silently becoming absent or normalized to 100',()=>{
 const fit=score(['Akshan','Ashe','Veigar','Sona','Jinx']);assert.deepEqual([fit.minimum,fit.maximum],[70,100]);assert.deepEqual(fit.pending,['承伤手段']);
 assert.deepEqual([score([null,null,null,null,null]).minimum,score([null,null,null,null,null]).maximum],[0,100]);
 const stale=hexLineupFit({data:{...data,patch:'99.1'},team:team(['Malphite','Ashe','Veigar','Sona','Jinx'])});assert.deepEqual([stale.minimum,stale.maximum],[0,100]);
});

test('source drift withdraws only the tools that rely on the changed hero',()=>{
 const changed=structuredClone(data);changed.champions.find(h=>h.id==='Malphite').mechanicSource.character.sha256='0'.repeat(64);
 const rows=team(['Malphite','Ashe','Veigar','Sona','Jinx']).map(p=>({...p,hero:changed.champions.find(h=>h.id===p.hero.id)})),fit=hexLineupFit({data:changed,team:rows});assert.deepEqual([fit.minimum,fit.maximum],[70,100]);assert.deepEqual(fit.covered,['先手控制','保护','持续输出','消耗']);
});

test('candidate substitution keeps fixed cells and an unselected pending hero cannot alter displayed scores',()=>{
 const c={connected:true,phase:'ChampSelect',mode:{id:'hex'},party:{members:[]},session:{gameId:88,localPlayerCellId:0,myTeam:team(['Lux','Ashe','Veigar','Sona','Jinx']).map(p=>({cellId:p.cellId,championId:p.hero.key})),bench:{championIds:['Malphite','Xerath'].map(id=>data.champions.find(h=>h.id===id).key)}}};
 const first=hexPartyDraft({data,client:c}),find=(m,id)=>m.lineups.find(r=>r.members[0].hero.id===id).fit;
 assert.deepEqual([find(first,'Malphite').minimum,find(first,'Malphite').maximum],[100,100]);assert.deepEqual([find(first,'Lux').minimum,find(first,'Lux').maximum],[70,70]);
 assert(first.lineups.findIndex(r=>r.members[0].hero.id==='Malphite')<first.lineups.findIndex(r=>r.members[0].hero.id==='Lux'),'A confirmed 100 must appear before a confirmed 70');
 c.session.bench.championIds.push(data.champions.find(h=>h.id==='Akshan').key);const next=hexPartyDraft({data,client:c});assert.deepEqual(find(next,'Malphite'),find(first,'Malphite'));assert.deepEqual(find(next,'Lux'),find(first,'Lux'));
});

test('the final beam scores every legal candidate before its cap so high-rate non-frontliners cannot hide a confirmed 100',()=>{
 const ids=['Malphite','Akshan','TwistedFate','Kayle','Teemo','Lillia','Morgana','Hwei','Yuumi','Janna','Ahri','Viktor','Ryze','Seraphine','Zilean','MissFortune','Corki','Ivern','Caitlyn','Syndra','Lucian','AurelionSol','Draven','Renata','Katarina','Heimerdinger'];
 const c={connected:true,phase:'ChampSelect',mode:{id:'hex'},party:{members:[]},session:{gameId:88,localPlayerCellId:0,myTeam:team(['Lux','Ashe','Veigar','Sona','Jinx']).map(p=>({cellId:p.cellId,championId:p.hero.key})),bench:{championIds:ids.map(id=>data.champions.find(h=>h.id===id).key)}}};
 for(const pool of [ids,[...ids].reverse()]){c.session.bench.championIds=pool.map(id=>data.champions.find(h=>h.id===id).key);const m=hexPartyDraft({data,client:c}),row=m.lineups.find(r=>r.members[0].hero.id==='Malphite');assert(row);assert.deepEqual([row.fit.minimum,row.fit.maximum],[100,100]);assert.equal(m.lineups[0].fit.minimum,100);}
});
