import {hexAugmentStatistics} from './core/hex-augment-statistics.mjs';
import {escape as e,asset,button} from './ui.mjs';

export function hexAugmentRankingView(data){
 const ref=hexAugmentStatistics(data);if(!ref)return '';
 const lookup=new Map(data.augments.map(a=>[a.id,a])),rows=ref.rows.filter(r=>r.samples>=200).toSorted((a,b)=>b.winRate-a.winRate||b.samples-a.samples||a.id-b.id);
 if(!rows.length)return '';
 const icon=row=>{const a=lookup.get(row.id),win=(row.winRate*100).toFixed(1)+'%',brief=`选取率 ${(row.pickRate*100).toFixed(1)}% · ${row.samples.toLocaleString('zh-CN')} 样本`;
  return `<button type="button" class="hex-augment-rank-icon" data-action="augment-detail" data-id="${row.id}" data-game-tooltip-kind="augment" data-game-tooltip-id="${row.id}" data-game-tooltip-compact data-hex-brief="${e(brief)}" aria-label="${e(a.name+' · 胜率 '+win+' · '+brief)}">${asset('augment',a.id,a.name)}<span>${win}</span></button>`;
 };
 const source=button('link','↗','','quiet small',`data-url="${e(ref.sourceUrl)}" title="${e('ARAMKit · '+ref.patch+' · '+ref.dataDate+' · 全英雄/全段位；地区未披露；至少200样本，非出现概率')}" aria-label="强化统计来源"`);
 return `<section class="hex-augment-ranking" aria-label="全英雄强化胜率榜"><header class="companion-section-head"><h3>强化胜率</h3>${source}</header><div class="hex-augment-rank-grid">${rows.slice(0,24).map(icon).join('')}</div>${rows.length>24?`<details class="hex-workspace-more" data-disclosure-key="hex-global-augments-${e(ref.patch)}"><summary>更多</summary><div class="hex-augment-rank-grid">${rows.slice(24).map(icon).join('')}</div></details>`:''}</section>`;
}
