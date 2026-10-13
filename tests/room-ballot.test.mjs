import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {sanitizeShare,proposalKey,sanitizeRoomBallot} from '../src/core/room.mjs';
import {relayWelcome,sanitizeRelayState} from '../src/core/room-relay.mjs';
import {roomBallotBoard} from '../src/core/room-ballot.mjs';
import {createRoomService} from '../services/room.mjs';
const {champions}=JSON.parse(fs.readFileSync(new URL('../data/game.json',import.meta.url)));
const a={lineup:[{role:'mid',champion:'Ahri'},{role:'bottom',champion:'Ashe'},{role:'support',champion:'Braum'}],mode:'rift'};
const b={lineup:[{role:'mid',champion:'Galio'},{role:'bottom',champion:'Jinx'},{role:'support',champion:'Lulu'}],mode:'rift'};
const state=(proposal,vote)=>({lineup:[],pick:null,mode:'rift',ballot:{version:1,proposal,vote}});
test('relay preserves bounded proposal and votes without forwarding arbitrary private data',()=>{
 const raw={kind:'state',v:1,from:'甲',at:1,...state(a,proposalKey(a.lineup)),riotId:'private'};
 const read=JSON.parse(sanitizeRelayState(JSON.stringify(raw),'甲'));
 assert.deepEqual(read.ballot,raw.ballot);assert.equal(read.riotId,undefined);assert.equal(relayWelcome('123456',[]).ballots,1);
 assert.equal(sanitizeRoomBallot({version:1,proposal:{lineup:[...a.lineup,{role:'mid',champion:'Ahri'}]},vote:null}),null);
 assert.equal(sanitizeShare({...raw,ballot:{version:1,proposal:null,vote:'x'.repeat(1000)}}),null);
});
test('one vote per connected member, ties deterministic, actual picks override compatibility',()=>{
 const room={members:[{nick:'甲',self:true,share:state(a,proposalKey(a.lineup))},{nick:'乙',share:state(b,proposalKey(a.lineup))},{nick:'丙',share:state(null,proposalKey(b.lineup))}]};
 let rows=roomBallotBoard(room,[],champions);assert.equal(rows[0].voters.length,2);assert.equal(rows[0].mine,true);
 room.members[1].share.ballot.vote=proposalKey(b.lineup);rows=roomBallotBoard(room,[],champions);assert.equal(rows[0].key,proposalKey(b.lineup));assert.equal(rows[0].voters.length,2);
 const current=[{role:'mid',champion:'Ahri',party:true,clientCellId:1}];rows=roomBallotBoard(room,current,champions);assert.equal(rows[0].key,proposalKey(a.lineup));assert.equal(rows[1].fit.compatible,false);assert.match(rows[0].fit.reason,/不是胜率/);
 room.members.pop();rows=roomBallotBoard(room,current,champions);assert.equal(rows[1].voters.length,1);
});
test('LAN host/guest round trip broadcasts votes and late joiners receive proposals',async()=>{
 const host=createRoomService({nick:'甲',listenHost:'127.0.0.1',discovery:false}),guest=createRoomService({nick:'乙',discovery:false}),late=createRoomService({nick:'丙',discovery:false});
 const until=async fn=>{for(let i=0;i<80;i++){if(fn())return;await new Promise(r=>setTimeout(r,20));}throw Error('room did not converge');};
 try{const h=await host.host();const target={host:'127.0.0.1',port:h.port,room:h.room,pin:h.pin};
  await guest.join(target);assert.equal(guest.snapshot().ballots,true);
  host.publish(state(a,proposalKey(a.lineup)));guest.publish(state(null,proposalKey(a.lineup)));
  await until(()=>roomBallotBoard(host.snapshot(),[],champions)[0]?.voters.length===2);
  await late.join(target);await until(()=>roomBallotBoard(late.snapshot(),[],champions)[0]?.voters.length===2);
 }finally{host.dispose();guest.dispose();late.dispose();}
});
