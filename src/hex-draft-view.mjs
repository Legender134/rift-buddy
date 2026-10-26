import {hexPartyDraft} from './core/hex-party-draft.mjs';
import {escape as e,portrait,button} from './ui.mjs';

const labels={self:'我',party:'我们',teammate:'队友'};
export function hexDraftView({data,client,slots=[]}){
 const model=hexPartyDraft({data,client,slots});
 const selectable=new Set(model.board.filter(p=>p.available).map(p=>p.hero.id));
 const member=(p,evidence)=>{const pick=p.self&&selectable.has(p.hero.id),condition=Object.values(evidence||{}).find(v=>typeof v==='string')||Object.values(evidence||{}).find(v=>v?.pending)?.pending||'机制资料待核';return `<span class="hex-party-member-wrap"><button type="button" class="hex-party-member ${p.self?'self':''}" data-action="${pick?'hex-quick-pick':'hex-reference-preview'}" data-id="${e(p.hero.id)}" title="${e(p.hero.name+' · '+condition)}" aria-label="${e((p.self?'我':'我们')+' · '+p.hero.name+(pick?'，点击直接切换':'，查看配置'))}">${portrait(p.hero,'sm')}${p.self?'<small>我</small>':''}</button>${pick?`<button type="button" class="hex-party-preview" data-action="hex-reference-preview" data-id="${e(p.hero.id)}" aria-label="${e('我 · '+p.hero.name+'，查看配置')}" title="查看配置">…</button>`:''}</span>`;};
 const lineup=(row,index)=>{
  const fit=row.fit,score=fit.minimum===fit.maximum?String(fit.minimum):fit.minimum===0&&fit.maximum===100?'—':`${fit.minimum}–${fit.maximum}`;
  const hint=['基础机制覆盖，非胜率',fit.covered.length?'已有：'+fit.covered.join('、'):'',fit.missing.length?'缺：'+fit.missing.join('、'):'',fit.pending.length?'待核：'+fit.pending.join('、'):''].filter(Boolean).join('；');
  return `<article class="hex-party-lineup" aria-label="推荐阵容 ${index+1}"><div>${row.members.map(p=>member(p,row.evidence.find(r=>r.hero===p.hero.name)?.traits)).join('')}</div><span class="hex-party-fit" title="${e(hint)}" aria-label="${e('契合 '+score+'，'+hint)}"><small>契合</small><b>${score}</b></span></article>`;
 };
 const empty=!model.active?'进入海克斯选人后同步':!model.benchKnown?'客户端暂未提供可换英雄':!model.own?'尚未确认本人选人位置':'暂无可换阵容';
 const benchEmpty=!model.active?'进入海克斯选人后同步':!model.benchKnown?'客户端暂未提供可换英雄':!model.own?'尚未确认本人选人位置':'暂无可换英雄';
 const stats=model.statistics,rates=new Map((stats?.rows||[]).map(r=>[r.hero,r])),date=stats?.rows.reduce((date,row)=>row.date>date?row.date:date,''),partyCells=new Set(model.party.map(p=>p.cellId)),seen=new Set();
 const pool=[...model.team.filter(p=>p.hero).map(p=>({hero:p.hero,selected:p.self?'self':partyCells.has(p.cellId)?'party':'teammate',statistics:rates.get(p.hero.id)||null})),...model.board].filter(p=>!seen.has(p.hero.id)&&seen.add(p.hero.id)).sort((a,b)=>(b.statistics?.winRate??-1)-(a.statistics?.winRate??-1)||a.hero.key-b.hero.key);
 const source=stats?button('link','↗','','quiet small',`data-url="${e(stats.sourceUrl)}" title="${e('国服 · '+data.patch+' · '+date+'；ARAMGG转述腾讯统计，样本量未提供') }" aria-label="胜率来源"`):'';
 const bench=`<section class="hex-shared-bench" aria-label="全队共享备选池"><header class="companion-section-head"><h3>共享备选池</h3>${source}</header><div class="hex-bench-grid">${pool.map(({hero,selected,statistics})=>{
  const pick=!selected&&selectable.has(hero.id),state=labels[selected]||'',rate=statistics?(statistics.winRate*100).toFixed(1)+'%':'—',hint=[hero.name,state,rate,pick?'点击切换':'查看配置'].filter(Boolean).join(' · ');
  return `<button type="button" class="hex-bench-hero ${selected||''}" data-action="${pick?'hex-quick-pick':'hex-reference-preview'}" data-id="${e(hero.id)}" data-win-rate="${statistics?.winRate??''}" aria-label="${e(hint)}" title="${e(hint)}">${portrait(hero,'sm')}${state?`<small>${state}</small>`:''}<span class="hex-bench-rate">${rate}</span></button>`;
 }).join('')||`<p class="companion-empty">${benchEmpty}</p>`}</div></section>`;
 return `<section class="hex-draft hex-workspace" aria-label="海克斯阵容">${!model.active?'<p class="hex-draft-empty">选人后同步备选池</p>':bench}${model.lineups.length?'<header class="companion-section-head"><h3>推荐阵容</h3></header>':''}${model.lineups.slice(0,3).map(lineup).join('')||(model.active&&pool.length?`<p class="hex-draft-empty">${empty}</p>`:'')}${model.lineups.length>3?`<details class="hex-workspace-more" data-disclosure-key="hex-party-${e(client?.session?.gameId||'draft')}"><summary>更多阵容</summary>${model.lineups.slice(3).map((row,index)=>lineup(row,index+3)).join('')}</details>`:''}</section>`;
}
