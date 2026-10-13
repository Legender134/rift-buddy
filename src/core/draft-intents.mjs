import {CLIENT_POSITION_ROLES,manualPlayerSlot} from './draft.mjs';

// Comparing another proposal must not erase the adopted lineup. Release only
// the assistant's prospective members in this temporary search input; explicit
// user choices and public client picks still constrain every candidate.
export function comparisonDraft(slots,plan,session,champions){
 const picked=new Set((session?.myTeam||[]).map(p=>champions.find(c=>c.key===Number(p.championId))?.id).filter(Boolean));
 return slots.map(slot=>{
  const proposed=slot.automaticPosition&&!slot.manualPosition&&!Number.isInteger(slot.clientCellId)&&(!plan||plan.members?.some(m=>m.role===slot.role&&m.champion===slot.champion))&&(!Array.isArray(plan?.editableTargets)||plan.editableTargets.includes(slot.role));
  return proposed&&!picked.has(slot.champion)?{...slot,champion:null,locked:false}:{...slot};
 });
}

// Temporary recommendation context only. Public hovers remain unlocked and
// must not replace the canonical, persisted draft or authorize client writes.
export function recommendationDraft(slots,session,champions,{ownRole='',bans=[],disabled=[],eligibleByRole={}}={}){
 const next=structuredClone(slots).map(slot=>{
  if(!slot.publicIntent)return slot;
  const {publicIntent,...rest}=slot;return {...rest,champion:null,locked:false};
 });
 const team=Array.isArray(session?.myTeam)?session.myTeam:[];
 const byKey=new Map(champions.map(c=>[c.key,c.id])),known=new Set(champions.map(c=>c.id));
 const hero=value=>known.has(value)?value:byKey.get(Number(value));
 const blocked=new Set([...bans,...disabled,...(session?.bans||[])].map(hero).filter(Boolean));
 for(const player of team)if(Number(player.championId)>0)blocked.add(hero(player.championId));
 if(session?.allowDuplicatePicks===false)for(const player of session.theirTeam||[])if(Number(player.championId)>0)blocked.add(hero(player.championId));
 const intents=team.filter((player,index)=>Number.isInteger(player.cellId)&&player.cellId>=0&&player.cellId<30&&team.findIndex(p=>p.cellId===player.cellId)===index&&Number(player.championId||0)===0&&Number.isSafeInteger(player.championPickIntent)&&player.championPickIntent>0&&byKey.has(player.championPickIntent)).map(player=>{
  const manual=manualPlayerSlot(next,player.cellId),local=player.cellId===session.localPlayerCellId;
  const role=manual?.role||(local&&next.some(s=>s.role===ownRole)?ownRole:'')||CLIENT_POSITION_ROLES[String(player.assignedPosition||'').toUpperCase()];
  return {player,role,id:byKey.get(player.championPickIntent)};
 });
 for(const intent of intents){
  const {player,role,id}=intent,target=next.find(s=>s.role===role);
  if(!target||blocked.has(id)||intents.filter(p=>p.id===id).length!==1||intents.filter(p=>p.role===role).length!==1)continue;
  const proposal=target.automaticPosition&&!target.manualPosition&&!Number.isInteger(target.clientCellId);
  if(target.locked&&!proposal||Number.isInteger(target.clientCellId)&&target.clientCellId!==player.cellId||target.champion&&target.champion!==id&&(target.manualPosition||Number.isInteger(target.clientCellId)))continue;
  if(next.some(s=>s!==target&&s.champion===id)||Array.isArray(eligibleByRole[role])&&!eligibleByRole[role].includes(id))continue;
  target.champion=id;target.locked=false;target.publicIntent=true;
 }
 return next;
}
