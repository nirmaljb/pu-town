"""Native real-media outage proof. Start with a dedicated local SFU subprocess.
The script owns that child, stops/restarts it, and never controls another process.
"""
import asyncio
import time
import subprocess
from pathlib import Path
from urllib.parse import urlsplit, urlunsplit
import numpy as np
from livekit import rtc
from verify import Player, GAME
from verify_day import walk

async def main():
    root = Path(__file__).resolve().parents[2]
    server = None
    players, rooms, consumers = [], [], []
    tone = None
    try:
        server = subprocess.Popen([str(root / 'tools/voice/start-local.sh')], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        await asyncio.sleep(2)
        assert server.poll() is None, 'Use a dedicated free SFU port; another server is running'
        players = [await Player().connect() for _ in range(4)]
        await players[0].send('create_room', displayName='Outage proof 0')
        snapshot = await players[0].wait('room_snapshot')
        for i, player in enumerate(players[1:], 1):
            await player.send('join_room', roomId=snapshot['roomId'], displayName=f'Outage proof {i}')
            await player.wait('room_snapshot')
        for player in players: await player.send('set_ready', ready=True)
        await players[0].wait('room_state', lambda e: all(p['ready'] for p in e['players']))
        await players[0].send('start_game')
        day = await players[0].wait('game_state', lambda e: e['phase'] == 'day')
        day_deadline = time.monotonic() + day['remainingMs'] / 1000
        for player in players[:2]: await player.wait('field_state')
        await asyncio.gather(walk(players[0],1280,742),walk(players[1],1340,742))
        for player in players[:2]:
            await player.send('join_voice',round=1)
            await player.wait('voice_state',lambda e:e['token'] is not None)
        speaker_id=players[0].latest['room_snapshot']['selfPlayerId']
        await players[1].wait('voice_peers',lambda e:any(p['playerId']==speaker_id for p in e['peers']))
        token=next(p['token'] for p in players[1].latest['voice_peers']['peers'] if p['playerId']==speaker_id)
        parts=urlsplit(GAME);url=urlunsplit((parts.scheme,parts.netloc,'/voice','',''))
        sender,listener=rtc.Room(),rtc.Room();rooms=[sender,listener]
        frames=[0]
        async def consume(track):
            async for event in rtc.AudioStream(track):
                samples=np.frombuffer(event.frame.data,dtype=np.int16)
                if np.max(np.abs(samples.astype(np.int32)),initial=0)>100:frames[0]+=1
        @listener.on('track_subscribed')
        def subscribed(track,publication,participant):consumers.append(asyncio.create_task(consume(track)))
        await sender.connect(url,players[0].latest['voice_state']['token'])
        await listener.connect(url,token)
        source=rtc.AudioSource(48000,1)
        track=rtc.LocalAudioTrack.create_audio_track('Outage tone',source)
        await sender.local_participant.publish_track(track,rtc.TrackPublishOptions(source=rtc.TrackSource.SOURCE_MICROPHONE))
        async def publish():
            wave=(np.sin(np.arange(960)*2*np.pi*1000/48000)*8000).astype(np.int16).tobytes()
            while True:
                await source.capture_frame(rtc.AudioFrame(wave,48000,1,960));await asyncio.sleep(.02)
        tone=asyncio.create_task(publish())
        async def received_after(count):
            while frames[0]<=count:await asyncio.sleep(.1)
        await asyncio.wait_for(received_after(0),15)
        server.kill();await asyncio.to_thread(server.wait,10);server=None
        await asyncio.sleep(2)
        await walk(players[0],1298,742)
        await players[0].send('send_chat',channel='public',text='Game continues through media outage')
        await players[1].wait('chat_message',lambda e:e['text']=='Game continues through media outage',timeout=5)
        assert players[0].latest['field_state']['self']['x']>=1297
        await asyncio.sleep(2)
        assert players[0].latest['game_state']['phase']=='day'
        print('PASS: real SFU outage preserves accepted movement, nearby text, and unchanged round',flush=True)
        before=frames[0]
        server=subprocess.Popen([str(root/'tools/voice/start-local.sh')],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        await asyncio.wait_for(received_after(before),35)
        assert players[0].latest['game_state']['round']==1
        assert listener.isconnected() and sender.isconnected()
        print('PASS: real native media reconnects with current hearing after service restart without rejoining the Game',flush=True)
        await players[0].wait('game_state',lambda e:e['phase']=='night',timeout=max(1,day_deadline-time.monotonic()+2))
        assert abs(time.monotonic()-day_deadline)<2
        print('PASS: the original server Day deadline advances to Night without a media-induced pause',flush=True)
    finally:
        if tone:tone.cancel()
        for consumer in consumers:consumer.cancel()
        for room in rooms:await asyncio.wait_for(room.disconnect(),10)
        for player in players:await player.socket.close()
        if server:
            server.kill();await asyncio.to_thread(server.wait,10)

if __name__=='__main__':asyncio.run(main())
