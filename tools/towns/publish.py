#!/usr/bin/env python3
"""Validate authored towns and publish identical authoritative Java/Unity geometry."""
from __future__ import annotations

import argparse
import hashlib
import heapq
import json
import math
from pathlib import Path
import sys

import author
from export import verify_sources

ROOT=Path(__file__).resolve().parents[2]
GRID=32
FOOT=14
SPEED=225
MAPS=('woodland','market')


def finite(v:object)->bool:
    return isinstance(v,(int,float)) and not isinstance(v,bool) and math.isfinite(v)


def valid_rect(rect:dict,width:float,height:float)->bool:
    return all(finite(rect.get(k)) for k in ('x','y','width','height')) and (
        rect['width']>0 and rect['height']>0 and rect['x']>=0 and rect['y']>=0
        and rect['x']+rect['width']<=width and rect['y']+rect['height']<=height)


class Walkability:
    def __init__(self,data:dict):
        self.data=data;self.cells={};self.cache={}
        for rect in data['obstacles']:
            for iy in range(math.floor((rect['y']-FOOT)/128),math.floor((rect['y']+rect['height']+FOOT)/128)+1):
                for ix in range(math.floor((rect['x']-FOOT)/128),math.floor((rect['x']+rect['width']+FOOT)/128)+1):
                    self.cells.setdefault((ix,iy),[]).append(rect)

    def open(self,x:float,y:float)->bool:
        if not finite(x) or not finite(y) or not (FOOT<=x<=self.data['width']-FOOT and FOOT<=y<=self.data['height']-FOOT):return False
        return all(not(r['x']-FOOT<x<r['x']+r['width']+FOOT and r['y']-FOOT<y<r['y']+r['height']+FOOT)
                   for r in self.cells.get((math.floor(x/128),math.floor(y/128)),[]))

    def segment(self,a:tuple[float,float],b:tuple[float,float])->bool:
        steps=max(1,math.ceil(math.dist(a,b)/4))
        return all(self.open(a[0]+(b[0]-a[0])*i/steps,a[1]+(b[1]-a[1])*i/steps) for i in range(steps+1))


def validate(data:dict)->None:
    if data.get('schemaVersion')!=1 or data.get('mapId') not in MAPS:raise ValueError('Unsupported town schema')
    width,height=data['width'],data['height']
    if not finite(width) or not finite(height) or min(width,height)<=0:raise ValueError('Invalid town bounds')
    if data['coordinates']!=dict(serverUnitsPerUnityUnit=100,unityZSign=1,north='negativeY',groundHeight=0):
        raise ValueError('Town coordinate mapping drifted')
    if data['movement']!=dict(footRadius=14,acceptedSpeed=240,predictedSpeed=225,hearingRange=160,daySeconds=180):
        raise ValueError('Shared movement constants drifted')
    if data['tasksEnabled'] is not False or data['tasks'] or data['interiors']:raise ValueError('Towns must remain outdoor-only with Tasks disabled')
    meeting=data['meeting']
    if data['emergencyButton']!={k:meeting[k] for k in ('x','y')} or meeting['emergencyButton']!=data['emergencyButton']:
        raise ValueError('Meeting Area emergency button drifted')
    if (meeting['radiusX'],meeting['radiusY'])!=(330,205) or len(meeting['seats'])!=10:raise ValueError('Shared retained Seat offsets drifted')
    expected=[dict(seat=n,x=meeting['x']+math.floor(330*math.sin(n*2*math.pi/10)+.5),
        y=meeting['y']+math.floor(-205*math.cos(n*2*math.pi/10)+.5),
        facing='down' if n==0 else 'left' if n<5 else 'up' if n==5 else 'right') for n in range(10)]
    if meeting['seats']!=expected:raise ValueError('Retained Seat position/Facing drifted')
    for collection in ('buildings','obstacles','districts','landmarks'):
        values=data[collection]
        if len({v['id'] for v in values})!=len(values) or any(not valid_rect(v,width,height) for v in values):
            raise ValueError('Invalid or duplicate '+collection)
    solids={o['id']:o for o in data['obstacles'] if o['kind']=='building'}
    if set(solids)!={b['id'] for b in data['buildings']}:raise ValueError('Building/collision identities differ')
    for index,building in enumerate(data['buildings']):
        if min(building['width'],building['height'])<240:raise ValueError('Building too small for modular doors')
        if any(building[k]!=solids[building['id']][k] for k in ('x','y','width','height')):raise ValueError('Artwork/collision footprints differ')
        if any(author.overlaps(building,other,28) for other in data['buildings'][:index]):raise ValueError('Buildings close the walking gap')
    for route in data['routes']:
        if len(route['points'])<2 or not finite(route['width']) or route['width']<=2*FOOT:raise ValueError('Invalid public road')
    raw_path=ROOT/'towns'/data['mapId']/'watabou.json'
    if data['provenance']['rawSha256']!=hashlib.sha256(raw_path.read_bytes()).hexdigest():raise ValueError('Raw geometry hash drifted')


def reachability(data:dict,enforce_target:bool=True)->dict:
    validate(data)
    walk=Walkability(data);meeting=data['meeting'];origin=(meeting['x'],meeting['y'])
    start=(round(origin[0]/GRID)*GRID,round(origin[1]/GRID)*GRID)
    if not walk.segment(origin,start):raise ValueError('Meeting Area has no open walking origin')
    distance={start:math.dist(origin,start)};previous={};queue=[(distance[start],start)]
    neighbors=[(x*GRID,y*GRID) for x,y in [(-1,0),(1,0),(0,-1),(0,1),(-1,-1),(-1,1),(1,-1),(1,1)]]
    while queue:
        length,point=heapq.heappop(queue)
        if length!=distance[point]:continue
        for dx,dy in neighbors:
            other=(point[0]+dx,point[1]+dy);candidate=length+math.hypot(dx,dy)
            if candidate>=distance.get(other,math.inf):continue
            if walk.open(*other) and walk.segment(point,other):
                distance[other]=candidate;previous[other]=point;heapq.heappush(queue,(candidate,other))
    sites=[('seat-'+str(s['seat']),s,False) for s in meeting['seats']]
    sites += [('landmark-'+l['id'],l['entry'],True) for l in data['landmarks']]
    for route in data['routes']:
        for suffix,p in [('start',route['points'][0]),('end',route['points'][-1])]:sites.append((route['id']+'-'+suffix,p,True))
        for a,b in zip(route['points'],route['points'][1:]):
            if not walk.segment((a['x'],a['y']),(b['x'],b['y'])):raise ValueError('Preserved road crosses collision: '+route['id'])
    paths=[]
    for name,site,public in sites:
        target=(site['x'],site['y'])
        if not walk.open(*target):raise ValueError('Blocked public/Seat anchor: '+name)
        nearest=(round(target[0]/GRID)*GRID,round(target[1]/GRID)*GRID)
        if nearest not in distance or not walk.segment(nearest,target):raise ValueError('Unreachable public/Seat anchor: '+name)
        length=distance[nearest]+math.dist(nearest,target)
        cursor=nearest;points=[target]
        while cursor!=start:
            points.append(cursor);cursor=previous[cursor]
        points+=[start,origin]
        path=list(reversed(points));simple=[path[0]]
        # Greedy visibility simplification leaves a reproducible, independently
        # collision-verified public walking route, rather than a Manhattan bound.
        index=0
        while index<len(path)-1:
            next_index=len(path)-1
            while next_index>index+1 and not walk.segment(path[index],path[next_index]):next_index-=1
            simple.append(path[next_index]);index=next_index
        length=sum(math.dist(a,b) for a,b in zip(simple,simple[1:]))
        paths.append(dict(site=name,public=public,distance=round(length,2),predictedTravelSeconds=round(length/SPEED,2),
            points=[dict(x=x,y=y) for x,y in simple]))
    worst=max(p['predictedTravelSeconds'] for p in paths if p['public'])
    if enforce_target and not 15<=worst<=20:raise ValueError(f'Public outward travel target missed: {worst}s')
    return dict(schemaVersion=1,mapId=data['mapId'],grid=GRID,footRadius=FOOT,predictedSpeed=SPEED,
        allSitesReachable=True,sitesChecked=len(paths),solidBuildingsChecked=len(data['buildings']),
        maximumMeetingTravelSeconds=worst,maximumMeetingRoundTripSeconds=round(worst*2,2),routes=paths,
        interpretation='Collision-verified paths from the Meeting Area to all Seats, public landmarks and preserved road endpoints. Outdoor travel at 225 server units/s excludes conversation and pauses; target 15–20 seconds outward.')


def preview(data:dict)->str:
    """Compact vector review of the actual publication, not an asset mockup."""
    width,height=data['width'],data['height'];scale=min(900/width,800/height)
    chunks=[f'<svg xmlns="http://www.w3.org/2000/svg" width="{width*scale:.0f}" height="{height*scale+60:.0f}" viewBox="0 -360 {width} {height+360}">',
        '<style>text{font-family:system-ui,sans-serif;fill:#243b2b}</style>',
        f'<rect x="0" y="0" width="{width}" height="{height}" fill="'+('#b5c985' if data['mapId']=='woodland' else '#d1ca9e')+'"/>',
        f'<text x="90" y="-190" font-size="150">{data["name"]} · actual collision and street plan</text>']
    for d in data['districts']:
        points=' '.join(f'{p["x"]},{p["y"]}' for p in d['points'])
        chunks.append(f'<polygon points="{points}" fill="none" stroke="#5b724a" stroke-opacity=".32" stroke-width="9"/>')
    for r in data['routes']:
        points=' '.join(f'{p["x"]},{p["y"]}' for p in r['points'])
        chunks.append(f'<polyline points="{points}" fill="none" stroke="#bc966a" stroke-width="{r["width"]}" stroke-linejoin="round" stroke-linecap="round"/>')
    for v in data['vegetation']:
        color='#456640' if v['kind'] in ('broadleaf','pine') else '#76875a' if v['kind']!='rock' else '#7f8170'
        radius=80 if v['kind'] in ('broadleaf','pine') else 35
        chunks.append(f'<circle cx="{v["x"]}" cy="{v["y"]}" r="{radius*v["scale"]}" fill="{color}"/>')
    for b in data['buildings']:
        color='#8e6448' if b['variant']=='workshop' else '#b66f50' if b['variant']=='cottage' else '#946d4e'
        chunks.append(f'<rect x="{b["x"]}" y="{b["y"]}" width="{b["width"]}" height="{b["height"]}" fill="{color}" stroke="#4a4935" stroke-width="18"/>')
    m=data['meeting']
    chunks.append(f'<ellipse cx="{m["x"]}" cy="{m["y"]}" rx="405" ry="280" fill="#e3d4a0" stroke="#947b52" stroke-width="14"/>')
    for s in m['seats']:
        chunks.append(f'<circle cx="{s["x"]}" cy="{s["y"]}" r="28" fill="#715442"/>')
    for l in data['landmarks']:
        e=l['entry'];chunks.append(f'<circle cx="{e["x"]}" cy="{e["y"]}" r="24" fill="#276079"/>')
    chunks.append('</svg>')
    return '\n'.join(chunks)+'\n'


def main()->None:
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check',action='store_true',help='Fail on invalid geometry, provenance or stale exports')
    parser.add_argument('--measure',action='store_true',help='Measure without enforcing the final travel target')
    args=parser.parse_args();verify_sources()
    for map_id in MAPS:
        directory=ROOT/'towns'/map_id;data=json.loads((directory/'layout.json').read_text())
        raw=json.loads((directory/'watabou.json').read_text());recipe=json.loads((directory/'recipe.json').read_text())
        if data!=author.author(raw,map_id,recipe):raise ValueError('Authored geometry is not reproducible: '+map_id)
        report=reachability(data,not args.measure)
        outputs=[(ROOT/f'backend/src/main/resources/maps/{map_id}.json',author.encoded(data)),
            (ROOT/f'native/Assets/PUtown/Resources/Towns/{map_id}.json',author.encoded(data)),
            (directory/'reachability.json',author.encoded(report)),(directory/'preview.svg',preview(data))]
        if not args.measure:
            for path,value in outputs:
                if args.check:
                    if not path.is_file() or path.read_text()!=value:raise ValueError('Stale town publication: '+str(path.relative_to(ROOT)))
                else:
                    path.parent.mkdir(parents=True,exist_ok=True);path.write_text(value)
        print(f'{map_id}: {report["solidBuildingsChecked"]} solid buildings, {report["sitesChecked"]} reachable sites; furthest public outward trip {report["maximumMeetingTravelSeconds"]}s')


if __name__=='__main__':
    try:main()
    except (ValueError,KeyError,TypeError) as error:
        print(str(error),file=sys.stderr);sys.exit(1)
