import test from 'node:test';
import assert from 'node:assert/strict';
import { MicrophoneSettings } from '../dist/microphone-settings.js';
test('local microphone testing never publishes, stops capture, and falls back from unavailable remembered device',async()=>{
 let stopped=0; const calls=[];const changes=[];
 const devices={enumerateDevices:async()=>[{kind:'audioinput',deviceId:'present',label:'Desk microphone'}],
 getUserMedia:async constraints=>{calls.push(constraints);return {getTracks:()=>[{stop:()=>stopped++}]};}};
 const storage={getItem:()=>JSON.stringify({deviceId:'missing'}),setItem(){}};
 const mic=new MicrophoneSettings(devices,storage);mic.subscribe(()=>changes.push(mic.testing));
 assert.equal((await mic.captureOptions()).deviceId,undefined);
 assert.match(mic.status,/unavailable/);
 await mic.startTest();assert.equal(mic.testing,true);assert.equal(calls.length,1);
 assert.deepEqual(calls[0],{audio:{},video:false});
 mic.stopTest();assert.equal(mic.testing,false);assert.equal(stopped,1);
 assert.deepEqual(changes,[true,false]);
});
test('private testing waits for publication suspension and cancels an outstanding permission request',async()=>{
 let release;let capture;let stopped=0;let requested=false;
 const mic=new MicrophoneSettings({enumerateDevices:async()=>[],getUserMedia:async()=>{requested=true;return new Promise(resolve=>capture=resolve);}},undefined);
 mic.subscribe(()=>mic.testing?new Promise(resolve=>release=resolve):undefined);
 const pending=mic.startTest();assert.equal(requested,false);
 release();await new Promise(resolve=>setImmediate(resolve));assert.equal(requested,true);
 mic.stopTest();capture({getTracks:()=>[{stop:()=>stopped++}]});
 assert.equal(await pending,null);assert.equal(stopped,1);assert.equal(mic.testing,false);
});
test('permission denial leaves local testing off and play independent',async()=>{
 const mic=new MicrophoneSettings({enumerateDevices:async()=>[],getUserMedia:async()=>{throw new Error('NotAllowedError');}},undefined);
 assert.equal(await mic.startTest(),null);assert.equal(mic.testing,false);assert.match(mic.status,/permission denied/);
});
test('canceling while publication is suspending never starts a new capture request',async()=>{
 let release;let requests=0;
 const mic=new MicrophoneSettings({enumerateDevices:async()=>[],getUserMedia:async()=>{requests++;return {getTracks:()=>[]};}},undefined);
 mic.subscribe(()=>mic.testing?new Promise(resolve=>release=resolve):undefined);
 const pending=mic.startTest();mic.stopTest();release();
 assert.equal(await pending,null);assert.equal(requests,0);
});
