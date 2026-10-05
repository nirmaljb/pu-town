import test from 'node:test';
import assert from 'node:assert/strict';
import { AudioMixer } from '../dist/audio-mixer.js';
test('voice ducking preserves independent saved volumes and restores edits made while ducked',()=>{
 const stored=[];globalThis.localStorage={getItem:()=>null,setItem:(_key,value)=>stored.push(JSON.parse(value))};
 globalThis.AudioContext=class {currentTime=1;destination={};createGain(){return {connect(){},gain:{value:0,setValueAtTime(value){this.value=value;},setTargetAtTime(value){this.value=value;}}};} close(){return Promise.resolve();}};
 const mixer=new AudioMixer();mixer.setVolume('effects',80);mixer.setVolume('ambience',60);mixer.setVolume('voice',50);mixer.setVolume('master',40);
 const effects=mixer.channel('effects'),ambience=mixer.channel('ambience'),voice=mixer.channel('voice');
 mixer.voiceActive(true);assert.equal(effects.gain.value,0.2);assert.equal(ambience.gain.value,0.15);assert.equal(voice.gain.value,0.5);
 assert.equal(mixer.volume('effects'),80);mixer.setVolume('effects',40);assert.equal(effects.gain.value,0.1);
 assert.equal(stored.at(-1).effects,40);mixer.voiceActive(false);assert.equal(effects.gain.value,0.4);assert.equal(ambience.gain.value,0.6);
 assert.equal(mixer.volume('master'),40);mixer.destroy();
});
