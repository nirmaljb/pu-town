#!/usr/bin/env python3
"""Publish one authored campus definition to matching Java and Unity geometry."""
from __future__ import annotations

import argparse
from collections import deque
import json
import math
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'campus/layout.json'
EXPORTS = (
    ROOT / 'backend/src/main/resources/maps/campus.json',
    ROOT / 'native/Assets/PUtown/Resources/Campus/campus.json',
)
REPORT = ROOT / 'campus/reachability.json'
FOOT_RADIUS = 14
SPEED = 240
PREDICTED_SPEED = 225
DAY_SECONDS = 180
GRID = 16


def rectangle(id_: str, kind: str, x: float, y: float, width: float, height: float) -> dict:
    return dict(id=id_, kind=kind, x=x, y=y, width=width, height=height)


def finite(value: object) -> bool:
    return isinstance(value, (float, int)) and not isinstance(value, bool) and math.isfinite(value)


def valid_rect(rect: dict, width: float, height: float) -> bool:
    return all(finite(rect.get(k)) for k in ('x', 'y', 'width', 'height')) and (
        rect['width'] > 0 and rect['height'] > 0 and rect['x'] >= 0 and rect['y'] >= 0
        and rect['x'] + rect['width'] <= width and rect['y'] + rect['height'] <= height)


def publish(source: dict) -> dict:
    if source.get('schemaVersion') != 1 or source.get('mapId') != 'campus':
        raise ValueError('Expected campus layout schema 1')
    width, height = source['width'], source['height']
    if not finite(width) or not finite(height) or width <= 0 or height <= 0:
        raise ValueError('Invalid campus bounds')
    if source['coordinates'] != dict(serverUnitsPerUnityUnit=100, unityZSign=1,
                                    north='negativeY', groundHeight=0):
        raise ValueError('Campus must preserve its documented coordinate conversion')
    result = json.loads(json.dumps(source))
    result['emergencyButton'] = {k: source['meeting'][k] for k in ('x', 'y')}
    result['movement'] = dict(footRadius=FOOT_RADIUS, acceptedSpeed=SPEED,
                              predictedSpeed=PREDICTED_SPEED, hearingRange=160, daySeconds=DAY_SECONDS)
    obstacles = [rectangle('boundary-'+side, 'boundary', x, y, w, h) for side,x,y,w,h in (
        ('north',0,0,width,24),('south',0,height-24,width,24),
        ('west',0,24,24,height-48),('east',width-24,24,24,height-48))]
    interiors = []
    identifiers: set[str] = set()
    for building in source['buildings']:
        if building['id'] in identifiers or not valid_rect(building, width, height):
            raise ValueError('Duplicate or invalid building: '+building['id'])
        identifiers.add(building['id'])
        x,y,w,h = (building[k] for k in ('x','y','width','height'))
        wall = building['wallWidth']
        if not finite(wall) or wall < 1 or wall * 2 >= min(w,h):
            raise ValueError('Invalid wall width: '+building['id'])
        doors = []
        gaps = {side: [] for side in ('north','south','west','east')}
        for number,door in enumerate(building['doors']):
            side = door['side']
            offset, gap = door['offset'], door['width']
            length = w if side in ('north','south') else h
            if side not in gaps or not finite(offset) or not finite(gap) or gap <= FOOT_RADIUS*2:
                raise ValueError('Invalid doorway: '+building['id'])
            start,end = offset-gap/2,offset+gap/2
            if start < wall or end > length-wall:
                raise ValueError('Doorway overlaps a corner: '+building['id'])
            gaps[side].append((start,end))
            if side in ('north','south'):
                cy = y if side == 'north' else y+h
                door_rect = rectangle(building['id']+'-door-'+str(number),'door',x+start,
                                      cy if side == 'north' else cy-wall,gap,wall)
                door_rect['outside'] = dict(x=x+offset,y=cy+(-48 if side=='north' else 48))
                door_rect['inside'] = dict(x=x+offset,y=cy+(64 if side=='north' else -64))
            else:
                cx = x if side == 'west' else x+w
                door_rect = rectangle(building['id']+'-door-'+str(number),'door',
                                      cx if side == 'west' else cx-wall,y+start,wall,gap)
                door_rect['outside'] = dict(x=cx+(-48 if side=='west' else 48),y=y+offset)
                door_rect['inside'] = dict(x=cx+(64 if side=='west' else -64),y=y+offset)
            door_rect['side'] = side
            doors.append(door_rect)
        if not doors:
            raise ValueError('Interior has no doorway: '+building['id'])
        for side in gaps:
            length = w if side in ('north','south') else h
            cursor = 0
            for part,(start,end) in enumerate(sorted(gaps[side])+[(length,length)]):
                if start < cursor:
                    raise ValueError('Overlapping doorways: '+building['id'])
                if start > cursor:
                    if side in ('north','south'):
                        rect = rectangle(building['id']+'-'+side+'-'+str(part),'wall',x+cursor,
                                         y if side=='north' else y+h-wall,start-cursor,wall)
                    else:
                        rect = rectangle(building['id']+'-'+side+'-'+str(part),'wall',
                                         x if side=='west' else x+w-wall,y+cursor,wall,start-cursor)
                    rect['interiorId'] = building['interiorId']
                    obstacles.append(rect)
                cursor = end
        interiors.append(dict(id=building['interiorId'],name=building['name'],
                              x=x,y=y,width=w,height=h,doors=doors))
    for index,a in enumerate(interiors):
        for b in interiors[:index]:
            if max(a['x'],b['x']) < min(a['x']+a['width'],b['x']+b['width']) and (
                    max(a['y'],b['y']) < min(a['y']+a['height'],b['y']+b['height'])):
                raise ValueError('Interior areas overlap')
    for furnishing in source['furnishings']:
        interior = next((i for i in interiors if i['id'] == furnishing['interiorId']),None)
        if interior is None or not valid_rect(furnishing,width,height) or not (
            furnishing['x'] >= interior['x'] and furnishing['y'] >= interior['y']
            and furnishing['x']+furnishing['width'] <= interior['x']+interior['width']
            and furnishing['y']+furnishing['height'] <= interior['y']+interior['height']):
            raise ValueError('Furnishing outside its interior: '+furnishing['id'])
        obstacle = {k:v for k,v in furnishing.items() if k != 'heightUnits'}
        obstacle['furnishingKind'] = furnishing['kind']
        obstacle['kind'] = 'furniture'
        obstacles.append(obstacle)
    obstacles.extend(source['landscapeObstacles'])
    if any(not valid_rect(o,width,height) for o in obstacles):
        raise ValueError('Invalid obstacle geometry')
    if len({i['id'] for i in interiors}) != len(interiors):
        raise ValueError('Duplicate interior identity')
    result['interiors'], result['obstacles'] = interiors,obstacles
    meeting = result['meeting']
    if meeting['radiusX'] != 330 or meeting['radiusY'] != 205:
        raise ValueError('Campus must retain the shared Seat offsets')
    meeting['seats'] = [dict(seat=seat,
        x=meeting['x']+math.floor(330*math.sin(seat*2*math.pi/10)+.5),
        y=meeting['y']+math.floor(-205*math.cos(seat*2*math.pi/10)+.5),
        facing='down' if seat==0 else 'left' if seat<5 else 'up' if seat==5 else 'right')
        for seat in range(10)]
    return result


class Walkability:
    """Authoring checker with the same open rectangle edges and Avatar feet radius."""
    def __init__(self, data: dict):
        self.data = data
        self.cells: dict[tuple[int,int],list[dict]] = {}
        for rect in data['obstacles']:
            for iy in range(math.floor((rect['y']-FOOT_RADIUS)/64),
                            math.floor((rect['y']+rect['height']+FOOT_RADIUS)/64)+1):
                for ix in range(math.floor((rect['x']-FOOT_RADIUS)/64),
                                math.floor((rect['x']+rect['width']+FOOT_RADIUS)/64)+1):
                    self.cells.setdefault((ix,iy),[]).append(rect)

    def open(self, x: float, y: float) -> bool:
        if not finite(x) or not finite(y) or not (FOOT_RADIUS <= x <= self.data['width']-FOOT_RADIUS
                                                and FOOT_RADIUS <= y <= self.data['height']-FOOT_RADIUS):
            return False
        return all(not (r['x']-FOOT_RADIUS < x < r['x']+r['width']+FOOT_RADIUS and
                        r['y']-FOOT_RADIUS < y < r['y']+r['height']+FOOT_RADIUS)
                   for r in self.cells.get((math.floor(x/64),math.floor(y/64)),[]))

    def segment(self, a: tuple[float,float], b: tuple[float,float]) -> bool:
        steps = max(1,math.ceil(math.dist(a,b)/4))
        return all(self.open(a[0]+(b[0]-a[0])*i/steps,a[1]+(b[1]-a[1])*i/steps)
                   for i in range(steps+1))


def check_routes(data: dict) -> dict:
    walk = Walkability(data)
    meeting = data['meeting']
    start = (round(meeting['x']/GRID)*GRID,round(meeting['y']/GRID)*GRID)
    if not walk.open(*start):
        raise ValueError('Meeting Area is blocked')
    centre = meeting['x'], meeting['y']
    if not walk.segment(centre,start):
        raise ValueError('Meeting Area has no clear grid entry')
    distance = {start: math.dist(centre,start)}
    previous: dict[tuple[int,int],tuple[int,int]] = {}
    queue = deque([start])
    while queue:
        point = queue.popleft()
        for dx,dy in ((GRID,0),(-GRID,0),(0,GRID),(0,-GRID)):
            other = (point[0]+dx,point[1]+dy)
            if other not in distance and walk.open(*other) and walk.segment(point,other):
                distance[other] = distance[point]+GRID
                previous[other] = point
                queue.append(other)
    sites = [('seat-'+str(s['seat']),s) for s in meeting['seats']]
    sites += [('task-'+t['id'],t) for t in data['tasks']]
    for interior in data['interiors']:
        for door in interior['doors']:
            sites += [(door['id']+'-inside',door['inside']),(door['id']+'-outside',door['outside'])]
            if not walk.segment((door['inside']['x'],door['inside']['y']),
                                (door['outside']['x'],door['outside']['y'])):
                raise ValueError('Doorway has no clear crossing: '+door['id'])
    sites += [('district-'+d['id'],d['entry']) for d in data['districts']]
    routes = []
    for name,site in sites:
        target = site['x'],site['y']
        if not walk.open(*target):
            raise ValueError('Blocked site: '+name)
        nearest = (round(target[0]/GRID)*GRID,round(target[1]/GRID)*GRID)
        if nearest not in distance or not walk.segment(nearest,target):
            raise ValueError('Unreachable site: '+name)
        length = distance[nearest]+math.dist(nearest,target)
        points = [target]
        cursor = nearest
        while cursor != start:
            points.append(cursor)
            cursor = previous[cursor]
        points.append(start)
        if centre != start:
            points.append(centre)
        # Keep the independently verified route: remove only collinear grid points.
        path = list(reversed(points))
        simple = [path[0]]
        for a,b,c in zip(path,path[1:],path[2:]):
            if (b[0]-a[0])*(c[1]-b[1]) != (b[1]-a[1])*(c[0]-b[0]):
                simple.append(b)
        if path[-1] != simple[-1]: simple.append(path[-1])
        routes.append(dict(site=name,distance=round(length,2),
                           predictedTravelSeconds=round(length/PREDICTED_SPEED,2),
                           points=[dict(x=x,y=y) for x,y in simple]))
    for route in data['routes']:
        points = route['points']
        for a,b in zip(points,points[1:]):
            if not walk.segment((a['x'],a['y']),(b['x'],b['y'])):
                raise ValueError('Presentation route crosses collision: '+route['id'])
    worst = max(r['distance'] for r in routes)
    if worst/PREDICTED_SPEED*2 >= DAY_SECONDS:
        raise ValueError('Campus round trip exceeds a Day')
    return dict(schemaVersion=1,mapId='campus',grid=GRID,footRadius=FOOT_RADIUS,
        acceptedSpeed=SPEED,predictedSpeed=PREDICTED_SPEED,daySeconds=DAY_SECONDS,
        allSitesReachable=True,sitesChecked=len(sites),interiorsChecked=len(data['interiors']),
        maximumMeetingTravelSeconds=round(worst/PREDICTED_SPEED,2),
        maximumMeetingRoundTripSeconds=round(2*worst/PREDICTED_SPEED,2),
        routes=routes,
        interpretation='Grid shortest routes from the Meeting Area; walking time excludes Tasks, pauses and conversations. A 180-second Day and all existing Task durations are unchanged.')


def encoded(value: dict) -> str:
    return json.dumps(value,indent=2,ensure_ascii=False)+'\n'


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check',action='store_true',help='Fail on invalid geometry or stale exports')
    args = parser.parse_args()
    data = publish(json.loads(SOURCE.read_text()))
    report = check_routes(data)
    for path,expected in [(p,encoded(data)) for p in EXPORTS]+[(REPORT,encoded(report))]:
        if args.check:
            if not path.is_file() or path.read_text() != expected:
                raise ValueError('Stale campus publication: '+str(path.relative_to(ROOT)))
        else:
            path.parent.mkdir(parents=True,exist_ok=True)
            path.write_text(expected)
    print(f"Campus {'checked' if args.check else 'published'}: {report['sitesChecked']} reachable sites, "
          f"{report['interiorsChecked']} clear interiors; longest Meeting Area round trip "
          f"{report['maximumMeetingRoundTripSeconds']}s of {DAY_SECONDS}s Day")


if __name__ == '__main__':
    try:
        main()
    except (ValueError,KeyError,TypeError) as error:
        print(str(error),file=sys.stderr)
        sys.exit(1)
