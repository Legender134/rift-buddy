import {roomBallotBoard} from './core/room-ballot.mjs';
import {escape as e,portrait,button} from './ui.mjs';
export function roomBallotView(room,slots,champions){
 if(!room||room.mode==='idle')return '';
 const board=roomBallotBoard(room,slots,champions);
 if(!room.ballots)return '<details class="ballot-support"><summary>房间候选投票</summary><p>此中继尚未支持投票，阵容分享仍可使用。中继维护者升级后重新连接即可开启。</p></details>';
 return `<section class="room-ballot-board" aria-label="阵容投票"><header><h3>队友候选</h3><small>每人一票</small></header>${board.length?board.map((r,index)=>`<article class="room-ballot-row ${r.fit.compatible?'':'conflict'}"><div class="ballot-row-top"><b>${index+1}</b><div class="ballot-heroes">${r.proposal.lineup.filter(s=>s.champion).map(s=>{const c=champions.find(c=>c.id===s.champion);return c?portrait(c,'sm'):e(s.champion);}).join('')}</div><span title="${e(r.fit.reason)}">契合 ${r.fit.score}</span></div><div class="ballot-row-actions"><small title="${e(r.proposers.join('、'))}">${e(r.proposers[0])}提议${r.fit.compatible?r.fit.exact?'':' · 英雄吻合，位置不同':' · 已选英雄有冲突'}</small>${button('room-vote',`${r.mine?'已投':'投票'} ${r.voters.length}`,'',r.mine?'small active':'small',`data-key="${e(r.key)}" aria-pressed="${r.mine}" title="${e(r.voters.join('、')||'暂无投票')}"`)}${button('room-adopt-ballot','采用','','primary small',`data-key="${e(r.key)}"`)}</div></article>`).join(''):'<p>在组合候选中点“提议”，邀请队友投票。</p>'}</section>`;
}
