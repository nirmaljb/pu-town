"""Silver Jubilee Campus: a playable interpretation of the owner's campus references.
Geometry follows the supplied road and satellite screenshots, not a surveyed scale.
All artwork below is generated here; no map-provider imagery is shipped to Players.
"""
import json
import math
import random
import shutil
from pathlib import Path
from types import SimpleNamespace
from PIL import Image, ImageDraw, ImageFont

WIDTH, HEIGHT, TILE = 4096, 4480, 32
MEETING = (2208, 2848)


def generate_campus(generator):
    # The existing exporter writes Tiled layers, collision, previews and reachability metadata.
    generator.W, generator.H = WIDTH // TILE, HEIGHT // TILE
    town = generator.Map('cyberpunk')
    town.campus = True
    # Remove only this generator's superseded output sheets and room previews.
    shutil.rmtree(town.out / 'supplied', ignore_errors=True)
    for preview in town.out.glob('interior-*.png'): preview.unlink()
    town.cfg = dict(town.cfg, title='Silver Jubilee Campus')
    town.square = MEETING
    town.tasks, town.interiors, town.zones, town.buildings = [], [], [], []
    town.block = set()
    town.art = SimpleNamespace(sets=[], floor=[], objects=[], rooms=[], cache={})
    rng = random.Random(20261012)
    canvas = Image.new('RGBA', (WIDTH, HEIGHT), '#142a27')
    ink = ImageDraw.Draw(canvas)
    mask = Image.new('1', canvas.size)
    solid = ImageDraw.Draw(mask)
    font_path = Path('/System/Library/Fonts/Supplemental/Arial.ttf')
    font = ImageFont.truetype(str(font_path), 28) if font_path.exists() else ImageFont.load_default()
    small = ImageFont.truetype(str(font_path), 20) if font_path.exists() else font
    reserved = Image.new('1', canvas.size)
    reserve = ImageDraw.Draw(reserved)

    # Fine grass texture gives clearings depth without importing satellite pixels.
    for _ in range(80000):
        x, y = rng.randrange(WIDTH), rng.randrange(HEIGHT)
        ink.line((x, y, x + rng.randrange(2, 7), y), fill=rng.choice(['#19342d', '#20392e', '#223f32', '#122723']))

    def road(points, width=76, smooth=False):
        if smooth:
            controls = [points[0], *points, points[-1]]
            curve = []
            for a, b, c, d in zip(controls, controls[1:], controls[2:], controls[3:]):
                for n in range(24):
                    t = n / 24
                    curve.append(tuple(round(.5 * (2*b[k] + (-a[k]+c[k])*t + (2*a[k]-5*b[k]+4*c[k]-d[k])*t*t + (-a[k]+3*b[k]-3*c[k]+d[k])*t*t*t)) for k in (0, 1)))
            points = [*curve, points[-1]]
        ink.line(points, fill='#54615d', width=width+24, joint='curve')
        ink.line(points, fill='#252f33', width=width, joint='curve')
        ink.line(points, fill='#394345', width=max(2, width-20), joint='curve')
        reserve.line(points, fill=1, width=width+110, joint='curve')

    def ellipse_points(cx, cy, rx, ry, count=120):
        return [(round(cx+rx*math.cos(i*2*math.pi/count)), round(cy+ry*math.sin(i*2*math.pi/count))) for i in range(count+1)]

    # Outer loop, northern fork and the circular central clearing retain the reference topology.
    outer = [(1390,400),(1790,400),(2500,700),(3120,1000),(3650,1640),(3790,2390),(3630,3220),(3050,3860),(2310,3880),(1420,3760),(830,3680),(600,3000),(570,2220),(760,1560),(1040,1240),(1240,1040),(1390,400)]
    road(outer, 88, True)
    road([(2550,1040),(2720,680),(2990,230),(3490,130),(4000,220)], 72, True)
    road([(2620,0),(2990,230)], 76)
    clearing = (2170,2600,710,720)
    ink.ellipse((1460,1880,2880,3320), fill='#405039', outline='#647154', width=10)
    reserve.ellipse((1400,1820,2940,3380), fill=1)
    for _ in range(16000):
        x,y=rng.randrange(1470,2870),rng.randrange(1890,3310)
        if ((x-2170)/700)**2+((y-2600)/710)**2 < 1:
            ink.line((x,y,x+3,y),fill=rng.choice(['#4b593d','#3e5037','#566044']))
    road(ellipse_points(*clearing), 74)
    road([(1040,1240),(1660,2080)], 72)
    road([(2850,2290),(3650,1640)], 72)
    road([(1780,3180),(1420,3760),(1290,4480)], 82)
    road([(2500,3240),(2830,3860)], 72)
    road([(1450,2290),(1270,2290),(1170,2000)], 56, True)
    road([(2850,2490),(3070,2480),(3120,2660),(2870,2750)], 56, True)
    road([(2850,2290),(2730,2110),(2500,1920),(2000,1750),(1840,1890),(1790,2020)], 58, True)
    road([(1790,2020),(2190,1960),(2580,2130)], 54, True)
    # Southern roundabout and planted island.
    road(ellipse_points(1420,3760,102,102,50), 64)
    ink.ellipse((1370,3710,1470,3810), fill='#3b5744', outline='#839077', width=7)
    reserve.ellipse((1270,3610,1570,3910), fill=1)

    def sign(text, x, y):
        box=ink.textbbox((0,0),text,font=font); w=box[2]+32
        ink.rounded_rectangle((x-w/2,y,x+w/2,y+48),radius=7,fill='#172524',outline='#9d9369',width=2)
        ink.text((x-w/2+16,y+8),text,font=font,fill='#f4ddab')
        reserve.rectangle((x-w/2-20,y-15,x+w/2+20,y+65),fill=1)

    def lamp(x,y):
        # Light is visual only. It neither conceals Players nor changes Vision.
        glow=Image.new('RGBA',(224,224)); g=ImageDraw.Draw(glow)
        for r in range(110,0,-4): g.ellipse((112-r,112-r,112+r,112+r),fill=(249,192,96,round((112-r)/5)))
        canvas.alpha_composite(glow,(x-112,y-112))
        ink.rectangle((x-4,y-24,x+4,y+20),fill='#141f20')
        ink.rectangle((x-12,y-30,x+12,y-18),fill='#ffda91',outline='#877752',width=3)
        reserve.ellipse((x-32,y-48,x+32,y+40),fill=1)

    def room(name, x, y, w, h, style='classroom'):
        # Aligned 32px footprints and a 128px doorway allow 14px feet clearance.
        x,y,w,h=[round(v/TILE)*TILE for v in (x,y,w,h)]
        reserve.rectangle((x-96,y-96,x+w+96,y+h+110),fill=1)
        ink.rectangle((x-16,y-16,x+w+16,y+h+16),fill='#101d20')
        ink.rectangle((x,y,x+w,y+h),fill='#9b9476')
        for yy in range(y+32,y+h,32): ink.line((x,yy,x+w,yy),fill='#817d69',width=2)
        for xx in range(x+32,x+w,32): ink.line((xx,y,xx,y+h),fill='#817d69',width=2)
        for rect in [(x,y,x+w-1,y+31),(x,y,x+31,y+h-1),(x+w-32,y,x+w-1,y+h-1),(x,y+h-32,x+w//2-65,y+h-1),(x+w//2+64,y+h-32,x+w-1,y+h-1)]:
            solid.rectangle(rect,fill=1); ink.rectangle(rect,fill='#d0c4a2',outline='#726e62',width=5)
        for xx in range(x+64,x+w-64,96):
            ink.rectangle((xx,y+8,xx+48,y+24),fill='#ffd391')
        # Top-down furniture is solid; the centre aisle and the first Task stay clear.
        for xx in [x+64,x+w-128]:
            for yy in range(y+64,y+h-128,96):
                ink.rectangle((xx+4,yy+7,xx+66,yy+43),fill='#534a3c')
                ink.rectangle((xx,yy,xx+63,yy+31),fill='#775f43',outline='#ae9367',width=3)
                solid.rectangle((xx,yy,xx+63,yy+31),fill=1)
                if style=='lab': ink.rectangle((xx+12,yy+4,xx+40,yy+20),fill='#96b6a3',outline='#263e39',width=3)
                else: ink.rectangle((xx+16,yy+6,xx+36,yy+19),fill='#dbcdab')
        ink.rectangle((x+64,y+h-76,x+111,y+h-40),fill='#416f52',outline='#648364',width=3)
        room_data=dict(name=name,type='room',x=x+32,y=y+32,width=w-64,height=h-64)
        town.interiors.append(room_data); town.art.rooms.append(room_data)
        town.task(name,x//32+w//64,y//32+h//64)
        road([(x+w//2,y+h+80),(x+w//2,y+h-16)],40)
        sign(name,x+w//2,y+h+52)
        lamp(x+w-10,y+h+30)
        return (x+w//2,y+h+80)

    def radial(cx,cy,radius,label):
        reserve.ellipse((cx-radius-160,cy-radius-160,cx+radius+160,cy+radius+160),fill=1)
        ink.ellipse((cx-210,cy-210,cx+210,cy+210),fill='#a29c7b',outline='#bcb18f',width=12)
        ink.ellipse((cx-145,cy-145,cx+145,cy+145),fill='#345940',outline='#7b8862',width=10)
        ink.line((cx-110,cy-95,cx+110,cy+95),fill='#a29877',width=22)
        ink.line((cx+110,cy-95,cx-110,cy+95),fill='#a29877',width=22)
        for i in range(7):
            # South-facing gap admits Players into the open courtyard.
            angle=math.radians(150+i*40)
            ux,uy=math.cos(angle),math.sin(angle); vx,vy=-uy,ux
            a,b=195,radius
            corners=[(round(cx+ux*r+vx*s),round(cy+uy*r+vy*s)) for r,s in [(a,-60),(b,-60),(b,60),(a,60)]]
            ink.polygon([(x+12,y+20) for x,y in corners],fill='#0d1d20')
            ink.polygon(corners,fill='#b1a58b'); solid.polygon(corners,fill=1)
            ink.line([*corners,corners[0]],fill='#d0c1a0',width=12)
            for distance in range(220,radius-20,55):
                px,py=cx+ux*distance,cy+uy*distance
                ink.line((px-vx*42,py-vy*42,px+vx*42,py+vy*42),fill='#756f64',width=9)
                ink.ellipse((px+vx*42-6,py+vy*42-6,px+vx*42+6,py+vy*42+6),fill='#edca8b')
        road([(cx,cy+120),(cx,cy+radius+100)],48)
        sign(label,cx,cy+radius+85)
        for a in [35,145,265]: lamp(round(cx+170*math.cos(math.radians(a))),round(cy+170*math.sin(math.radians(a))))

    radial(2030,1260,430,'Academic Block A')
    radial(2810,1590,390,'Academic Block B')
    road([(2030,1790),(2000,1750)],52)
    road([(2810,2080),(2730,2110)],52)
    # Furnished teaching wings sit on the north side of the two radial complexes.
    a=room('Block A Seminar Room',1824,416,384,320)
    road([a,(1770,816),(1770,490)],48)
    b=room('Block B Research Lab',2720,800,384,288,'lab')
    road([b,(3220,1168),(3380,1280)],48)
    social=room('School of Social Sciences',1120,1088,416,352)
    road([social,(1000,1520)],50)
    media=room('Electronic Media',1056,2080,352,448,'lab')
    road([media,(1450,2600)],52)
    ums=room('UMSARC',2656,3400,352,320,'lab')
    road([ums,(2830,3860)],48)
    central=room('Central Building',1984,2240,384,288)
    # Gathering area remains outdoors; the central building sits beside its northern edge.
    ink.rounded_rectangle((1776,2576,2640,3136),radius=70,fill='#666b59',outline='#aaa184',width=12)
    reserve.rectangle((1700,2510,2710,3200),fill=1)
    for x in range(1800,2620,32): ink.line((x,2590,x,3120),fill='#747660',width=2)
    for y in range(2590,3120,32): ink.line((1800,y,2620,y),fill='#747660',width=2)
    ink.ellipse((MEETING[0]-130,MEETING[1]-90,MEETING[0]+130,MEETING[1]+90),fill='#4d6450',outline='#d0ba83',width=7)
    sign('Silver Jubilee Campus',MEETING[0],3150)
    for x,y in [(1810,2600),(2600,2600),(1810,3110),(2600,3110)]: lamp(x,y)
    # Path to the central building must remain visible above the plaza.
    road([central,(MEETING[0],2590)],48)
    # Informal footpaths shorten long loops while retaining the campus plan.
    road([(1450,2600),(1810,2800)],42)
    road([(2640,2820),(2850,2750)],42)
    road([(1040,1240),(1120,1810),(1450,2290)],36,True)
    for name,x,y in [('Courtyard A',2030,1260),('Courtyard B',2810,1590),('South Entrance',1420,3600),('Campus Gardens',3220,3060)]:
        reserve.ellipse((x-140,y-140,x+140,y+140),fill=1)
        town.task(name,x//32,y//32)
    for x,y in [(980,1390),(640,2020),(720,3020),(1680,3580),(2290,3900),(3370,3500),(3740,2280),(3430,1430),(1580,400),(2550,750),(2910,330)]: lamp(x,y)
    sign('South Entrance',1420,3990)

    # Dense woodland has y-sorted canopies, sparse trunk collision, and clear routes.
    for variant in range(3):
        tree=Image.new('RGBA',(160,192)); d=ImageDraw.Draw(tree)
        d.rectangle((74,138,86,183),fill='#695b43')
        for cx,cy,r,col in [(80,93,68,'#112923'),(53,85,45,'#244538'),(106,81,44,'#1b3b30'),(78,54,46,'#2b4b38'),(65,50,28,'#39563d')]:
            d.ellipse((cx-r,cy-r,cx+r,cy+r),fill=col)
        for _ in range(85):
            x,y=rng.randrange(25,137),rng.randrange(20,143)
            if tree.getpixel((x,y))[3]:d.line((x,y,x+4,y),fill=rng.choice(['#3b583f','#264b38','#142f27']))
        image=f'campus-tree-{variant}.png';tree.save(town.out/image)
        info=dict(firstgid=100000+variant,name=f'campus-tree-{variant}',image=image,imagewidth=160,imageheight=192,tilewidth=160,tileheight=192,tilecount=1,columns=1,margin=0,spacing=0)
        town.art.sets.append(info);town.art.cache[info['name']]=(info,tree)
    for _ in range(2500):
        x,y=rng.randrange(100,WIDTH-100),rng.randrange(100,HEIGHT-90)
        if reserved.getpixel((x,y)) or mask.getpixel((x,y)): continue
        # Keep canopy clusters away from all roads, rooms and destination clearings.
        if any(reserved.getpixel((max(0,min(WIDTH-1,x+dx)),max(0,min(HEIGHT-1,y+dy)))) for dx,dy in [(80,0),(-80,0),(0,80),(0,-80)]):continue
        name=f'campus-tree-{rng.randrange(3)}';info=town.art.cache[name][0]
        town.art.objects.append(dict(name=name,gid=info['firstgid'],x=x-80,y=y+16,width=160,height=192))
        solid.rectangle((x-10,y-10,x+10,y+10),fill=1)
        ink.ellipse((x-65,y-22,x+65,y+30),fill='#10231f')
    (town.out / 'interiors.json').write_text(json.dumps(town.interiors, indent=2)+'\n')
    for task in town.tasks:
        x,y=task['x'],task['y']
        ink.ellipse((x-13,y-13,x+13,y+13),fill='#284b40',outline='#dfbc76',width=3)
        ink.rectangle((x-5,y-7,x+5,y+7),fill='#dfbc76')
    # Convert the artwork to a deduplicated tile atlas: editable and native to Tiled/Phaser.
    town.tiles=[]; town.custom={}; town.layers={name:[0]*(generator.W*generator.H) for name in ['ground','paths','scenery','buildings','details']}
    tile_ids={}
    for y in range(generator.H):
        for x in range(generator.W):
            tile=canvas.crop((x*32,y*32,(x+1)*32,(y+1)*32)); key=tile.tobytes()
            if key not in tile_ids:town.tiles.append(tile);tile_ids[key]=len(town.tiles)
            town.layers['ground'][y*generator.W+x]=tile_ids[key]
            if mask.crop((x*32,y*32,(x+1)*32,(y+1)*32)).getbbox():town.block.add((x,y))
    # Outer edge always closes the playable world.
    town.block.update((x,y) for x in range(generator.W) for y in [0,generator.H-1])
    town.block.update((x,y) for y in range(generator.H) for x in [0,generator.W-1])
    town.seats=[dict(seat=i,x=MEETING[0]+round(330*math.sin(i*math.pi/5)),y=MEETING[1]-round(205*math.cos(i*math.pi/5))) for i in range(10)]
    town.tasks.append(dict(name='Town Square',x=MEETING[0],y=MEETING[1]))
    town.validate(); town.export()
    return town
