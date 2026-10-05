"""Ten-Player full-mesh Day media through public Game/gateway endpoints.
Uses ten publishers and ninety hidden listeners, with per-pair PCM/activity checks.
"""
import asyncio
from urllib.parse import urlsplit, urlunsplit
import numpy as np
from livekit import rtc
from verify import Player, GAME
from verify_day import walk

async def main():
    players, rooms, consumers, tones = [], {}, [], []
    try:
        players = [await Player().connect() for _ in range(10)]
        await players[0].send('create_room',displayName='Capacity 0')
        snapshot=await players[0].wait('room_snapshot')
        for i,player in enumerate(players[1:],1):
            await player.send('join_room',roomId=snapshot['roomId'],displayName=f'Capacity {i}')
            await player.wait('room_snapshot')
        for player in players:await player.send('set_ready',ready=True)
        await players[0].wait('room_state',lambda e:all(p['ready'] for p in e['players']))
        await players[0].send('start_game')
        await players[0].wait('game_state',lambda e:e['phase']=='day')
        for player in players:await player.wait('field_state')
        await asyncio.gather(*(walk(player,1280+i*5,742) for i,player in enumerate(players)))
        for player in players:
            await player.send('join_voice',round=1)
            await player.wait('voice_state',lambda e:e['token'] is not None)
        for player in players:await player.wait('voice_peers',lambda e:len(e['peers'])==9)
        ids=[player.latest['room_snapshot']['selfPlayerId'] for player in players]
        parts=urlsplit(GAME);url=urlunsplit((parts.scheme,parts.netloc,'/voice','',''))
        limit=asyncio.Semaphore(10)
        received=set();activity=set()
        async def connect(key,token,speaker=None):
            room=rtc.Room();rooms[key]=room
            if speaker is not None:
                @room.on('track_subscribed')
                def subscribed(track,publication,participant):
                    assert participant.name==ids[speaker], 'A listener received an unrelated speaker'
                    async def consume():
                        stream=rtc.AudioStream(track)
                        try:
                            async for event in stream:
                                samples=np.frombuffer(event.frame.data,dtype=np.int16)
                                if np.max(np.abs(samples.astype(np.int32)),initial=0)>100:
                                    received.add(key); return
                        finally: await stream.aclose()
                    consumers.append(asyncio.create_task(consume()))
                @room.on('active_speakers_changed')
                def speaking(participants):
                    for participant in participants:
                        assert participant.name==ids[speaker], 'Unrelated speaker activity leaked'
                        activity.add(key)
            async with limit:await asyncio.wait_for(room.connect(url,token),30)
        await asyncio.gather(*(connect(('publish',i),p.latest['voice_state']['token']) for i,p in enumerate(players)))
        connections=[]
        for listener,player in enumerate(players):
            for peer in player.latest['voice_peers']['peers']:
                speaker=ids.index(peer['playerId']);assert peer['gain']==1
                connections.append(connect((listener,speaker),peer['token'],speaker))
        await asyncio.gather(*connections)
        print("SETUP: 100 media connections established before tone capture",flush=True)
        sources=[]
        async def publish_track(i):
            source=rtc.AudioSource(48000,1); sources.append((i,source))
            track=rtc.LocalAudioTrack.create_audio_track(f'Capacity tone {i}',source)
            await rooms[('publish',i)].local_participant.publish_track(track,rtc.TrackPublishOptions(source=rtc.TrackSource.SOURCE_MICROPHONE))
        await asyncio.wait_for(asyncio.gather(*(publish_track(i) for i in range(10))),30)
        print("SETUP: all ten microphones published before audio capture",flush=True)
        for i,source in sources:
            async def publish(audio=source,frequency=700+i*100):
                wave=(np.sin(np.arange(960)*2*np.pi*frequency/48000)*8000).astype(np.int16).tobytes()
                while True:
                    await audio.capture_frame(rtc.AudioFrame(wave,48000,1,960));await asyncio.sleep(.02)
            tones.append(asyncio.create_task(publish()))
        async def complete():
            while len(received)<90 or len(activity)<90:await asyncio.sleep(.1)
        await asyncio.wait_for(complete(),20)
        assert len(rooms)==100
        assert all(not rooms[('publish',i)].remote_participants for i in range(10))
        print('PASS: ten Game Players, 100 simultaneous media connections, all 90 authorized PCM and speaker-activity pairs, hidden listeners',flush=True)
        retired=[room for key,room in rooms.items() if key[0]!='publish' and (key[0]==9 or key[1]==9)]
        await walk(players[9],1510,742)
        for i,player in enumerate(players):
            await player.wait('voice_peers',lambda e,i=i:len(e['peers'])==(0 if i==9 else 8),timeout=5)
        async def removed():
            while any(room.isconnected() for room in retired):await asyncio.sleep(.1)
        await asyncio.wait_for(removed(),15)
        assert all(rooms[(i,j)].isconnected() for i in range(9) for j in range(9) if i!=j)
        print('PASS: movement retires all 18 obsolete directed hearing sessions while 72 authorized sessions remain connected',flush=True)
    finally:
        for tone in tones:tone.cancel()
        for consumer in consumers:consumer.cancel()
        await asyncio.gather(*tones, *consumers, return_exceptions=True)
        await asyncio.gather(*(room.disconnect() for room in rooms.values()),return_exceptions=True)
        for player in players:await player.socket.close()

if __name__=='__main__':asyncio.run(main())
