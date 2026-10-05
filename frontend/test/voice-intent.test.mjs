import test from 'node:test';
import assert from 'node:assert/strict';
import { VoiceIntent } from '../dist/voice-intent.js';
test('refresh retains only opted-in voice intent for the recovering Room, never credentials or capture',()=>{
 let saved=null;const storage={getItem:()=>saved,setItem:(_key,value)=>saved=value,removeItem:()=>saved=null};
 const intent=new VoiceIntent(storage,'ROOM',false);assert.equal(intent.wanted,false);
 intent.remember('ROOM',true);assert.equal(saved,'ROOM');
 assert.equal(new VoiceIntent(storage,'ROOM',true).wanted,true);
 assert.equal(new VoiceIntent(storage,'OTHER',true).wanted,false);
 assert.equal(new VoiceIntent(storage,'ROOM',false).wanted,false);
 intent.remember('ROOM',false);assert.equal(saved,null);assert.equal(new VoiceIntent(storage,'ROOM',true).wanted,false);
});
