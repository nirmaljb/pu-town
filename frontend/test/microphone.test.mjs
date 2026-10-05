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
test('speaking mode and key survive device changes and reload without enabling publication',async()=>{
 let saved=null;const storage={getItem:()=>saved,setItem:(_key,value)=>saved=value};
 const devices={enumerateDevices:async()=>[],getUserMedia:async()=>{throw new Error('No capture expected');}};
 const mic=new MicrophoneSettings(devices,storage);
 await mic.speakingMode('push-to-talk','KeyB');await mic.select('desk');
 const restored=new MicrophoneSettings(devices,storage);
 assert.equal(restored.mode,'push-to-talk');assert.equal(restored.key,'KeyB');assert.equal(restored.deviceId,'desk');assert.equal(restored.testing,false);
});
test('supported noise suppression is remembered without changing device or speaking mode',async()=>{
 let saved=null;const storage={getItem:()=>saved,setItem:(_key,value)=>saved=value};
 const devices={getSupportedConstraints:()=>({noiseSuppression:true}),enumerateDevices:async()=>[{kind:'audioinput',deviceId:'desk'}],getUserMedia:async()=>{throw new Error('No capture expected');}};
 const mic=new MicrophoneSettings(devices,storage);await mic.select('desk');await mic.speakingMode('push-to-talk','KeyB');
 await mic.suppressNoise(false);
 assert.deepEqual(await mic.captureOptions(),{deviceId:{exact:'desk'},noiseSuppression:false});
 const restored=new MicrophoneSettings(devices,storage);
 assert.equal(restored.noiseSuppression,false);assert.equal(restored.mode,'push-to-talk');assert.equal(restored.key,'KeyB');
 const unsupported=new MicrophoneSettings({...devices,getSupportedConstraints:()=>({})},storage);
 assert.equal(unsupported.noiseSuppressionSupported,false);
 assert.deepEqual(await unsupported.captureOptions(),{deviceId:{exact:'desk'}});
});
test('noise suppression reaches isolated capture and an existing test stream without changing its device',async()=>{
 const applied=[];let capture;
 const track={stop(){},applyConstraints:async value=>applied.push(value)};
 const mic=new MicrophoneSettings({getSupportedConstraints:()=>({noiseSuppression:true}),enumerateDevices:async()=>[{kind:'audioinput',deviceId:'desk'}],getUserMedia:async options=>{capture=options;return {getTracks:()=>[track],getAudioTracks:()=>[track]};}},undefined);
 await mic.select('desk');await mic.startTest();
 assert.deepEqual(capture,{audio:{noiseSuppression:true,deviceId:{exact:'desk'}},video:false});
 await mic.suppressNoise(false);assert.deepEqual(applied,[{noiseSuppression:false}]);assert.equal(mic.deviceId,'desk');assert.equal(mic.testing,true);mic.stopTest();
});
