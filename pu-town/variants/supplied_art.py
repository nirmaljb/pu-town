"""Compose the user-supplied Tiled assets into themed, furnished, open-top towns.
The archive's provenance is recorded separately; no CC0 license is inferred.
"""
from pathlib import Path
import xml.etree.ElementTree as ET
from PIL import Image, ImageEnhance, ImageOps, ImageDraw
import json, shutil, math
ROOT=Path(__file__).resolve().parent
SOURCE=ROOT/'assets/supplied/tilesets'
T=32

class Art:
 def __init__(self,m):
  self.m=m;self.theme=m.theme;self.sets=[];self.objects=[];self.floor=[];self.cache={};self.rooms=[]
  self.nextgid=math.ceil(len(m.tiles)/32)*32+1
  self.out=m.out/'supplied';self.out.mkdir(exist_ok=True)
 def tint(self,im):
  if self.theme=='village':return im
  alpha=im.getchannel('A');gray=ImageOps.grayscale(im)
  if self.theme=='horror':rgb=ImageOps.colorize(gray,'#17212e','#9daba3').convert('RGBA');rgb=Image.blend(im,rgb,.72)
  else:rgb=ImageOps.colorize(gray,'#152039','#75bacb').convert('RGBA');rgb=Image.blend(im,rgb,.78)
  rgb.putalpha(alpha);return rgb
 def sheet(self,name):
  if name in self.cache:return self.cache[name]
  xml=ET.parse(SOURCE/'objects'/(name+'.tsx')).getroot();fw,fh=int(xml.get('tilewidth')),int(xml.get('tileheight'));count=int(xml.get('tilecount'))
  im=self.tint(Image.open(SOURCE/'objects'/(name+'.png')).convert('RGBA'));im.save(self.out/(name+'.png'))
  frames=[dict(tileid=int(f.get('tileid')),duration=int(f.get('duration'))) for f in xml.findall('./tile/animation/frame')]
  s=dict(firstgid=self.nextgid,name='supplied-'+name,image='supplied/'+name+'.png',imagewidth=im.width,imageheight=im.height,tilewidth=fw,tileheight=fh,tilecount=count,columns=int(xml.get('columns')),margin=0,spacing=0,objectalignment='bottomleft')
  if frames:s['tiles']=[dict(id=0,animation=frames)]
  self.nextgid+=count;self.sets.append(s);self.cache[name]=(s,im);return s,im
 def obj(self,name,x,y,width=None,height=None,flat=False):
  s,_=self.sheet(name);width=width or s['tilewidth'];height=height or s['tileheight']
  o=dict(name=name,type='scenery',gid=s['firstgid'],x=round(x),y=round(y),width=round(width),height=round(height))
  (self.floor if flat else self.objects).append(o);return o
 def tile(self,name,file,x,y):
  im=self.tint(Image.open(SOURCE/'terrain'/file).convert('RGBA').crop((x*T,y*T,(x+1)*T,(y+1)*T)))
  self.m.add(name,im);return self.m.custom[name]
 def terrain(self):
  m=self.m
  for i in range(4):self.tile('grass'+str(i),'grass.png',2+i%2,2+i//2);self.tile('sand'+str(i),'sand.png',2+i%2,2+i//2)
  self.tile('planks','interior.png',0,8);self.tile('flagstone','interior.png',4,8);self.tile('darkfloor','interior.png',6,6);self.tile('wall','interior.png',2 if self.theme=='village' else 0,2)
  self.nextgid=math.ceil(len(m.tiles)/32)*32+1
  oldwater=m.custom['water'];oldbridge=m.custom['bridge']
  for y in range(135):
   for x in range(240):
    i=y*240+x;g=m.layers['ground'][i];p=m.layers['paths'][i]
    if g!=oldwater:m.layers['ground'][i]=m.custom['ground'] if self.theme=='cyberpunk' else m.custom['grass'+str(x%2+2*(y%2))]
    if p and p!=oldbridge:m.layers['paths'][i]=m.custom['sand'+str(x%2+2*(y%2))] if self.theme!='cyberpunk' else m.custom['path']
  # Replace every former low-resolution building and prop, retaining exact blocked footprints.
  for name in ['scenery','buildings','details']:m.layers[name]=[0]*(240*135)
  for x,y,w,h in m.buildings:
   if 80<=x<160 and 45<=y<90 and self.theme=='village':continue
   name=('house1_blue' if x%2 else 'house2_yellow') if self.theme=='village' else 'barracks_yellow' if self.theme=='horror' else 'castle_blue'
   self.obj(name,x*T,(y+h)*T,w*T,h*T+T)
  # Tree sprites use the supplied multi-frame sheets, not oversized single tile copies.
  roomtiles={(x,y) for r in m.interiors for y in range(r['y']//T,(r['y']+r['height'])//T) for x in range(r['x']//T,(r['x']+r['width'])//T)}
  buildingtiles={(xx,yy) for x,y,w,h in m.buildings for yy in range(y,y+h) for xx in range(x,x+w)}
  if self.theme=='village':buildingtiles.update((xx,yy) for x,y,w,h in [(116,57,8,4),(130,58,6,3),(129,61,5,3)] for yy in range(y,y+h) for xx in range(x,x+w))
  for x,y in sorted(m.block,key=lambda p:(p[1],p[0])):
   if x<3 or x>236 or y<3 or y>131 or (x,y) in roomtiles or (x,y) in buildingtiles:continue
   if m.layers['ground'][y*240+x]==oldwater:continue
   if (x,y+1) in m.block:continue
   if self.theme=='village':name='oak' if x%3==0 else 'pine';w,h=96,128
   elif self.theme=='horror':name='oak_autumn' if x%4==0 else 'pine_tall';w,h=96,128
   else:name='bush2' if x%3 else 'pine';w,h=(64,64) if name=='bush2' else (96,128)
   self.obj(name,x*T+16-w/2,(y+1)*T+16,w,h)
  # Rebuild the hub's architectural landmarks using full sprites.
  if self.theme=='village':
   for name,x,y,w,h in [('castle_blue',116,57,8,4),('barracks_yellow',130,58,6,3),('archery_red',129,61,5,3)]:self.obj(name,x*T,(y+h)*T,w*T,h*T)
  for i in range(18):
   x=173+(i%3);y=9+i*6
   if m.layers['ground'][y*240+x]==oldwater:self.obj('foam',x*T,y*T,96,96,True)
  for x,y in [(176,35),(176,91)]:
   if m.layers['ground'][y*240+x]==oldwater:self.obj('duck',x*T,y*T,48,48)
  if self.theme=='village':
   for x,y in [(190,45),(193,48),(196,45)]:self.obj('sheep_grazing',x*T,y*T,64,64)
 def clear(self,x,y,w,h):
  m=self.m
  for yy in range(y,y+h):
   for xx in range(x,x+w):
    m.block.discard((xx,yy))
    for l in ['paths','scenery','buildings','details']:m.put(l,xx,yy,0)
  def overlaps(o):return o['x']< (x+w)*T and o['x']+o['width']>x*T and o['y']>y*T and o['y']-o['height']<(y+h)*T
  self.objects=[o for o in self.objects if not overlaps(o)];self.floor=[o for o in self.floor if not overlaps(o)]
 def furnish(self,name,x,y,w,h,kind,existing=False):
  m=self.m;old_doors={(xx,yy) for yy in range(y,y+h) for xx in range(x,x+w) if (xx in [x,x+w-1] or yy in [y,y+h-1]) and (xx,yy) not in m.block} if existing else set()
  self.clear(x,y,w,h)
  item=dict(name=name,type='room',x=x*T,y=y*T,width=w*T,height=h*T)
  if not existing:m.interiors.append(item)
  floor='planks' if self.theme=='village' and kind not in ['chapel','forge'] else 'flagstone' if self.theme=='horror' or kind in ['chapel','forge'] else 'darkfloor'
  m.fill('ground',x,y,w,h,m.custom[floor])
  doorx=x+w//2
  # Two wide, open doors retain sight separation while avoiding single-exit choke rooms.
  for yy in range(y,y+h):
   for xx in range(x,x+w):
    edge=xx in [x,x+w-1] or yy in [y,y+h-1]
    doorway=(yy==y+h-1 and xx in [doorx-1,doorx]) or (xx==x and yy in [y+h//2,y+h//2+1])
    if edge and not doorway and (xx,yy) not in old_doors:m.put('buildings',xx,yy,m.custom['wall'],True)
  for a,b in [((doorx-1,y+h-2),(doorx-1,y+h+2)),((x+1,y+h//2),(x-3,y+h//2))]:
   m.path(a,b,2)
   for yy in range(min(a[1],b[1]),max(a[1],b[1])+1):
    for xx in range(min(a[0],b[0]),max(a[0],b[0])+2):
     m.block.discard((xx,yy));m.put('buildings',xx,yy,0)
     if x<=xx<x+w and y<=yy<y+h:m.put('paths',xx,yy,0)
  # Clear exterior landing tiles; paths connect new district rooms back to existing routes.
  doorway=(doorx-1,y+h+1)
  fixtures=[]
  if kind=='chapel':fixtures=[('int_altar',w//2-1,2,2,1),('int_candle',2,2,1,1),('int_candle',w-3,2,1,1),('int_table_long',2,h-3,2,1),('int_table_long',w-4,h-3,2,1)]
  elif kind in ['inn','market']:fixtures=[('int_bar_l',1,2,3,2),('int_shelf_dishes',w-3,2,2,1),('int_table_long',w-4,h-4,2,1),('int_stool',2,h-3,1,1),('int_barrel',w-2,h-2,1,1)]
  elif kind in ['forge','repair']:fixtures=[('int_fireplace',1,2,2,2),('int_boards',w-3,2,2,1),('int_chest_iron',w-3,h-3,2,1),('int_table_long',2,h-3,2,1)]
  elif kind in ['infirmary','lodge']:fixtures=[('int_bed_blue',1,2,1,2),('int_bed_blue',w-3,2,1,2),('int_shelf_potions',w-3,h-3,2,1),('int_nightstand_candle',2,2,1,1)]
  elif kind in ['farm','hydro']:fixtures=[('int_palm_pot',2,2,1,1),('int_palm_pot',w-3,2,1,1),('int_shelf_pots',1,h-3,2,1),('int_table_long',w-4,h-3,2,1),('int_crates',1,3,2,1)]
  elif kind in ['server','power']:fixtures=[('int_shelf_jars',1,2,2,1),('int_shelf_potions',w-3,2,2,1),('int_chest_iron',1,h-3,2,1),('int_table_long',w-4,h-3,2,1)]
  else:fixtures=[('int_counter_goods',1,2,3,1),('int_shelf',w-3,2,2,2),('int_crates',1,h-3,2,1),('int_barrel',w-2,h-2,1,1)]
  # Keep a two-tile central aisle and all existing Task destination tiles clear.
  protected={(p['x']//T,p['y']//T) for p in m.tasks if x*T<=p['x']<(x+w)*T and y*T<=p['y']<(y+h)*T}
  for asset,dx,dy,fw,fh in fixtures:
   cells={(xx,yy) for xx in range(x+dx,x+dx+fw) for yy in range(y+dy,y+dy+fh)}
   if any(abs(xx-doorx)<=1 for xx,yy in cells) or cells & protected:continue
   self.obj(asset,(x+dx)*T,(y+dy+fh)*T,fw*T,fh*T+12)
   m.block.update(cells)
  rug='int_rug_green' if self.theme=='village' else 'int_rug_red' if self.theme=='horror' else 'int_rug_blue'
  self.obj(rug,(doorx-2)*T,(y+h//2+2)*T,3*T,3*T,True)
  self.obj('int_win_wide',(x+w-4)*T,(y+1)*T,64,24)
  self.obj('int_mat_brown' if self.theme=='village' else 'int_mat_grey',(doorx-1)*T,(y+h)*T,64,32,True)
  self.rooms.append(dict(**item,kind=kind,doors=[dict(x=(doorx-.5)*T,y=(y+h-1)*T),dict(x=x*T,y=(y+h//2+1)*T)]))
  if self.theme=='cyberpunk':
   for xx in range(x+1,x+w-1):m.put('details',xx,y,m.custom['neon-cyan' if kind in ['hydro','power'] else 'neon-pink'])
  return doorway
 def interiors(self):
  m=self.m
  kinds={'Chapel':'chapel','Inn':'inn','Smithy':'forge','General Store':'store'}
  for r in list(m.interiors):self.furnish(r['name'],r['x']//T,r['y']//T,r['width']//T,r['height']//T,kinds[r['name']],True)
  names={'village':['Mill house','Farmhouse','Market tavern','Woodland lodge','Harbor store','Workshop'], 'horror':['Abandoned abbey','Mortuary','Old infirmary','Deadwood refuge','Flooded mill','Quarantine ward'],'cyberpunk':['Data exchange','Hydroponics lab','Night market lounge','Transit control','Canal power station','Repair bay']}[self.theme]
  kinds={'village':['store','farm','market','lodge','store','forge'],'horror':['chapel','store','infirmary','lodge','forge','infirmary'],'cyberpunk':['server','hydro','market','server','power','repair']}[self.theme]
  # Place every district interior beside its landmark, with a clear route from the Task.
  district=m.tasks[-6:] if self.theme=='village' else list(m.tasks)
  for i,(p,name,kind) in enumerate(zip(district,names,kinds)):
   cx,cy=p['x']//T,p['y']//T;x,y=cx-14,cy-11;w,h=12,10
   door=self.furnish(name,x,y,w,h,kind)
   # Extend a safe two-tile entrance route without blocking the original destination.
   a=(cx,cy);b=door;m.path(a,b,2)
   for xx in range(min(a[0],b[0])-1,max(a[0],b[0])+2):
    for yy in range(min(a[1],b[1])-1,max(a[1],b[1])+2):
     if m.layers['paths'][yy*240+xx]:m.block.discard((xx,yy))
   # Keep exterior Tasks; give alternative maps an interior landmark as well.
   if self.theme!='village':m.task(name+' interior',x+w//2,y+h//2)
 def finish(self):
  self.terrain();self.interiors()
  for r in self.m.interiors:
   for yy in range(r['y']//T,(r['y']+r['height'])//T):
    for xx in range(r['x']//T,(r['x']+r['width'])//T):self.m.put('paths',xx,yy,0)
  for p in self.m.tasks:self.m.put('details',p['x']//T,p['y']//T,self.m.custom['task'])
  self.objects.sort(key=lambda o:o['y'])
  self.m.art=self
  (self.m.out/'interiors.json').write_text(json.dumps(self.rooms,indent=2)+'\n')

def apply(m):Art(m).finish()
