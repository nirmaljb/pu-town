"""Reproducible exterior map studies using vendored Kenney CC0 tiles.
Run: python3 pu-town/variants/generate.py (Pillow required).
Exports Tiled JSON, collision metadata, overview and detail previews.
"""
from pathlib import Path
from collections import deque
import json, math, random
from supplied_art import apply as apply_supplied_art
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
W, H, T = 240, 135, 32
FONT = ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf', 20) if Path('/System/Library/Fonts/Supplemental/Arial.ttf').exists() else ImageFont.load_default()
THEMES = {
 'village': dict(title='Sunwater Village', pack='tiny-town', base='#81bd65', path='#debb82', water='#498ba3', accent='#ffdf82', labels=['Orchard & mill','Riverside farm','Market green','Woodland lodge','Harbor & fishery','Workshop lane']),
 'horror': dict(title='Blackthorn Hollow', pack='tiny-dungeon', base='#283b39', path='#635957', water='#243849', accent='#d7a872', labels=['Abandoned abbey','Walled graveyard','Old infirmary','Deadwood cottages','Flooded mill','Quarantine yard']),
 'cyberpunk': dict(title='Neon Ward', pack='roguelike-modern-city', base='#23313e', path='#3b4350', water='#152b40', accent='#63e3e8', labels=['Data exchange','Hydroponics block','Night market','Transit depot','Canal power plant','Repair district']),
}

class Map:
 def __init__(self, theme):
  self.theme=theme; self.cfg=THEMES[theme]; self.rng=random.Random({'village':43,'horror':74,'cyberpunk':95}[theme])
  self.out=ROOT/theme; self.out.mkdir(exist_ok=True)
  source=Image.open(ROOT/'assets'/self.cfg['pack']/'tilemap_packed.png').convert('RGBA')
  self.original=[source.crop((x,y,x+16,y+16)).resize((T,T),Image.Resampling.NEAREST) for y in range(0,source.height,16) for x in range(0,source.width,16)]
  self.tiles=list(self.original); self.custom={}; self.layers={n:[0]*(W*H) for n in ['ground','paths','scenery','buildings','details']};self.block=set();self.tasks=[];self.zones=[];self.buildings=[]
  for name,color in [('ground',self.cfg['base']),('path',self.cfg['path']),('water',self.cfg['water']),('stone','#929e93' if theme=='village' else '#555e69'),('crop','#538655'),('roof','#553951' if theme=='cyberpunk' else '#594747')]:
   im=Image.new('RGBA',(T,T),color);d=ImageDraw.Draw(im)
   for i in range(9):
    x,y=self.rng.randrange(T),self.rng.randrange(T);d.rectangle((x,y,x+1,y),fill=tuple(max(0,c-12) for c in im.getpixel((0,0))[:3]))
   if name=='water':
    d.line((3,9,12,9),fill='#66a3ae' if theme=='village' else '#314957');d.line((19,24,28,24),fill='#66a3ae' if theme=='village' else '#314957')
   if name=='crop':
    for x in [6,16,26]:d.line((x,3,x,29),fill='#ba9b5b');d.rectangle((x-2,8,x+2,12),fill='#9fbb4d')
   self.add(name,im)
  for name,color in [('neon-cyan','#5ce5ed'),('neon-pink','#ee77bb'),('neon-gold','#efbc67')]:
   im=Image.new('RGBA',(T,T),(0,0,0,0));d=ImageDraw.Draw(im);d.rectangle((1,6,30,25),fill='#203443',outline=color,width=2)
   for x in range(5,29,6):d.line((x,10,x,21),fill=color,width=2)
   self.add(name,im)
  im=Image.new('RGBA',(T,T),(0,0,0,0));d=ImageDraw.Draw(im);d.rectangle((13,8,18,31),fill='#615447');d.line((16,16,5,6),fill='#615447',width=3);d.line((16,20,27,10),fill='#615447',width=3);self.add('dead-tree',im)
  im=Image.new('RGBA',(T,T),(0,0,0,0));d=ImageDraw.Draw(im);d.rectangle((8,12,23,28),fill='#88918a');d.rectangle((11,6,20,12),fill='#a3aaa0');d.line((16,10,16,23),fill='#485452',width=2);d.line((12,15,20,15),fill='#485452',width=2);self.add('grave',im)
  im=Image.new('RGBA',(T,T),'#aa8256' if theme!='cyberpunk' else '#657883');d=ImageDraw.Draw(im)
  for y in [3,10,17,24,31]:d.line((0,y,31,y),fill='#705e4c',width=2)
  self.add('bridge',im)
  im=Image.new('RGBA',(T,T),(0,0,0,0));d=ImageDraw.Draw(im);d.rectangle((3,14,28,29),fill='#674531');d.polygon([(1,13),(16,2),(30,13)],fill='#e3b35a');d.rectangle((5,14,26,17),fill='#d2dfab');self.add('stall',im)
  for name,color in [('road-line','#d7b77d'),('rail','#77d4d7')]:
   im=Image.new('RGBA',(T,T),(0,0,0,0));d=ImageDraw.Draw(im);d.rectangle((14,3,17,25),fill=color);self.add(name,im)
  im=Image.new('RGBA',(T,T),(0,0,0,0));d=ImageDraw.Draw(im);d.ellipse((3,3,29,29),fill=self.cfg['accent'],outline='#393e4c',width=3);d.ellipse((10,10,22,22),fill='#425c68');self.add('task',im)
  self.fill('ground',0,0,W,H,self.custom['ground'])
  for x in range(W):self.block.update([(x,0),(x,H-1)])
  for y in range(H):self.block.update([(0,y),(W-1,y)])
 def add(self,name,im):self.tiles.append(im);self.custom[name]=len(self.tiles)
 def put(self,layer,x,y,gid,solid=False):
  if 0<=x<W and 0<=y<H:
   self.layers[layer][y*W+x]=gid
   if solid:self.block.add((x,y))
 def fill(self,layer,x,y,w,h,gid,solid=False):
  for yy in range(y,y+h):
   for xx in range(x,x+w):self.put(layer,xx,yy,gid,solid)
 def path(self,a,b,width=5):
  x,y=a;xx,yy=b
  # Orthogonal route connections keep collision analysis and walking clear.
  self.fill('paths',min(x,xx)-width//2,y-width//2,abs(xx-x)+width,width,self.custom['path'])
  self.fill('paths',xx-width//2,min(y,yy)-width//2,width,abs(yy-y)+width,self.custom['path'])
 def building(self,x,y,w,h,variant=0):
  city=self.theme=='cyberpunk'; village=self.theme=='village'
  if city:
   top=[8,16,24][variant%3];roof=top+5;wall=[227,264,301][variant%3];window=272
  elif village:top=48 if variant%2 else 52;roof=top+1;wall=86 if variant%2 else 90;window=84 if variant%2 else 88
  else:top=4;roof=28;wall=14;window=20
  for yy in range(h):
   for xx in range(w):
    gid=roof+1 if yy<h-2 else wall+1
    if yy==0:gid=top+1
    if yy==h-2 and xx%3==1:gid=window+1
    self.put('buildings',x+xx,y+yy,gid,True)
  self.put('details',x+w//2,y+h-1,(318 if city else 89 if village else 34)+1)
  if city:
   for xx in range(1,w-1,3):self.put('details',x+xx,y+h-2,self.custom['neon-cyan' if variant%2 else 'neon-pink'])
  self.buildings.append((x,y,w,h))
 def zone(self,name,x,y,w,h):self.zones.append(dict(name=name,x=x*T,y=y*T,width=w*T,height=h*T))
 def diagonal(self,a,b,width=4):
  steps=max(abs(b[0]-a[0]),abs(b[1]-a[1]))
  for i in range(steps+1):
   x=round(a[0]+(b[0]-a[0])*i/steps);y=round(a[1]+(b[1]-a[1])*i/steps)
   self.fill('paths',x-width//2,y-width//2,width,width,self.custom['path'])
 def task(self,name,x,y):self.tasks.append(dict(name=name,x=x*T+16,y=y*T+16));self.put('details',x,y,self.custom['task'])
 def layout(self):
  center=(W//2,H//2)
  oldanchors=[(29,19),(123,18),(32,43),(30,71),(126,72),(125,45)]
  if self.theme=='horror':oldanchors=[(27,18),(119,18),(33,43),(26,71),(125,71),(123,46)]
  anchors=[(round(x*1.5),round(y*1.5)) for x,y in oldanchors]
  self.fill('paths',center[0]-16,center[1]-12,33,25,self.custom['stone'])
  loop=[(24,18),(216,18),(216,118),(24,118),(24,18)]
  if self.theme=='horror':loop=[(20,15),(104,15),(104,24),(218,24),(218,116),(144,116),(144,124),(20,124),(20,15)]
  if self.theme=='village':loop=[(26,20),(135,20),(135,15),(216,15),(216,117),(100,117),(100,123),(26,123),(26,20)]
  for a,b in zip(loop,loop[1:]):self.path(a,b,6)
  for a in anchors:self.path(center,a,6)
  for xx in [81,158]:self.path((xx,18),(xx,118),4)
  if self.theme=='village':self.diagonal((26,20),(104,50),4);self.diagonal((136,83),(216,117),4)
  if self.theme=='horror':self.diagonal((51,26),(100,52),3);self.diagonal((144,84),(186,110),3)
  if self.theme=='cyberpunk':
   for yy in [43,93]:self.path((24,yy),(216,yy),5)
   for xx in [60,180]:self.path((xx,18),(xx,118),5)
  riverx=170 if self.theme!='cyberpunk' else 163
  for y in range(2,H-2):
   x=riverx+(round(math.sin(y/15)*3) if self.theme!='cyberpunk' else 0)
   for xx in range(x,x+8):
    if self.layers['paths'][y*W+xx]:self.put('paths',xx,y,self.custom['bridge'])
    else:self.put('ground',xx,y,self.custom['water'],True)
  for i,((cx,cy),name) in enumerate(zip(anchors,self.cfg['labels'])):
   self.zone(name,cx-18,cy-13,36,26);self.task(name,cx,cy)
   self.path((cx,cy),(cx,18 if cy<center[1] else 118),4)
  # Dense districts and smaller buildings create local route variation.
  target=85 if self.theme=='cyberpunk' else 60
  for _ in range(5000):
   if len(self.buildings)>=target:break
   x,y=self.rng.randrange(5,W-15),self.rng.randrange(5,H-12)
   w,h=self.rng.choice([(8,6),(7,6),(9,6),(6,7)])
   if 75<x<163 and 39<y<93:continue
   if any(abs(x-cx)<5 and abs(y-cy)<5 for cx,cy in anchors):continue
   if all((xx,yy) not in self.block and not self.layers['paths'][yy*W+xx] for yy in range(y-1,y+h+2) for xx in range(x-1,x+w+2)):
    self.building(x,y,w,h,self.rng.randrange(3))
  if self.theme=='village':
   for y in range(39,50):
    for x in range(184,207):
     if (x,y) not in self.block and not self.layers['paths'][y*W+x]:self.put('scenery',x,y,self.custom['crop'],True)
  elif self.theme=='horror':
   for y in range(38,50,3):
    for x in range(179,207,3):
     if (x,y) not in self.block and not self.layers['paths'][y*W+x]:self.put('scenery',x,y,self.custom['grave'],True)
   self.building(105,29,23,10,0)
  else:
   for yy in [18,43,67,93,118]:
    for xx in range(26,215,3):
     if (xx,yy) not in self.block:self.put('details',xx,yy,self.custom['neon-cyan'] if yy==67 else 717)
   for x,y,w,h in self.buildings:
    self.put('details',x+2,y+2,549)
    for xx in range(x,x+w):self.put('details',xx,y,self.custom['neon-pink' if x%2 else 'neon-cyan'])
  for _ in range(6800 if self.theme!='cyberpunk' else 1600):
   x,y=self.rng.randrange(3,W-3),self.rng.randrange(3,H-3)
   if self.layers['paths'][y*W+x] or (x,y) in self.block or (74<x<164 and 38<y<94):continue
   if self.theme=='village':
    if not self.layers['paths'][(y-1)*W+x] and (x,y-1) not in self.block:
     top,bottom=self.rng.choice([(4,16),(3,15),(22,23)])
     self.put('scenery',x,y-1,top+1,True);self.put('scenery',x,y,bottom+1,True)
   elif self.theme=='horror':self.put('scenery',x,y,self.custom['dead-tree'],True)
   else:self.put('scenery',x,y,self.rng.choice([486,495,568,604,679,519,524]),True)
  self.square=(3840,2182)
  self.interiors=[]
  if self.theme=='village':self.village_hub()
  self.seats=[dict(seat=i,x=self.square[0]+round(330*math.sin(i*math.pi/5)),y=self.square[1]-round(205*math.cos(i*math.pi/5))) for i in range(10)]
  apply_supplied_art(self)
  self.task('Town Square',self.square[0]//T,self.square[1]//T)
  self.validate()
 def village_hub(self):
  # Preserve the established starting village geometry, translated to the centre.
  # All artwork is rebuilt from the vendored CC0 pack, with four open-top interiors.
  hub=json.loads((ROOT/'village-hub.json').read_text());ox,oy=80,45
  for y in range(45):
   for x in range(80):
    xx,yy=x+ox,y+oy;self.block.discard((xx,yy))
    for layer in self.layers:self.layers[layer][yy*W+xx]=0
    self.put('ground',xx,yy,self.custom['ground'])
    if hub['paths'][y*80+x]:self.put('paths',xx,yy,self.custom['path'])
  for obstacle in hub['obstacles']:
   x,y,w,h=[obstacle[k]//T for k in ['x','y','width','height']]
   coast=x<6 or x+w>76 or y<2 or y+h>44
   if coast:
    self.fill('ground',x+ox,y+oy,w,h,self.custom['water'],True)
   else:
    for yy in range(y,y+h):
     for xx in range(x,x+w):
      self.put('scenery',xx+ox,yy+oy,17,True)
      if yy>0:self.put('details',xx+ox,yy+oy-1,5)
  # Open broad cardinal crossings through the old island boundary.
  for x,y,w,h in [(0,21,7,6),(73,21,7,6),(37,0,6,4),(37,41,6,4)]:
   for yy in range(y+oy,y+oy+h):
    for xx in range(x+ox,x+ox+w):
     self.block.discard((xx,yy));self.put('scenery',xx,yy,0);self.put('paths',xx,yy,self.custom['bridge'])
  # Restore recognizable roof/front combinations on the larger original building footprints.
  for x,y,w,h in [(36,12,8,4),(50,13,6,3),(49,16,5,3)]:
   for yy in range(-1,h):
    for xx in range(w):self.put('details',x+ox+xx,y+oy+yy,0)
   for yy in range(h):
    for xx in range(w):
     self.put('scenery',x+ox+xx,y+oy+yy,54 if yy<h-1 else 87)
  for room in hub['rooms']:
   item={k:room[k] for k in ['name','x','y','width','height']};item['x']+=ox*T;item['y']+=oy*T;item['type']='room';self.interiors.append(item)
   x,y,w,h=[room[k]//T for k in ['x','y','width','height']]
   for yy in range(y,y+h):
    for xx in range(x,x+w):
     self.put('ground',xx+ox,yy+oy,self.custom['stone'])
     self.put('details',xx+ox,yy+oy,0)
     if (xx+ox,yy+oy) in self.block:self.put('scenery',xx+ox,yy+oy,97)
  # Hub destinations retain their original ordering and names; district Tasks follow them.
  district_tasks=self.tasks;self.tasks=[]
  for task in hub['tasks']:
   x,y=task['x']+ox*T,task['y']+oy*T
   area=next((r['name'] for r in self.interiors if r['x']<=x<r['x']+r['width'] and r['y']<=y<r['y']+r['height']), 'Outdoors')
   candidates=[]
   for yy in range(y//T-2,y//T+3):
    for xx in range(x//T-2,x//T+3):
     px,py=xx*T+16,yy*T+16
     candidate_area=next((r['name'] for r in self.interiors if r['x']<=px<r['x']+r['width'] and r['y']<=py<r['y']+r['height']), 'Outdoors')
     if (xx,yy) not in self.block and candidate_area==area:candidates.append((math.hypot(px-x,py-y),xx,yy))
   assert candidates,task
   _,xx,yy=min(candidates);self.task(task['name'],xx,yy)
  self.tasks+=district_tasks
 def validate(self):
  start=(self.square[0]//T,self.square[1]//T);q=deque([start]);seen={start}
  while q:
   x,y=q.popleft()
   for p in [(x-1,y),(x+1,y),(x,y-1),(x,y+1)]:
    if 0<p[0]<W-1 and 0<p[1]<H-1 and p not in self.block and p not in seen:seen.add(p);q.append(p)
  room_centres=[(r['x']//T+r['width']//T//2,r['y']//T+r['height']//T//2) for r in self.interiors]
  targets=[(p['x']//T,p['y']//T) for p in self.tasks+self.seats]+room_centres
  assert all(p in seen for p in targets),(self.theme,'unreachable Task or Seat')
  # Make isolated decorative pockets impassable instead of permitting stranded movement.
  for y in range(H):
   for x in range(W):
    if (x,y) not in seen:self.block.add((x,y))
  for point in self.tasks+self.seats:
   px,py=point['x'],point['y']
   for bx,by in self.block:
    assert not (bx*T-14<px<(bx+1)*T+14 and by*T-14<py<(by+1)*T+14),(self.theme,'blocked destination',point)
  self.report=dict(furnishedInteriors=len(self.interiors),allInteriorsReachable=True,walkableTiles=len(seen),taskDestinations=len(self.tasks),seats=len(self.seats),allDestinationsReachable=True,exactDestinationClearancePixels=14)
 def export(self):
  cols=32;rows=math.ceil(len(self.tiles)/cols);atlas=Image.new('RGBA',(cols*T,rows*T))
  for i,tile in enumerate(self.tiles):atlas.alpha_composite(tile,((i%cols)*T,(i//cols)*T))
  atlas.save(self.out/'tiles.png')
  data=dict(type='map',version='1.10',tiledversion='1.11.2',orientation='orthogonal',renderorder='right-down',width=W,height=H,tilewidth=T,tileheight=T,infinite=False,
   layers=[dict(id=i+1,name=name,type='tilelayer',width=W,height=H,x=0,y=0,opacity=1,visible=True,data=grid) for i,(name,grid) in enumerate(self.layers.items())],
   tilesets=[dict(firstgid=1,name=self.theme,image='tiles.png',imagewidth=atlas.width,imageheight=atlas.height,tilewidth=T,tileheight=T,tilecount=len(self.tiles),columns=cols,margin=0,spacing=0)])
  data['tilesets'] += self.art.sets
  # Merge horizontal collision runs. Every obstacle is on the shared 32px grid.
  obstacles=[];active={}
  for y in range(H):
   x=0
   while x<W:
    if (x,y) not in self.block:x+=1;continue
    a=x
    while x<W and (x,y) in self.block:x+=1
    key=(a,x-a)
    if key in active and active[key]['y']+active[key]['height']==y*T:active[key]['height']+=T
    else:
     obstacle=dict(x=a*T,y=y*T,width=(x-a)*T,height=T);obstacles.append(obstacle);active[key]=obstacle
  def objlayer(name,objects):
   data['layers'].append(dict(id=len(data['layers'])+1,name=name,type='objectgroup',visible=True,opacity=1,x=0,y=0,objects=objects))
  oid=1
  for name,items in [('floor_decor',self.art.floor),('objects',self.art.objects),('collision',obstacles),('points',[dict(name=p['name'],type='task',point=True,x=p['x'],y=p['y'],width=0,height=0) for p in self.tasks]),('zones',self.zones+self.interiors),('spawns',[dict(name='Seat '+str(p['seat']),point=True,x=p['x'],y=p['y'],width=0,height=0) for p in self.seats])]:
   objects=[]
   for item in items:objects.append(dict(id=oid,rotation=0,visible=True,**item));oid+=1
   objlayer(name,objects)
  data['nextlayerid']=len(data['layers'])+1;data['nextobjectid']=oid
  (self.out/'map.json').write_text(json.dumps(data,separators=(',',':'))+'\n')
  collision=dict(world=dict(width=W*T,height=H*T),emergencyButton=dict(x=self.square[0],y=self.square[1]),width=W*T,height=H*T,tileSize=T,footRadius=14,obstacles=obstacles,seats=self.seats,tasks=self.tasks,zones=self.zones+self.interiors,walkableGrid=[''.join('#' if (x,y) in self.block else '.' for x in range(W)) for y in range(H)],validation=self.report)
  (self.out/'collision.json').write_text(json.dumps(collision,indent=2)+'\n')
  canvas=Image.new('RGBA',(W*T,H*T))
  for grid in self.layers.values():
   for i,gid in enumerate(grid):
    if gid:canvas.alpha_composite(self.tiles[gid-1],((i%W)*T,(i//W)*T))
  # Composite full-resolution, y-sorted supplied objects over the tile ground.
  def composite(objects, animated=True):
   for o in objects:
    name=o['name'];ts,im=self.art.cache[name]
    if not animated and ts.get('tiles'):continue
    frame=im.crop((0,0,ts['tilewidth'],ts['tileheight'])).resize((o['width'],o['height']),Image.Resampling.LANCZOS)
    canvas.alpha_composite(frame,(o['x'],o['y']-o['height']))
  composite(self.art.floor,False);composite(self.art.objects,False)
  canvas.convert('RGB').save(self.out/'base-map.png')
  animated_objects=[dict(**o,sheet=next(ts for ts in self.art.sets if ts['firstgid']==o['gid'])) for o in self.art.floor+self.art.objects if self.art.cache[o['name']][0].get('tiles')]
  (self.out/'motion.json').write_text(json.dumps(animated_objects,separators=(',',':'))+'\n')
  composite([o for o in self.art.floor+self.art.objects if self.art.cache[o['name']][0].get('tiles')])
  # Lighting belongs to the preview, not the tilemap or visibility rules.
  if self.theme=='horror':
   shade=Image.new('RGBA',canvas.size,(12,20,34,65));canvas=Image.alpha_composite(canvas,shade)
  elif self.theme=='cyberpunk':
   shade=Image.new('RGBA',canvas.size,(9,12,31,45));canvas=Image.alpha_composite(canvas,shade)
  if self.theme!='village':
   lights=Image.new('RGBA',canvas.size);ld=ImageDraw.Draw(lights)
   locations=[(p['x'],p['y']) for p in self.tasks]
   if self.theme=='cyberpunk':locations += [(x*T+w*T//2,(y+h)*T) for x,y,w,h in self.buildings]
   else:locations += [(x*T+w*T//2,(y+h)*T) for x,y,w,h in self.buildings[::2]]
   for i,(x,y) in enumerate(locations):
    rgb=(63,201,216) if self.theme=='cyberpunk' and i%2 else (205,87,162) if self.theme=='cyberpunk' else (239,177,105)
    for r in range(130,8,-10):ld.ellipse((x-r,y-r,x+r,y+r),fill=(*rgb,round((140-r)/6)))
   canvas=Image.alpha_composite(canvas,lights)
  canvas.convert('RGB').save(self.out/'full-map.png')
  overview=canvas.resize((1600,900),Image.Resampling.NEAREST).convert('RGB');d=ImageDraw.Draw(overview)
  for p in self.tasks:
   x,y=round(p['x']/4.8),round(p['y']/4.8);text=p['name'];box=d.textbbox((0,0),text,font=FONT);tw=box[2]
   d.rectangle((x-tw/2-7,y+13,x+tw/2+7,y+40),fill='#18232b');d.text((x-tw/2,y+15),text,font=FONT,fill='#f5e9c9')
  overview.save(self.out/'overview.png')
  canvas.crop((self.square[0]-640,self.square[1]-360,self.square[0]+640,self.square[1]+360)).convert('RGB').save(self.out/'square-detail.png')
  for room in self.art.rooms:
   px,py=room['x'],room['y'];canvas.crop((px-64,py-64,px+room['width']+64,py+room['height']+64)).convert('RGB').save(self.out/('interior-'+room['name'].lower().replace(' ','-')+'.png'))
  print(self.theme,json.dumps(self.report))

if __name__=='__main__':
 for theme in THEMES:
  m=Map(theme);m.layout();m.export()
