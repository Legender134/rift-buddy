import {comboMembers} from './core/combo-members.mjs';
import {ROLES} from './core/rules.mjs';
import {escape as e} from './ui.mjs';

// A curated plan may cover only part of a larger displayed lineup.
export function subgroupText(plan,slots,data,displayed=slots){
 if(!plan||(plan.archetype&&plan.archetype!=='curated')||!Array.isArray(slots)||!Array.isArray(displayed)||displayed.filter(s=>s.champion).length<4)return '';
 const members=plan.archetype==='curated'?plan.members:comboMembers(plan);
 if(![2,3].includes(members?.length)||!members.every(m=>slots.some(s=>s.role===m.role&&s.champion===m.champion)))return '';
 const names=members.map(m=>`${ROLES.find(r=>r.id===m.role)?.name||m.role}·${data.champions.find(c=>c.id===m.champion)?.name||m.champion}${slots.find(s=>s.role===m.role&&s.champion===m.champion)?.party===false?'（队友）':''}`).join('、');
 return `局部配合：${names}；其他成员未纳入这段配合。`;
}
export function subgroupNotice(plan,slots,data,displayed=slots){const text=subgroupText(plan,slots,data,displayed);return text?`<p class="bottom-note">${e(text)}</p>`:'';}
