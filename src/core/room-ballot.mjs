import {proposalKey} from './room.mjs';
import {conventionalRole} from './rules.mjs';
import {analyzeTeam} from './recommend.mjs';

// This is an explained rule score, never a win-rate estimate. Fixed picks
// dominate; the remaining points describe common lanes and complementary jobs.
export function lineupFit(lineup,current,champions){
 const members=lineup.filter(s=>s.champion&&current.find(c=>c.role===s.role)?.party!==false);
 const fixed=current.filter(s=>s.party&&s.champion&&(Number.isInteger(s.clientCellId)||s.manualPosition||s.publicIntent));
 const heroMatches=fixed.filter(s=>members.some(m=>m.champion===s.champion)).length;
 const roleMatches=fixed.filter(s=>members.some(m=>m.champion===s.champion&&m.role===s.role)).length;
 const picks=fixed.length?Math.round(40*heroMatches/fixed.length):40;
 const positions=fixed.length?Math.round(30*roleMatches/fixed.length):30;
 const known=members.filter(s=>champions.some(c=>c.id===s.champion));
 const lanes=known.length?Math.round(15*known.filter(s=>conventionalRole(champions.find(c=>c.id===s.champion),s.role)).length/known.length):0;
 const traits=analyzeTeam(known,champions).traits;
 const jobs=['engage','peel','sustain'].filter(k=>traits[k]>0).length,coverage=Math.round(15*jobs/3);
 return {score:picks+positions+lanes+coverage,compatible:heroMatches===fixed.length,exact:roleMatches===fixed.length,
  reason:`已选英雄 ${picks}/40 · 已选位置 ${positions}/30 · 常规分路 ${lanes}/15 · 开团/保护/输出 ${coverage}/15。规则分，不是胜率。${fixed.length?'':' 尚未选人，前两项按无冲突计分。'}`};
}
export function roomBallotBoard(room,current,champions){
 const members=(room?.members||[]).filter(m=>m.online!==false),groups=new Map();
 for(const member of members){const proposal=member.share?.ballot?.proposal;if(!proposal)continue;const key=proposalKey(proposal.lineup);let row=groups.get(key);
  if(!row){row={key,proposal,from:member.nick,proposers:[],voters:[],mine:false,fit:lineupFit(proposal.lineup,current,champions)};groups.set(key,row);}row.proposers.push(member.nick);
 }
 for(const member of members){const row=groups.get(member.share?.ballot?.vote);if(row){row.voters.push(member.nick);if(member.self)row.mine=true;}}
 return [...groups.values()].sort((a,b)=>Number(b.fit.compatible)-Number(a.fit.compatible)||b.voters.length-a.voters.length||b.fit.score-a.fit.score||a.key.localeCompare(b.key));
}
