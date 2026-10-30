import {escape as e,asset,button,dateLabel} from './ui.mjs';
import {gameTooltipView} from './game-tooltip-view.mjs';

const mapFor=mode=>mode==='hex'?'12':'11';
const validId=id=>/^\d{1,8}$/.test(String(id));
const itemFor=(data,id)=>validId(id)&&Object.hasOwn(data.items||{},String(id))?data.items[String(id)]:null;
const modeName=mode=>mode==='hex'?'海克斯大乱斗':'召唤师峡谷';
const available=(item,mode)=>item?.maps?.[mapFor(mode)]===true;
const heroName=(data,id)=>data.champions?.find(champion=>champion.id===id)?.name||id;
const sourceLink=(url,host,label)=>{
 if(typeof url!=='string')return '';
 try{const parsed=new URL(url);if(parsed.protocol!=='https:'||parsed.hostname!==host)return '';}catch{return '';}
 return button('link',label,'link','quiet small',`data-url="${e(url)}"`);
};
function availability(data,item,mode){
 const base=itemFor(data,item.specialRecipe);
 const questBase=item.tags?.includes('Boots')&&item.gold?.base===0&&Array.isArray(item.from)&&item.from.length===1&&itemFor(data,item.from[0])?.tags?.includes('Boots')?itemFor(data,item.from[0]):null;
 let label;
 if(String(item.id)==='3330')label=mode==='rift'?'费德提克饰品替换':'费德提克饰品；模式获取方式待核';
 else if(String(item.id)==='3865'&&mode==='rift')label='峡谷辅助位置通常给予';
 else if(mode==='hex')label='海克斯获取方式待核';
 else if(questBase)label=`位置任务升级 · 基础鞋 ${questBase.name}`;
 else if(base)label=`由${base.name}升级或转化`;
 else if(item.inStore===true&&item.gold?.purchasable===true)label='商店资料标为可购买';
 else if(item.inStore===false||item.gold?.purchasable===false)label='商店资料标为不可直接购买';
 else label='购买状态未收录';
 const restrictions=[item.requiredChampion?`限${heroName(data,item.requiredChampion)}`:'',item.requiredAlly?`需要队友：${heroName(data,item.requiredAlly)}`:''].filter(Boolean);
 return [label,...restrictions].join(' · ');
}
function relation(data,ids,mode,label,region){
 if(!Array.isArray(ids)||!ids.length)return '';
 const rows=ids.map(id=>{
  const item=itemFor(data,id),name=item?.name||`未收录 #${id}`;
  return item&&available(item,mode)?`<button type="button" class="item-reference-related" data-action="reference-item" data-id="${e(id)}">${asset('item',id,name)}<span>${e(name)}</span></button>`:`<span class="item-reference-unavailable">${e(name)}</span>`;
 });
 return `<section class="item-reference-relation" data-item-region="${region}"><h3>${label}</h3><div>${rows.join('')}</div></section>`;
}
export function referenceItemTiles(data,{query='',mode='rift',id=''}={}){
 const needle=String(query).trim().toLocaleLowerCase(),items=Object.entries(data.items||{}).filter(([key,item])=>validId(key)&&available(item,mode)&&typeof item.name==='string'&&(!needle||`${item.name} ${key}`.toLocaleLowerCase().includes(needle))).sort((a,b)=>a[1].name.localeCompare(b[1].name,'zh-CN')||Number(a[0])-Number(b[0]));
 return items.map(([key,item])=>`<button type="button" class="item-reference-tile ${String(id)===key?'active':''}" data-action="reference-item" data-id="${e(key)}" aria-pressed="${String(id)===key}">${asset('item',key,item.name)}<span>${e(item.name)}</span></button>`).join('')||'<p class="empty-state">没有匹配的装备。</p>';
}
export function itemReferenceView(data,{query='',mode='rift',id=''}={}){
 mode=mode==='hex'?'hex':'rift';
 const selected=itemFor(data,id),visible=available(selected,mode),count=Object.entries(data.items||{}).filter(([key,item])=>validId(key)&&available(item,mode)&&typeof item.name==='string').length;
 const collected=Number.isFinite(Date.parse(data.fetchedAt||''))?dateLabel(data.fetchedAt):'未知';
 let detail='<p class="item-reference-empty">选择装备查看详情。</p>';
 if(id&&!selected)detail='<p class="item-reference-empty">当前资料未收录这件装备，请重新选择。</p>';
 else if(selected&&!visible)detail=`<p class="item-reference-empty">${e(selected.name)}未列入${modeName(mode)}资料，请重新选择。</p>`;
 else if(selected){
  const tooltip=selected.tooltip,base=itemFor(data,selected.specialRecipe),from=Array.isArray(selected.from)?[...selected.from]:[];
  if(base&&!from.some(value=>String(value)===String(base.id)))from.push(base.id);
  const sources=[sourceLink(data.sources?.items,'ddragon.leagueoflegends.com','Riot 装备资料'),tooltip?.patch===data.patch?sourceLink(tooltip.source,'raw.communitydragon.org','装备详细说明来源'):''].filter(Boolean).join('');
  const stale=!tooltip?.description?'<p class="bottom-note">详细说明暂缺，当前显示基础资料。</p>':tooltip.patch!==data.patch?'<p class="bottom-note">详细说明版本不同，当前显示基础资料。</p>':'';
  detail=`<div class="item-reference-summary" data-item-region="summary">${gameTooltipView(data,'item',String(id),{mode})}</div><p class="item-reference-availability">${e(availability(data,selected,mode))}</p>${stale}${relation(data,from,mode,'合成或转化来源','from')}${relation(data,selected.into,mode,'可合成','into')}${sources?`<details class="ui-disclosure item-reference-sources" data-item-region="sources" data-disclosure-key="item-reference-sources"><summary>资料来源</summary>${sources}</details>`:''}`;
 }
 return `<section class="reference-workspace item-reference" aria-label="装备图鉴" data-item-reference-mode="${mode}" data-item-reference-id="${e(id)}"><div class="item-reference-toolbar"><label class="ranking-search">搜索装备<input type="search" id="item-reference-search" value="${e(query)}" placeholder="名称或 ID" autocomplete="off"></label><div class="segmented" aria-label="装备模式">${[['rift','峡谷'],['hex','海克斯']].map(([value,name])=>`<button type="button" class="segment ${mode===value?'active':''}" data-action="reference-item-mode" data-mode="${value}" aria-pressed="${mode===value}">${name}</button>`).join('')}</div><span class="badge">资料 ${e(data.version||data.patch||'版本未知')} · 采集 ${e(collected)} · ${count} 件</span></div><div class="item-reference-layout"><div class="item-reference-list" id="item-reference-grid" data-scroll-key="item-reference-${mode}" aria-label="装备列表">${referenceItemTiles(data,{query,mode,id})}</div><article class="item-reference-detail" id="item-reference-detail" tabindex="-1" aria-label="装备详情">${detail}</article></div></section>`;
}
