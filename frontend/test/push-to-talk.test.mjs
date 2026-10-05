import test from 'node:test';
import assert from 'node:assert/strict';
import { PushToTalk } from '../dist/push-to-talk.js';
test('configured push-to-talk key releases even after focus becomes blocked and never latches from text or repeats',()=>{
 const hold=new PushToTalk();hold.configure('KeyV');
 assert.equal(hold.press('KeyV',true,false),false);assert.equal(hold.held,false);
 assert.equal(hold.press('KeyV',false,true),false);
 assert.equal(hold.press('KeyB',false,false),false);
 assert.equal(hold.press('KeyV',false,false),true);assert.equal(hold.held,true);
 assert.equal(hold.release('KeyV'),true);assert.equal(hold.held,false);
 hold.press('KeyV',false,false);hold.reset();assert.equal(hold.held,false);
 hold.press('KeyV',false,false);hold.configure('KeyB');assert.equal(hold.held,false);
 assert.equal(hold.press('KeyB',false,false),true);
});
