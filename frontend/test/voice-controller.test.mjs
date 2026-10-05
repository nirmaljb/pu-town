import test from 'node:test';
import assert from 'node:assert/strict';
import { VoiceController } from '../dist/voice-controller.js';
import { MicrophoneSettings } from '../dist/microphone-settings.js';
import { emptyWorld } from '../dist/world-state.js';
test('a late voice grant after Leave cannot initiate media or restore canceled intent',async()=>{
 const elements=[];
 class Element extends EventTarget {textContent='';setAttribute(){}append(){}remove(){}}
 globalThis.window=new EventTarget();
 globalThis.document=Object.assign(new EventTarget(),{body:{append(){}},createElement(){const element=new Element();elements.push(element);return element;},querySelector:()=>null,activeElement:null});
 let joins=0,leaves=0,media=0;
 const client={state:{status:'playing'},joinVoice(){joins++;},leaveVoice(){leaves++;}};
 const mixer={context:{resume:async()=>{}},voiceActive(){},volume:()=>100,channel(){media++;throw new Error('Canceled media must not start');}};
 const microphone=new MicrophoneSettings({enumerateDevices:async()=>[],getUserMedia:async()=>{throw new Error('No capture');}},undefined);
 const controller=new VoiceController(client,mixer,'ws://localhost:8080/ws/game',microphone);
 controller.render({...emptyWorld(),game:{phase:'day',round:1,self:{status:'living'},players:[]}});
 elements.find(e=>e.textContent==='Join voice').dispatchEvent(new Event('click'));
 elements.find(e=>e.textContent==='Leave voice').dispatchEvent(new Event('click'));
 client.onVoiceState({url:'/voice',token:'late-grant',canPublish:true});
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(joins,1);assert.equal(media,0);assert.equal(leaves,2);
 controller.destroy();
});
