"""Copy the selected village and regenerate both authoritative geometry copies.
Run generate.py first, then this script from any directory. No network needed.
"""
from pathlib import Path
import json, re, shutil
ROOT=Path(__file__).resolve().parent
REPO=ROOT.parent.parent
c=json.loads((ROOT/'village/collision.json').read_text())
m=json.loads((ROOT/'village/map.json').read_text())
rooms=[o for l in m['layers'] if l['name']=='zones' for o in l['objects'] if o.get('type')=='room']
served=REPO/'frontend/public/maps/pu-town'
for source,target in [('map.json','pu-town.json'),('collision.json','pu-town.collision.json'),('tiles.png','tiles.png')]:shutil.copyfile(ROOT/'village'/source,served/target)
shutil.copyfile(ROOT/'assets/tiny-town/License.txt',served/'License.txt')
shutil.copytree(ROOT/'village/supplied',served/'supplied',dirs_exist_ok=True)
shutil.copyfile(ROOT/'assets/sources.json',served/'sources.json')
p=REPO/'frontend/src/room-rules.ts';s=p.read_text()
for name,value in [('WORLD_WIDTH',c['width']),('WORLD_HEIGHT',c['height']),('BUTTON_X',c['emergencyButton']['x']),('BUTTON_Y',c['emergencyButton']['y'])]:s=re.sub(r'(export const '+name+r' = )[\d_]+;',r'\g<1>'+str(value)+';',s)
s=re.sub(r'export const INTERIORS = \[.*?\] as const;', 'export const INTERIORS = '+json.dumps([{k:o[k] for k in ['name','x','y','width','height']} for o in rooms],indent=2)+' as const;',s,flags=re.S)
obstacles='export const OBSTACLES: readonly Obstacle[] = [\n'+',\n'.join('  '+', '.join('{ '+', '.join(f'{k}: {v}' for k,v in o.items())+' }' for o in c['obstacles'][i:i+4]) for i in range(0,len(c['obstacles']),4))+'\n];'
s=re.sub(r'export const OBSTACLES: readonly Obstacle\[\] = \[.*?\n\];',lambda _:obstacles,s,flags=re.S);p.write_text(s)
p=REPO/'backend/src/main/java/dev/lpa/pu_go/room/RoomRules.java';s=p.read_text()
for name,value in [('WIDTH',c['width']),('HEIGHT',c['height']),('BUTTON_X',c['emergencyButton']['x']),('BUTTON_Y',c['emergencyButton']['y'])]:s=re.sub(r'(public static final double '+name+r' = )[\d_]+;',r'\g<1>'+str(value)+';',s)
rs=',\n            '.join('new Interior("'+o['name']+'", '+', '.join(str(o[k]) for k in ['x','y','width','height'])+')' for o in rooms)
s=re.sub(r'public static final List<Interior> INTERIORS = List.of\(.*?\);','public static final List<Interior> INTERIORS = List.of(\n            '+rs+');',s,flags=re.S)
chunks=[c['obstacles'][i:i+150] for i in range(0,len(c['obstacles']),150)]
new='public static final List<Obstacle> OBSTACLES = java.util.stream.Stream.of('+', '.join('obstacles'+str(i)+'()' for i in range(len(chunks)))+').flatMap(List::stream).toList();\n\n'
for i,chunk in enumerate(chunks):
 vals=',\n            '.join('new Obstacle('+', '.join(str(o[k]) for k in ['x','y','width','height'])+')' for o in chunk)
 new+='    private static List<Obstacle> obstacles'+str(i)+'() { return List.of(\n            '+vals+'); }\n\n'
a=s.index('public static final List<Obstacle> OBSTACLES =');b=s.index('    // Static map geometry',a);s=s[:a]+new+s[b:];p.write_text(s)
p=REPO/'backend/src/main/java/dev/lpa/pu_go/game/TaskBoard.java';s=p.read_text()
locations=[t for t in c['tasks'] if t['name']!='Town Square'];new='public static final List<Location> LOCATIONS = List.of(\n            '+',\n            '.join('new Location('+json.dumps(t['name'])+', '+str(t['x'])+', '+str(t['y'])+')' for t in locations)+');'
s=re.sub(r'public static final List<Location> LOCATIONS = List.of\(.*?\);',lambda _:new,s,flags=re.S);p.write_text(s)
print('Published village geometry:',c['width'],c['height'],len(c['obstacles']),'rectangles',len(locations),'Task locations')
