import test from 'node:test';
import assert from 'node:assert/strict';
import { VoiceRetry } from '../dist/voice-retry.js';
test('media retries independently with bounded backoff and canceling intent prevents late reconnect',()=>{
 const queued=[];let attempts=0;
 const retry=new VoiceRetry(()=>attempts++,(callback,delay)=>{const entry={callback,delay,canceled:false};queued.push(entry);return ()=>entry.canceled=true;});
 retry.start();retry.start();assert.equal(queued.length,1);
 for(let i=0;i<6;i++){queued[i].callback();}
 assert.equal(attempts,6);assert.deepEqual(queued.map(e=>e.delay),[500,1000,2000,4000,5000,5000,5000]);
 retry.stop();assert.equal(queued.at(-1).canceled,true);queued.at(-1).callback();assert.equal(attempts,6);
 retry.start();assert.equal(queued.at(-1).delay,500);
});
