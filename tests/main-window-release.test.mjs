import test from 'node:test';
import assert from 'node:assert/strict';
import createRelease from '../electron/main-window-release.cjs';
function controlledClock(t){
 t.mock.timers.enable({apis:['setTimeout']});
 return async ms=>{t.mock.timers.tick(ms);await Promise.resolve();await Promise.resolve();};
}
function fixture(){
 const window={visible:false,destroyed:false,isVisible(){return this.visible;},isDestroyed(){return this.destroyed;}},messages=[];let current=window,allowed=true,busy=false,task=Promise.resolve(),releases=0;
 const release=createRelease({getWindow:()=>current,canRelease:()=>allowed,isBusy:()=>busy,getSaveTask:()=>task,release:target=>{target.destroyed=true;releases++;},diagnostic:message=>messages.push(message),idleMs:15,retryMs:5});
 return {window,release,messages,setCurrent:value=>current=value,setAllowed:value=>allowed=value,setBusy:value=>busy=value,setTask:value=>task=value,releases:()=>releases};
}
test('game release waits for active operations and the complete persistence barrier',async t=>{
 const tick=controlledClock(t),f=fixture();let finish;f.setBusy(true);f.setTask(new Promise(resolve=>finish=resolve));f.release.request(f.window);await tick(15);assert.equal(f.releases(),0);f.setBusy(false);await tick(5);assert.equal(f.releases(),0);finish();await tick(0);assert.equal(f.releases(),1);f.release.cancel();
});
test('explicit reopening, foreground visibility or leaving the game cancels automatic release',async t=>{
 const tick=controlledClock(t);for(const change of [f=>f.release.cancel(),f=>{f.window.visible=true;},f=>f.setAllowed(false)]){const f=fixture();f.release.request(f.window);change(f);await tick(15);assert.equal(f.releases(),0);f.release.cancel();}
});
test('a newer save must settle and main IPC activity restarts the quiet period',async t=>{
 const tick=controlledClock(t),f=fixture();let finishFirst,finishNext;f.setTask(new Promise(resolve=>finishFirst=resolve));f.release.request(f.window);await tick(15);f.setTask(new Promise(resolve=>finishNext=resolve));finishFirst();await tick(0);await tick(15);assert.equal(f.releases(),0);finishNext();f.release.activity(f.window);await tick(14);assert.equal(f.releases(),0);await tick(1);assert.equal(f.releases(),1);f.release.cancel();
});
test('a failed save or replaced window is retained without destroying a newer renderer',async t=>{
 const tick=controlledClock(t),f=fixture();let fail;f.setTask(new Promise((_resolve,reject)=>fail=reject));f.release.request(f.window);await tick(15);fail(Error('disk unavailable'));await tick(0);assert.equal(f.releases(),0);assert.match(f.messages[0],/failed save/);f.release.cancel();
 const g=fixture();g.release.request(g.window);g.setCurrent({});await tick(15);assert.equal(g.releases(),0);g.release.cancel();
});
