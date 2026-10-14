#!/usr/bin/env python3
"""Fit outdoor modular towns to actual seeded Watabou geometry, deterministically."""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
import random

ROOT = Path(__file__).resolve().parents[2]
CONFIGS = {
    'woodland': dict(name='Woodland Village', scale=60, padding=8, foliageSeed=72014,
                     vegetationCount=150, theme='woodland'),
    'market': dict(name='Market Town', scale=45, padding=8, foliageSeed=72015,
                   vegetationCount=65, theme='market'),
}


def encoded(data: dict) -> str:
    return json.dumps(data, indent=2, ensure_ascii=False, allow_nan=False) + '\n'


def inside(x: float, y: float, polygon: list[dict]) -> bool:
    result = False
    previous = polygon[-1]
    for point in polygon:
        if (point['y'] > y) != (previous['y'] > y) and x < (
                (previous['x'] - point['x']) * (y - point['y']) /
                (previous['y'] - point['y']) + point['x']):
            result = not result
        previous = point
    return result


def bounds(points: list[dict]) -> tuple[float, float, float, float]:
    return (min(p['x'] for p in points), min(p['y'] for p in points),
            max(p['x'] for p in points), max(p['y'] for p in points))


def centre(points: list[dict]) -> tuple[float, float]:
    return (sum(p['x'] for p in points) / len(points),
            sum(p['y'] for p in points) / len(points))


def overlaps(a: dict, b: dict, margin: float = 0) -> bool:
    return (a['x'] - margin < b['x'] + b['width'] and b['x'] - margin < a['x'] + a['width']
            and a['y'] - margin < b['y'] + b['height'] and b['y'] - margin < a['y'] + a['height'])


def point_segment(x: float, y: float, a: dict, b: dict) -> float:
    dx, dy = b['x'] - a['x'], b['y'] - a['y']
    ratio = max(0, min(1, ((x-a['x'])*dx+(y-a['y'])*dy)/(dx*dx+dy*dy))) if dx or dy else 0
    return math.hypot(x-a['x']-ratio*dx, y-a['y']-ratio*dy)


def clip(a: dict, b: dict, box: tuple[float,float,float,float]) -> tuple[dict,dict] | None:
    """Liang–Barsky clipping retains the original road direction and bends."""
    dx, dy = b['x']-a['x'], b['y']-a['y']
    start, end = 0., 1.
    for p,q in [(-dx,a['x']-box[0]),(dx,box[2]-a['x']),
                (-dy,a['y']-box[1]),(dy,box[3]-a['y'])]:
        if p == 0:
            if q < 0: return None
        else:
            r = q / p
            if p < 0: start = max(start,r)
            else: end = min(end,r)
            if start > end: return None
    return (dict(x=a['x']+start*dx,y=a['y']+start*dy),
            dict(x=a['x']+end*dx,y=a['y']+end*dy))


def author(raw: dict, map_id: str, config: dict) -> dict:
    scale = config['scale']
    city = [p for p in raw['patches'] if p['withinCity']]
    x0,y0,x1,y1 = bounds([p for ward in city for p in ward['points']])
    x0-=config['padding']; y0-=config['padding']; x1+=config['padding']; y1+=config['padding']
    width,height = math.ceil((x1-x0)*scale/16)*16,math.ceil((y1-y0)*scale/16)*16
    def point(p: dict) -> dict:
        return dict(x=round((p['x']-x0)*scale,2),y=round((p['y']-y0)*scale,2))
    plaza = raw['patches'][raw['plazaIndex']]
    mx,my = centre([point(p) for p in plaza['points']])
    mx,my = round(mx,2),round(my,2)
    meeting = dict(x=mx,y=my,radiusX=330,radiusY=205,
                   emergencyButton=dict(x=mx,y=my),seats=[])
    for seat in range(10):
        meeting['seats'].append(dict(seat=seat,
            x=mx+math.floor(330*math.sin(seat*2*math.pi/10)+.5),
            y=my+math.floor(-205*math.cos(seat*2*math.pi/10)+.5),
            facing='down' if seat==0 else 'left' if seat<5 else 'up' if seat==5 else 'right'))
    routes=[]
    for index,polyline in enumerate(raw['arteries']):
        lines=[]; current=[]
        for a,b in zip(polyline,polyline[1:]):
            section=clip(point(a),point(b),(100,100,width-100,height-100))
            if section:
                if not current or math.dist((current[-1]['x'],current[-1]['y']),
                                           (section[0]['x'],section[0]['y'])) > .01:
                    if len(current)>1: lines.append(current)
                    current=[section[0]]
                current.append(section[1])
            elif len(current)>1:
                lines.append(current); current=[]
        if len(current)>1: lines.append(current)
        for part,line in enumerate(lines):
            routes.append(dict(id=f'artery-{index}-{part}',name=f'Town road {index+1}',
                width=max(150,round(2*scale,2)),sourceArtery=index,
                points=[{k:round(v,2) for k,v in p.items()} for p in line]))
    districts=[]; buildings=[]; landmarks=[]; furnishings=[]; adaptations=[]
    meeting_clear=dict(x=mx-405,y=my-280,width=810,height=560)
    def road_clear(rect:dict, extra:float=0) -> bool:
        cx,cy=rect['x']+rect['width']/2,rect['y']+rect['height']/2
        # Check the road centreline against an expanded axis-aligned footprint.
        for route in routes:
            expanded=(rect['x']-route['width']/2-extra,rect['y']-route['width']/2-extra,
                      rect['x']+rect['width']+route['width']/2+extra,
                      rect['y']+rect['height']+route['width']/2+extra)
            if any(clip(a,b,expanded) is not None for a,b in zip(route['points'],route['points'][1:])):
                return False
        return True
    for ward in city:
        district_id=f'ward-{ward["index"]}'
        polygon=[point(p) for p in ward['points']]
        wx0,wy0,wx1,wy1=bounds(polygon)
        districts.append(dict(id=district_id,name=ward['label'] or ward['ward'],
            kind=ward['ward'],sourcePatch=ward['index'],points=polygon,
            x=round(wx0,2),y=round(wy0,2),width=round(wx1-wx0,2),height=round(wy1-wy0,2)))
        for index,shape in enumerate(ward['geometry']):
            polygon_shape=[point(p) for p in shape]
            if ward['ward'] in ('Market','Park','Ward'):
                # Markets contain fountain/statue geometry; parks contain groves.
                # These retain their semantic kind and never become solid houses.
                adaptations.append(dict(sourcePatch=ward['index'],sourceGeometry=index,
                    meaning='market-prop' if ward['ward']=='Market' else 'grove'))
                continue
            bx0,by0,bx1,by1=bounds(polygon_shape)
            cx,cy=centre(polygon_shape)
            desired_w=max(240,min(760,(bx1-bx0)*.82))
            desired_h=max(240,min(680,(by1-by0)*.82))
            selected=None
            for factor in (1,.9,.8,.7,.6):
                bw=max(240,math.floor(desired_w*factor/10)*10)
                bh=max(240,math.floor(desired_h*factor/10)*10)
                rect=dict(x=round(cx-bw/2,2),y=round(cy-bh/2,2),width=bw,height=bh)
                corners=[(rect['x']-12,rect['y']-12),(rect['x']+bw+12,rect['y']-12),
                    (rect['x']-12,rect['y']+bh+12),(rect['x']+bw+12,rect['y']+bh+12)]
                if (all(inside(x,y,polygon) for x,y in corners) and not overlaps(rect,meeting_clear,30)
                    and not any(overlaps(rect,b,50) for b in buildings) and road_clear(rect,30)):
                    selected=rect;break
            if selected is None:
                adaptations.append(dict(sourcePatch=ward['index'],sourceGeometry=index,
                    meaning='omitted-small-or-crowded-footprint'))
                continue
            variant='longhouse' if max(selected['width'],selected['height'])/min(selected['width'],selected['height'])>1.45 else (
                'workshop' if ward['ward'] in ('CraftsmenWard','MerchantWard','Cathedral') and index%3==0 else 'cottage')
            buildings.append(dict(id=f'building-{ward["index"]}-{index}',
                name=f'{"Workshop" if variant=="workshop" else "Village house"} {len(buildings)+1}',
                districtId=district_id,sourcePatch=ward['index'],sourceGeometry=index,
                variant=variant,**selected))
    obstacles=[dict(id=b['id'],kind='building',**{k:b[k] for k in ('x','y','width','height')}) for b in buildings]
    obstacles += [dict(id='boundary-'+name,kind='boundary',x=x,y=y,width=w,height=h)
        for name,x,y,w,h in [('north',0,0,width,24),('south',0,height-24,width,24),
                            ('west',0,24,24,height-48),('east',width-24,24,24,height-48)]]
    landmarks.append(dict(id='meeting-square',name='Village Square' if map_id=='woodland' else 'Market Square',
        kind='square',x=round(mx-405,2),y=round(my-280,2),width=810,height=560,entry=dict(x=mx,y=my)))
    for route in routes:
        # The ends of the preserved/clipped Watabou roads are public landmarks.
        endpoint=max(route['points'][0],route['points'][-1],
            key=lambda p:math.hypot(p['x']-mx,p['y']-my))
        landmarks.append(dict(id=route['id']+'-approach',name='Forest Trail' if map_id=='woodland' else 'Town Gate',
            kind='gate',x=round(endpoint['x']-60,2),y=round(endpoint['y']-60,2),width=120,height=120,
            entry=dict(endpoint),sourceArtery=route['sourceArtery']))
    # Author the visible well beside the square, while keeping its marker walkable.
    landmarks.append(dict(id='square-well',name='Village Well' if map_id=='woodland' else 'Market Well',
        kind='well',x=round(mx+440,2),y=round(my+60,2),width=180,height=180,
        entry=dict(x=round(mx+420,2),y=round(my+150,2))))
    obstacles.append(dict(id='square-well',kind='well',x=round(mx+440,2),y=round(my+60,2),width=180,height=180))
    if map_id == 'market':
        for dy in (500, 700, -500, -700, 900):
            for dx in (0, -350, 350, -700, 700):
                row = dict(x=round(mx+dx-260, 2), y=round(my+dy-60, 2), width=520, height=120)
                entry = dict(x=round(mx+dx, 2), y=round(my+dy+140, 2))
                if (row['x'] < 80 or row['y'] < 80 or row['x']+520 > width-80 or row['y']+120 > height-80
                    or overlaps(row, meeting_clear, 60) or any(overlaps(row, b, 70) for b in buildings) or not road_clear(row, 80)
                    or any(b['x']-30 < entry['x'] < b['x']+b['width']+30
                           and b['y']-30 < entry['y'] < b['y']+b['height']+30 for b in buildings)):
                    continue
                landmarks.append(dict(id='market-stalls', name='Market Stalls', kind='market', entry=entry, **row))
                for stall in range(3):
                    table = dict(id=f'market-table-{stall}', kind='market-table',
                                 x=round(row['x']+stall*190, 2), y=round(row['y']+20, 2),
                                 width=130, height=80, heightUnits=75, rotation=0)
                    furnishings.append(table)
                    obstacles.append({k:table[k] for k in ('id','kind','x','y','width','height')})
                break
            else:
                continue
            break
        else:
            raise ValueError('Market Town needs clear outdoor space for its market stalls.')
    rng=random.Random(config['foliageSeed']);vegetation=[]
    for attempt in range(config['vegetationCount']*30):
        if len(vegetation)>=config['vegetationCount']: break
        x,y=rng.uniform(75,width-75),rng.uniform(75,height-75)
        rect=dict(x=x-75,y=y-75,width=150,height=150)
        if overlaps(rect,meeting_clear,130) or any(overlaps(rect,b,80) for b in buildings) or not road_clear(rect,45):
            continue
        if any(math.hypot(x-l['entry']['x'],y-l['entry']['y'])<180 for l in landmarks):continue
        near_edge=min(x,y,width-x,height-y)<450
        kinds=['broadleaf','pine','shrub','flowers','grass','rock'] if map_id=='woodland' else ['broadleaf','shrub','flowers','grass','rock']
        weights=[35,25,15,8,12,5] if map_id=='woodland' else [12,28,18,34,8]
        kind=rng.choices(kinds,weights)[0]
        if kind in ('broadleaf','pine') and not near_edge and rng.random()<.6:
            kind='shrub'
        vegetation.append(dict(id=f'vegetation-{len(vegetation)}',kind=kind,x=round(x,2),y=round(y,2),
            scale=round(rng.uniform(.65,1.15),3),rotation=round(rng.uniform(0,360),2)))
    return dict(schemaVersion=1,mapId=map_id,name=config['name'],width=width,height=height,tileSize=32,
        coordinates=dict(serverUnitsPerUnityUnit=100,unityZSign=1,north='negativeY',groundHeight=0),
        movement=dict(footRadius=14,acceptedSpeed=240,predictedSpeed=225,hearingRange=160,daySeconds=180),
        meeting=meeting,emergencyButton=dict(x=mx,y=my),tasksEnabled=False,tasks=[],interiors=[],
        obstacles=obstacles,buildings=buildings,routes=routes,districts=districts,furnishings=furnishings,
        landmarks=landmarks,vegetation=vegetation,
        provenance=dict(generator=raw['generator'],commit=raw['commit'],seed=raw['seed'],size=raw['size'],
            rawSha256=hashlib.sha256(encoded(raw).encode()).hexdigest(),source='watabou.json',
            authoring=config,transform=dict(scale=scale,sourceOrigin=dict(x=x0,y=y0)),
            adaptations=adaptations,
            interpretation='Original seeded streets and district polygons retained. Exterior modules fit source building centres within their wards; small/crowded footprints are omitted. Outer roads are clipped to compact playable bounds. Market props and park groves are not buildings.'))


def main() -> None:
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check',action='store_true',help='Verify deterministic authored layouts')
    args=parser.parse_args()
    for map_id,default in CONFIGS.items():
        directory=ROOT/'towns'/map_id
        recipe_path=directory/'recipe.json'
        recipe=json.loads(recipe_path.read_text()) if recipe_path.exists() else default
        value=encoded(author(json.loads((directory/'watabou.json').read_text()),map_id,recipe))
        path=directory/'layout.json'
        if args.check:
            if path.read_text()!=value: raise ValueError('Authored layout drifted: '+map_id)
        else:
            recipe_path.write_text(encoded(recipe));path.write_text(value)
        data=json.loads(value)
        print(f'{map_id}: {len(data["buildings"])} fitted buildings, {len(data["routes"])} preserved roads, {data["width"]} × {data["height"]}')


if __name__=='__main__':main()
