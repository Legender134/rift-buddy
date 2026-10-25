import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {sanitizeSession} from '../services/lcu.mjs';
import {clientRenderIdentity} from '../src/core/client-party.mjs';
import {pickEligibilityContext} from '../src/core/pick-eligibility.mjs';
import {companionView} from '../src/companion-view.mjs';

const data=JSON.parse(await fs.readFile(new URL('../data/game.json',import.meta.url),'utf8'));
const key=id=>data.champions.find(c=>c.id===id).key;
const pool=['Malphite','Xerath','Teemo','Karma','Trundle','Brand','Morgana','Garen','Nami','Lulu','Kennen','Braum'];
function fixture(){
 const raw={gameId:777,localPlayerCellId:0,myTeam:['Lux','Ashe','Veigar','Sona','Jinx'].map((id,cellId)=>({cellId,championId:key(id)})),theirTeam:[],benchEnabled:true,benchChampions:pool.map(id=>({championId:key(id)}))};
 const client={connected:true,phase:'ChampSelect',mode:{id:'hex'},party:{members:[{cellId:0}]},session:sanitizeSession(raw)};
 const render=()=>companionView({data,client,slots:[],tab:'recommend',preferences:{},configurationStatus:{}});
 return {raw,client,render};
}
function visiblePool(html){
 const section=html.match(/<section class="hex-shared-bench"[^>]*>([\s\S]*?)<\/section>/)?.[1];
 assert.ok(section,'The sidebar must expose the shared bench independently of recommended lineups');
 assert.doesNotMatch(section,/<details\b/,'Available heroes must not be hidden in a disclosure');
 return [...section.matchAll(/data-action="hex-quick-pick"[^>]*data-id="([^"]+)"/g)].map(m=>m[1]);
}
test('the sidebar shows every shared bench hero even when only three recommended lineups are visible',()=>{
 const f=fixture(),before=structuredClone(f.client),html=f.render();
 assert.deepEqual(visiblePool(html).sort(),[...pool].sort());
 assert.deepEqual(f.client,before);
 assert.doesNotMatch(html,/class="hex-ranking|>英雄胜率</,'Win rates must not repeat in a second section');
 const section=html.match(/<section class="hex-shared-bench"[^>]*>([\s\S]*?)<\/section>/)[1],visible=section.replace(/<[^>]+>/g,'');
 assert.doesNotMatch(visible,/全队共用|点头像|12 位|墨菲特|泽拉斯/);assert.doesNotMatch(html,/我们 · 1 人/);
 assert.match(section,/class="hex-bench-hero self"[^>]*data-action="hex-reference-preview"[^>]*data-id="Lux"/);assert.match(section,/<small>我<\/small>/);
 assert.match(section,/class="hex-bench-hero teammate"[^>]*data-action="hex-reference-preview"[^>]*data-id="Ashe"/);assert.match(section,/<small>队友<\/small>/);
 assert.equal((section.match(/class="hex-bench-rate"/g)||[]).length,17,'Every bench or selected champion has one rate');
 const rates=[...section.matchAll(/data-win-rate="([^"]+)"/g)].map(m=>Number(m[1]));assert(rates.every((n,i)=>!i||n<=rates[i-1]));
 assert.match(html,/class="hex-party-fit"[^>]*title="基础机制覆盖，非胜率/);assert.match(html,/<small>契合<\/small><b>\d+(?:–\d+)?<\/b>/);
});

test('shared pool marks our friends independently of ordinary teammates without turning selected heroes into swap actions',()=>{
 const f=fixture();f.client.party.members.push({cellId:2});const html=f.render(),section=html.match(/<section class="hex-shared-bench"[^>]*>([\s\S]*?)<\/section>/)[1];
 assert.match(section,/class="hex-bench-hero party"[^>]*data-action="hex-reference-preview"[^>]*data-id="Veigar"/);assert.match(section,/<small>我们<\/small>/);
 assert.deepEqual(visiblePool(html).sort(),[...pool].sort());assert.equal((section.match(/data-id="Veigar"/g)||[]).length,1);
});
test('ordinary teammates can add and remove shared bench heroes without changing the local pick or party membership',()=>{
 const f=fixture(),before=clientRenderIdentity(f.client);
 assert.equal(visiblePool(f.render()).length,12);
 f.raw.benchChampions.push({championId:key('Hecarim')});
 f.raw.benchChampions=f.raw.benchChampions.filter(p=>p.championId!==key('Xerath'));
 f.client.session=sanitizeSession(f.raw);
 assert.notEqual(clientRenderIdentity(f.client),before,'A bench-only update must repaint the sidebar');
 assert.deepEqual(visiblePool(f.render()).sort(),[...pool.filter(id=>id!=='Xerath'),'Hecarim'].sort());
 assert.doesNotMatch(f.render(),/class="hex-bench-hero [^"]*"[^>]*data-id="Xerath"/);assert.match(f.render(),/class="hex-bench-hero [^"]*"[^>]*data-id="Hecarim"/);
 f.raw.benchChampions=[];f.client.session=sanitizeSession(f.raw);
 assert.deepEqual(visiblePool(f.render()),[],'Removed heroes must not survive in a cached pool');
 const section=f.render().match(/<section class="hex-shared-bench"[^>]*>([\s\S]*?)<\/section>/)[1];assert.equal((section.match(/class="hex-bench-rate"/g)||[]).length,5,'An empty bench keeps only the five real selected heroes');
});
test('shared bench clicks exclude occupied, disabled and locally unpickable heroes without inventing entries',()=>{
 const f=fixture();
 f.raw.benchChampions.push({championId:key('Ashe')},{championId:key('Malphite')},{championId:99999});
 f.client.session=sanitizeSession(f.raw);
 f.client.eligibility={context:pickEligibilityContext(f.client.session),localPlayerCellId:0,receivedAt:new Date().toISOString(),pickable:pool.filter(id=>id!=='Brand').map(key),disabled:[key('Garen')]};
 assert.deepEqual(visiblePool(f.render()).sort(),pool.filter(id=>!['Brand','Garen'].includes(id)).sort());
});
