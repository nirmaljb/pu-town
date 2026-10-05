import test from 'node:test';
import assert from 'node:assert/strict';
import { audibleSpeakers, visibleSpeakers } from '../dist/voice-activity.js';
import { emptyWorld } from '../dist/world-state.js';
const world = phase => ({...emptyWorld(), selfPlayerId:'self', voice:{token:'grant',url:'/voice',canPublish:true},
 players:new Map(['self','near','hidden','ghost'].map(id=>[id,{connected:true}])),
 game:{phase,round:1,self:{status:'living'},players:['self','near','hidden','ghost'].map(playerId=>({playerId,status:playerId==='ghost'?'eliminated':'living'}))},
 field:{round:1,players:[{playerId:'self'},{playerId:'near'},{playerId:'ghost',ghost:true}]},
 voicePeers:[{playerId:'near',gain:0.5,token:'peer'}]});
test('Day speaking indicators require both current hearing and a visible living Avatar',()=>{
 const w=world('day'); assert.deepEqual([...visibleSpeakers(w,new Set(['self','near','hidden','ghost']))],['self','near']);
 assert.deepEqual([...visibleSpeakers({...w,voicePeers:[]},new Set(['near']))],[]);
 assert.deepEqual([...visibleSpeakers({...w,field:null},new Set(['near']))],[]);
});
test('Townhall allows living speakers, and transitions, recovery and disconnect clear activity',()=>{
 const w=world('discussion');const ids=new Set(['near','ghost']);
 assert.deepEqual([...visibleSpeakers(w,ids)],['near']);
 for(const phase of ['night','reveal','finished']) assert.equal(visibleSpeakers({...w,game:{...w.game,phase}},ids).size,0);
 assert.equal(visibleSpeakers({...w,voice:null},ids).size,0);
 w.players.set('near',{connected:false});assert.equal(visibleSpeakers(w,ids).size,0);
});

test('ducking activity includes authorized heard speakers beyond Vision but never absent hearing grants',()=>{
 const w=world('day');w.voicePeers.push({playerId:'hidden',gain:0.2,token:'authorized'});
 const active=new Set(['hidden','ghost']);
 assert.deepEqual([...audibleSpeakers(w,active)],['hidden']);
 assert.equal(visibleSpeakers(w,active).size,0);
 assert.equal(audibleSpeakers({...w,voicePeers:[]},active).size,0);
 assert.equal(audibleSpeakers({...w,game:{...w.game,phase:'night'}},active).size,0);
});
