"""Standalone reference-led generator shed. Executed through Blender MCP.

Metres; +Z up, +Y rear, front at -Y. All geometry and shaders are authored here.
No game files are read or written. The build folder is a local authoring artifact.
"""
import bpy
import math
import random
import json
from pathlib import Path
from mathutils import Vector, noise

ROOT = Path(__file__).resolve().parent
OUT = ROOT / 'build'
OUT.mkdir(exist_ok=True)
PASS = globals().get('BUILD_PASS', '01')
W, D = 8.8, 3.8
DOOR_X, DOOR_W, DOOR_H = 1.64, 1.44, 2.1
FRONT_H, BACK_H = 2.52, 2.92
OVER_X, OVER_Y = .43, .28
SNOW_DEPTH = .29
rng = random.Random(1886)

scene = bpy.context.scene
if bpy.data.filepath and Path(bpy.data.filepath).resolve() != (OUT/'generator-room.blend').resolve():
    raise RuntimeError('Use a dedicated factory-startup Blender session or this asset master.')
scene.name = 'Generator Room — standalone review'
scene['authoring_scope'] = 'Reference-matched exterior asset only. No game integration.'
scene['scale_note'] = 'Owner-approved inferred 8.8 × 3.8 m footprint, 2.1 m doorway; not a measured survey.'
scene['reference_window_count'] = 0
for ob in list(scene.objects):
    bpy.data.objects.remove(ob, do_unlink=True)
for col in list(bpy.data.collections):
    if not col.objects:
        bpy.data.collections.remove(col)
for mat in list(bpy.data.materials):
    if mat.users == 0:
        bpy.data.materials.remove(mat)
scene.unit_settings.system = 'METRIC'
scene.unit_settings.scale_length = 1

collections = {}
for name in ['01 Timber shell', '02 Roof and snow', '03 Recessed entry', '04 Ironwork and ice', '90 Review stage']:
    col = bpy.data.collections.new(name)
    scene.collection.children.link(col)
    collections[name[:2]] = col

def move(ob, key):
    for c in list(ob.users_collection):
        c.objects.unlink(ob)
    collections[key].objects.link(ob)
    return ob

def rgba(hex):
    v = [int(hex[i:i+2], 16)/255 for i in (0, 2, 4)]
    return tuple(x/12.92 if x < .04045 else ((x+.055)/1.055)**2.4 for x in v)+(1,)

def material(name, color, rough=.8, metallic=0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = rgba(color)
    m.use_nodes = True
    p = m.node_tree.nodes.get('Principled BSDF')
    p.inputs['Base Color'].default_value = rgba(color)
    p.inputs['Roughness'].default_value = rough
    p.inputs['Metallic'].default_value = metallic
    return m

def wood(name, color1, color2, horizontal=False, frost=True):
    m = material(name, color1)
    n, l = m.node_tree.nodes, m.node_tree.links
    p = n.get('Principled BSDF')
    tex = n.new('ShaderNodeTexCoord')
    mapping = n.new('ShaderNodeVectorMath'); mapping.operation = 'MULTIPLY'
    mapping.inputs[1].default_value = (.7, 8, 9) if horizontal else (8, 8, .65)
    l.new(tex.outputs['Generated'], mapping.inputs[0])
    grain = n.new('ShaderNodeTexNoise'); grain.inputs['Scale'].default_value = 7
    grain.inputs['Detail'].default_value = 4; grain.inputs['Roughness'].default_value = .7
    l.new(mapping.outputs['Vector'], grain.inputs['Vector'])
    ramp = n.new('ShaderNodeValToRGB')
    ramp.color_ramp.elements[0].position = .19; ramp.color_ramp.elements[0].color = rgba(color1)
    ramp.color_ramp.elements[1].position = .82; ramp.color_ramp.elements[1].color = rgba(color2)
    l.new(grain.outputs['Fac'], ramp.inputs['Fac'])
    fine = n.new('ShaderNodeTexNoise'); fine.inputs['Scale'].default_value = 39
    fine.inputs['Detail'].default_value = 2
    l.new(mapping.outputs['Vector'], fine.inputs['Vector'])
    bump = n.new('ShaderNodeBump'); bump.inputs['Strength'].default_value=.32; bump.inputs['Distance'].default_value=.027
    l.new(fine.outputs['Fac'], bump.inputs['Height']); l.new(bump.outputs['Normal'],p.inputs['Normal'])
    if frost:
        geom=n.new('ShaderNodeNewGeometry'); sep=n.new('ShaderNodeSeparateXYZ')
        l.new(geom.outputs['Position'],sep.inputs[0])
        height=n.new('ShaderNodeMapRange'); height.clamp=True
        height.inputs['From Min'].default_value=.02; height.inputs['From Max'].default_value=1.15
        height.inputs['To Min'].default_value=.70; height.inputs['To Max'].default_value=.47
        l.new(sep.outputs['Z'],height.inputs['Value'])
        mask=n.new('ShaderNodeMath'); mask.operation='SUBTRACT'
        l.new(grain.outputs['Fac'],mask.inputs[0]); l.new(height.outputs[0],mask.inputs[1])
        edge=n.new('ShaderNodeMapRange'); edge.clamp=True
        edge.inputs['From Min'].default_value=.10; edge.inputs['From Max'].default_value=-.09
        edge.inputs['To Min'].default_value=0; edge.inputs['To Max'].default_value=.22
        l.new(mask.outputs[0],edge.inputs['Value'])
        mix=n.new('ShaderNodeMixRGB'); mix.blend_type='MIX'
        l.new(edge.outputs[0],mix.inputs[0]); l.new(ramp.outputs['Color'],mix.inputs[1]); mix.inputs[2].default_value=rgba('A0A9B6')
        l.new(mix.outputs[0],p.inputs['Base Color'])
    else:
        l.new(ramp.outputs[0],p.inputs['Base Color'])
    return m

# The owner's original illustrations provide the weathered grain, packed intact.
# Each real board samples a clean timber strip; no background or doorway is sampled.
ref_image=bpy.data.images.load(str(ROOT/'reference'/'Snow-capped timber utility shed-1.png'),check_existing=True)
ref_image.pack()
roof_image=bpy.data.images.load(str(ROOT/'reference'/'Top-down snowy shed roof cutout-5.png'),check_existing=True)
roof_image.pack()

def illustrated(name, image, rect, horizontal=False, tint=1.0):
    m=material(name,'55585E',.88)
    n,l=m.node_tree.nodes,m.node_tree.links
    p=n.get('Principled BSDF')
    tc=n.new('ShaderNodeTexCoord');sep=n.new('ShaderNodeSeparateXYZ');l.new(tc.outputs['Generated'],sep.inputs[0])
    combine=n.new('ShaderNodeCombineXYZ')
    if horizontal:
        l.new(sep.outputs['Y' if horizontal=='Y' else 'X'],combine.inputs['X'])
    else:
        add=n.new('ShaderNodeMath');add.operation='ADD'
        l.new(sep.outputs['X'],add.inputs[0]);l.new(sep.outputs['Y'],add.inputs[1])
        l.new(add.outputs[0],combine.inputs['X'])
    l.new(sep.outputs['Z'],combine.inputs['Y'])
    mul=n.new('ShaderNodeVectorMath');mul.operation='MULTIPLY';mul.inputs[1].default_value=(rect[2],rect[3],1)
    l.new(combine.outputs[0],mul.inputs[0])
    add=n.new('ShaderNodeVectorMath');add.operation='ADD';add.inputs[1].default_value=(rect[0],rect[1],0)
    l.new(mul.outputs[0],add.inputs[0])
    im=n.new('ShaderNodeTexImage');im.image=image;im.extension='EXTEND';l.new(add.outputs[0],im.inputs[0])
    mix=n.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1;mix.inputs[2].default_value=(tint,tint,tint,1)
    l.new(im.outputs['Color'],mix.inputs[1]);l.new(mix.outputs[0],p.inputs['Base Color'])
    bump=n.new('ShaderNodeBump');bump.inputs['Strength'].default_value=.28;bump.inputs['Distance'].default_value=.035
    l.new(im.outputs['Color'],bump.inputs['Height']);l.new(bump.outputs[0],p.inputs['Normal'])
    return m

woods=[illustrated('Timber / reference grain %02d'%i,ref_image,(x/1774,127/887,22/1774,406/887),tint=.92)
       for i,x in enumerate([220,270,325,378,428,484,535,590,643,697,747,802,854,905,955])]
beam_mat=illustrated('Timber / weathered horizontal fascia',ref_image,(205/1774,577/887,1350/1774,28/887),True,.95)
side_beam=illustrated('Timber / side fascia grain',ref_image,(205/1774,577/887,1350/1774,28/887),'Y',.95)
post_mat=illustrated('Timber / silver worn posts',ref_image,(153/1774,125/887,18/1774,410/887),tint=.93)
inside=illustrated('Timber / warm reference recess',ref_image,(1100/1774,174/887,21/1774,265/887),tint=.45)
# The reference is already warm-lit: desaturate its baked light before relighting.
n,l=inside.node_tree.nodes,inside.node_tree.links
p=n.get('Principled BSDF');previous=p.inputs['Base Color'].links[0].from_socket
hue=n.new('ShaderNodeHueSaturation');hue.inputs['Saturation'].default_value=.75
l.new(previous,hue.inputs['Color']);l.new(hue.outputs[0],p.inputs['Base Color'])
floor_mat=wood('Timber / threshold and floor','4D4439','998775',True,False)
iron=material('Iron / oxidised cold steel','30363B',.75,.65)
rust=material('Iron / worn screw heads','73787D',.63,.7)
crevice=material('Wood / split end grain','20272C',.95)
wear=material('Wood / exposed grain ridges','737779',.91)
snow=material('Snow / cold overcast powder','C2CDDF',.93)
n,l=snow.node_tree.nodes,snow.node_tree.links
p=n.get('Principled BSDF'); p.inputs['Subsurface Weight'].default_value=.035
tex=n.new('ShaderNodeTexNoise'); tex.inputs['Scale'].default_value=4.8; tex.inputs['Detail'].default_value=3
r=n.new('ShaderNodeValToRGB'); r.color_ramp.elements[0].color=rgba('A7B5CE'); r.color_ramp.elements[1].color=rgba('D2DBE8')
l.new(tex.outputs['Fac'],r.inputs[0]); l.new(r.outputs[0],p.inputs['Base Color'])
b=n.new('ShaderNodeBump'); b.inputs['Strength'].default_value=.11;b.inputs['Distance'].default_value=.025
l.new(tex.outputs['Fac'],b.inputs['Height']);l.new(b.outputs[0],p.inputs['Normal'])
ice=material('Ice / opaque frost','9DAFC4',.34)
lampglass=material('Lamp / amber frosted glass','FFD18A',.4)
lp=lampglass.node_tree.nodes.get('Principled BSDF')
lp.inputs['Emission Color'].default_value=rgba('FFCD80');lp.inputs['Emission Strength'].default_value=4

root=bpy.data.objects.new('GENERATOR_ROOM / 8.8 × 3.8 m',None)
collections['01'].objects.link(root)
root['wall_footprint_m']=[W,D]
root['door_clear_width_height_m']=[DOOR_W,DOOR_H]
root['door_center_x_m']=DOOR_X

def mesh(name, verts, faces, mat, key='01'):
    me=bpy.data.meshes.new(name);me.from_pydata(verts,[],faces);me.update()
    ob=bpy.data.objects.new(name,me);collections[key].objects.link(ob)
    ob.data.materials.append(mat)
    if key!='90': ob.parent=root
    return ob

def bevel(ob,width=.012,segments=2):
    mod=ob.modifiers.new('Soft worn edges','BEVEL');mod.width=width;mod.segments=segments
    mod=ob.modifiers.new('Timber face normals','WEIGHTED_NORMAL');mod.keep_sharp=True
    return ob

def box(name,loc,size,mat,key='01',edge=.01):
    bpy.ops.mesh.primitive_cube_add(size=1,location=loc)
    ob=move(bpy.context.object,key);ob.name=name;ob.dimensions=size
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    ob.data.materials.append(mat)
    if key!='90':ob.parent=root
    if edge:bevel(ob,edge)
    return ob

def rod(name,a,b,radius,mat,key='04',vertices=10):
    a,b=Vector(a),Vector(b)
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=radius,depth=(b-a).length,location=(a+b)/2)
    ob=move(bpy.context.object,key);ob.name=name;ob.rotation_euler=(b-a).to_track_quat('Z','Y').to_euler();ob.data.materials.append(mat)
    if key!='90':ob.parent=root
    bevel(ob,.002,1)
    return ob

def line(name,points,radius,mat,key='04'):
    cv=bpy.data.curves.new(name,'CURVE');cv.dimensions='3D';cv.resolution_u=1
    sp=cv.splines.new('POLY');sp.points.add(len(points)-1)
    for p,co in zip(sp.points,points):p.co=(*co,1)
    cv.bevel_depth=radius;cv.bevel_resolution=0
    ob=bpy.data.objects.new(name,cv);collections[key].objects.link(ob);ob.data.materials.append(mat);ob.parent=root
    return ob

def roof_z(y):return FRONT_H+(y+D/2)/D*(BACK_H-FRONT_H)

# True separate boards, with a real opening rather than a decal on an unbroken wall.
left,right=DOOR_X-DOOR_W/2,DOOR_X+DOOR_W/2
for front,y in [(True,-D/2),(False,D/2)]:
    intervals=[(-W/2,left),(right,W/2)] if front else [(-W/2,W/2)]
    for low,high in intervals:
        count=round((high-low)/.29);span=(high-low)/count
        for i in range(count):
            x=low+(i+.5)*span;h=roof_z(y)-.14
            ob=box(('Front' if front else 'Back')+' / plank %02d'%i,(x,y,h/2+.06),(span-.014,.125,h),rng.choice(woods))
            if front:
                # Slim geometric checks supplement the reference grain.
                for j in range(1):
                    cx=x+rng.uniform(-span*.35,span*.35);z=rng.uniform(.12,h-.6);length=rng.uniform(.2,.65)
                    line('Weather check / front',[(cx+.002*math.sin(k),y-.064,z+length*k/7) for k in range(8)],.0017,crevice)
    if front:
        box('Front / continuous lintel backing',(DOOR_X,y,(DOOR_H+FRONT_H-.08)/2),(DOOR_W,.13,FRONT_H-.08-DOOR_H),woods[2])

for side,x in [('West',-W/2),('East',W/2)]:
    count=14;span=D/count
    for i in range(count):
        y=-D/2+(i+.5)*span;h=roof_z(y)-.12
        box(side+' / plank %02d'%i,(x,y,h/2+.05),(.125,span-.014,h),rng.choice(woods))
    # Side top rails follow the roof's actual pitch.
    beam=box(side+' / sloping wall plate',(x,0,(FRONT_H+BACK_H)/2-.16),(.19,D+.12,.23),side_beam)
    beam.rotation_euler.x=math.atan2(BACK_H-FRONT_H,D)

for x in [-W/2,W/2]:
    for y in [-D/2,D/2]:
        h=roof_z(y)-.13
        box('Corner post',(x,y,h/2),(.29,.26,h),post_mat,edge=.02)
        box('Post foot',(x,y,.10),(.33,.30,.20),post_mat,edge=.018)
        rod('Corner / iron pin',(x,y-.14,.35),(x,y-.155,.35),.025,rust)
for y in [-D/2,D/2]:
    box('Long wall / top rail',(0,y-.006,roof_z(y)-.19),(W+.15,.22,.24),beam_mat)
    for lo,hi in ([(-W/2,left),(right,W/2)] if y<0 else [(-W/2,W/2)]):
        box('Wall / lower sill',((lo+hi)/2,y,.09),(hi-lo,.20,.14),beam_mat)
    for x in [-4.15,-2.1,0,2.1,4.15]:
        box('Rafter end',(x,y,roof_z(y)-.12),(.19,.44,.34),post_mat,'02')

# Roof deck, fascia and snow all share the same sloping plane.
slope=math.atan2(BACK_H-FRONT_H,D)
roof_w,roof_d=W+2*OVER_X,D+2*OVER_Y
ob=box('Roof / solid deck',(0,0,(FRONT_H+BACK_H)/2+.025),(roof_w,roof_d,.17),beam_mat,'02');ob.rotation_euler.x=slope
for y in [-roof_d/2,roof_d/2]:
    box('Fascia / long edge',(0,y,roof_z(y)),(roof_w+.08,.16,.19),beam_mat,'02',.016)
    for x in [-4.3,-2.1,0,2.1,4.3]:
        rod('Fascia bolt',(x,y-.09,roof_z(y)),(x,y-.11,roof_z(y)),.025,rust)
for x in [-roof_w/2,roof_w/2]:
    for y in [-roof_d/2,roof_d/2]:
        box('Roof / projecting fascia end cap',(x,y,roof_z(y)-.10),(.15,.20,.36),post_mat,'02',.012)
    o=box('Fascia / sloped end',(x,0,(FRONT_H+BACK_H)/2),(.16,roof_d,.21),side_beam,'02',.016);o.rotation_euler.x=slope

# Broad continuous snow blanket; irregular faceted wind-scoured perimeter.
nx,ny=88,40
verts=[]
for j in range(ny+1):
    y=(j/ny-.5)*(roof_d-.02)
    for i in range(nx+1):
        x=(i/nx-.5)*(roof_w-.02)
        dx=(roof_w-.02)/2-abs(x);dy=(roof_d-.02)/2-abs(y)
        corner=.20
        if dx<corner and dy<corner:
            a,b=corner-dx,corner-dy;length=math.hypot(a,b)
            if length>corner:
                x=math.copysign((roof_w-.02)/2-corner+a/length*corner,x)
                y2=math.copysign((roof_d-.02)/2-corner+b/length*corner,y)
            else:y2=y
        else:y2=y
        edge=min(dx,dy)
        rim=1-math.exp(-max(0,edge)*7)
        broad=noise.noise_vector(Vector((x*.8,y2*.9,2.8)))[0]
        fine=noise.noise_vector(Vector((x*5,y2*5,6.4)))[0]
        z=roof_z(y2)+.11+SNOW_DEPTH*(.30+.70*rim)+broad*.06+fine*.016
        if i==0 or i==nx:x+=.07*noise.noise_vector(Vector((y2*2.8,6.2,3.1)))[0]
        if j==0 or j==ny:y2+=.075*noise.noise_vector(Vector((x*3.4,7.2,1.5)))[0]
        verts.append((x,y2,z))
faces=[]
for j in range(ny):
    for i in range(nx):
        a=j*(nx+1)+i;b=a+1;c=a+nx+2;d=a+nx+1
        faces.extend([(a,b,c),(a,c,d)] if (i+j)%2 else [(a,b,d),(b,c,d)])
boundary=list(range(nx+1))+[j*(nx+1)+nx for j in range(1,ny+1)]+[ny*(nx+1)+i for i in range(nx-1,-1,-1)]+[j*(nx+1) for j in range(ny-1,0,-1)]
for k,a in enumerate(boundary):
    x,y,z=verts[a];verts.append((x*.999,y*.999,roof_z(y)+.08+.015*math.sin(x*22+y*17)))
    b=boundary[(k+1)%len(boundary)];lo=(nx+1)*(ny+1)+k;nextlo=(nx+1)*(ny+1)+(k+1)%len(boundary)
    faces.append((a,lo,nextlo,b))
faces.append(tuple(reversed(list(range((nx+1)*(ny+1),len(verts))))))
snow_ob=mesh('Snow / single sculpted roof blanket',verts,faces,snow,'02')
# Use the owner's snow texture on the upper surface; procedural microrelief remains.
n,l=snow.node_tree.nodes,snow.node_tree.links
p=n.get('Principled BSDF')
tc=n.new('ShaderNodeTexCoord');mapping=n.new('ShaderNodeVectorMath');mapping.operation='MULTIPLY'
mapping.inputs[1].default_value=(.90,.77,1);l.new(tc.outputs['Generated'],mapping.inputs[0])
offset=n.new('ShaderNodeVectorMath');offset.operation='ADD';offset.inputs[1].default_value=(.05,.12,0)
l.new(mapping.outputs[0],offset.inputs[0])
im=n.new('ShaderNodeTexImage');im.image=roof_image;l.new(offset.outputs[0],im.inputs[0])
mix=n.new('ShaderNodeMixRGB');mix.blend_type='MULTIPLY';mix.inputs[0].default_value=1;mix.inputs[2].default_value=(.83,.83,.83,1)
l.new(im.outputs['Color'],mix.inputs[1])
# Upper-surface illustration must not streak down the vertical thickness of the cap.
geom=n.new('ShaderNodeNewGeometry');normal=n.new('ShaderNodeSeparateXYZ');l.new(geom.outputs['Normal'],normal.inputs[0])
mask=n.new('ShaderNodeMapRange');mask.clamp=True
mask.inputs['From Min'].default_value=.25;mask.inputs['From Max'].default_value=.86
l.new(normal.outputs['Z'],mask.inputs['Value'])
edge_mix=n.new('ShaderNodeMixRGB');edge_mix.inputs[1].default_value=rgba('C3CDDD')
l.new(mask.outputs[0],edge_mix.inputs[0]);l.new(mix.outputs[0],edge_mix.inputs[2]);l.new(edge_mix.outputs[0],p.inputs['Base Color'])

# Door trim matches the reference: offset right, worn posts, full width lintel.
for x in [left-.09,right+.09]:
    box('Entry / upright',(x,-D/2-.065,DOOR_H/2),(.18,.28,DOOR_H),post_mat,'03',.018)
    for z in [.20,DOOR_H-.18]:rod('Entry / carriage bolt',(x,-D/2-.213,z),(x,-D/2-.232,z),.025,rust)
box('Entry / lintel',(DOOR_X,-D/2-.07,DOOR_H+.12),(DOOR_W+.45,.31,.21),beam_mat,'03',.018)
box('Entry / threshold',(DOOR_X,-D/2+.10,.06),(DOOR_W,.56,.12),floor_mat,'03',.018)
# A shallow timber-lined recess as visible in the supplied front sheet; no invented furnishings.
recess=.72
for i in range(6):
    bw=DOOR_W/6
    box('Entry / recessed rear board %02d'%i,(left+(i+.5)*bw,-D/2+recess,1.08),(bw-.009,.10,2.04),inside,'03',.008)
for x in [left+.035,right-.035]:
    box('Entry / inner jamb',(x,-D/2+recess/2,1.06),(.08,recess,2.05),inside,'03')
box('Entry / inner head',(DOOR_X,-D/2+recess/2,2.03),(DOOR_W,recess,.10),inside,'03')
for i in range(5):
    box('Entry / floorboard',(DOOR_X,-D/2+(i+.5)*recess/5,.11),(DOOR_W,recess/5-.008,.08),floor_mat,'03')
box('Entry / lower back rail',(DOOR_X,-D/2+recess-.07,.23),(DOOR_W,.1,.12),inside,'03')

# Small caged industrial bulb, with real warm light confined to the recess.
lx,ly,lz=DOOR_X-.11,-D/2+.32,1.88
rod('Lamp / stem',(lx,ly,2.09),(lx,ly,2.01),.024,iron,'03')
bpy.ops.mesh.primitive_uv_sphere_add(segments=16,ring_count=8,radius=1,location=(lx,ly,lz))
ob=move(bpy.context.object,'03');ob.name='Lamp / frosted amber globe';ob.scale=(.074,.074,.105);ob.data.materials.append(lampglass);ob.parent=root
rod('Lamp / cap',(lx,ly,lz+.08),(lx,ly,lz+.12),.105,iron,'03',16)
for z,radius in [(lz-.075,.06),(lz-.01,.085),(lz+.07,.085)]:
    line('Lamp / guard ring',[(lx+radius*math.cos(t*math.tau/32),ly+radius*math.sin(t*math.tau/32),z) for t in range(33)],.005,iron,'03')
for i in range(6):
    t=i*math.tau/6
    line('Lamp / guard rib',[(lx+r*math.cos(t),ly+r*math.sin(t),z) for r,z in [(.03,lz-.11),(.085,lz-.03),(.085,lz+.1)]],.005,iron,'03')

def light(name,kind,loc,power,color,size=1,target=None,key='90'):
    data=bpy.data.lights.new(name,kind);data.energy=power;data.color=color
    if kind=='AREA':data.shape='DISK';data.size=size
    else:data.shadow_soft_size=size
    ob=bpy.data.objects.new(name,data);collections[key].objects.link(ob);ob.location=loc
    if target:ob.rotation_euler=(Vector(target)-ob.location).to_track_quat('-Z','Y').to_euler()
    if key!='90':ob.parent=root
    return ob
light('Lamp / 2400 K pool','POINT',(lx,ly-.12,lz-.06),45,(1,.51,.19),.10,key='03')
light('Lamp / doorway spill','AREA',(DOOR_X,-D/2+.30,1.55),18,(1,.52,.22),.65,(DOOR_X,-3,0),'03')

# Restrained ice underneath the snow lip.
for i in range(26):
    x=rng.uniform(-roof_w/2+.1,roof_w/2-.1);y=-roof_d/2-.025;length=rng.uniform(.035,.15)
    bpy.ops.mesh.primitive_cone_add(vertices=6,radius1=0,radius2=rng.uniform(.009,.025),depth=length,location=(x,y,roof_z(y)+.09-length/2))
    ob=move(bpy.context.object,'04');ob.name='Ice / eave drip';ob.data.materials.append(ice);ob.parent=root

# Separate presentation stage; the building stays cleanly selectable as one root.
world=bpy.data.worlds.new('Polar overcast / review')
scene.world=world;world.use_nodes=True
world.node_tree.nodes['Background'].inputs['Color'].default_value=(.42,.43,.46,1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value=.34
light('Overcast / broad key','AREA',(-3,-6,10),1550,(.94,.96,1),9,(0,0,1))
light('Overcast / sky fill','AREA',(5,4,8),1150,(.82,.87,.96),8,(0,0,1.5))
light('Overcast / side lift','AREA',(9,-2,6),420,(.88,.91,1),6,(0,0,1.5))
light('Overcast / front lift','AREA',(0,-10,4),280,(.94,.95,1),7,(0,0,1))
ground=material('Stage / snowfield','9195A0',.96)
box('STAGE / snow ground',(0,0,-.11),(200,200,.16),ground,'90',0)

def camera(name,loc,target,scale):
    data=bpy.data.cameras.new(name);data.type='ORTHO';data.ortho_scale=scale
    ob=bpy.data.objects.new(name,data);collections['90'].objects.link(ob);ob.location=loc
    ob.rotation_euler=(Vector(target)-ob.location).to_track_quat('-Z','Y').to_euler()
    return ob
cams={
'hero':camera('VIEW / hero', (10,-18,10),(0,0,1.25),13.4),
'front':camera('VIEW / front',(0,-20,1.55),(0,0,1.55),11.1),
'right':camera('VIEW / right',(20,0,1.65),(0,0,1.65),6),
'back':camera('VIEW / back',(0,20,1.65),(0,0,1.65),11.1),
'top':camera('VIEW / top',(0,0,20),(0,0,0),11.1),
'entry':camera('VIEW / entry',(5,-12,5),(DOOR_X,-D/2+.1,1.1),4.5),
}
scene.camera=cams['hero']
scene.render.engine='CYCLES'
scene.cycles.samples=64
scene.cycles.use_denoising=True
scene.cycles.device='CPU'
scene.render.resolution_x=1920;scene.render.resolution_y=1200;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA'
scene.render.film_transparent=False
scene.view_settings.view_transform='AgX'
scene.view_settings.look='AgX - Medium High Contrast'
scene.render.filepath=str(OUT/f'pass-{PASS}-hero.png')
# Keep an immediately useful camera view when the owner opens the file.
for area in bpy.context.screen.areas:
    if area.type=='VIEW_3D':
        area.spaces.active.region_3d.view_perspective='CAMERA'
        area.spaces.active.shading.type='MATERIAL'
        area.spaces.active.shading.use_scene_world=True
        area.spaces.active.shading.use_scene_lights=True
bpy.ops.object.select_all(action='DESELECT');root.select_set(True);bpy.context.view_layer.objects.active=root
# Record source dimensions and dependency-free asset statistics.
report={'pass':PASS,'footprint_m':[W,D],'wall_height_front_back_m':[FRONT_H,BACK_H],
        'door':{'center_x_m':DOOR_X,'width_m':DOOR_W,'height_m':DOOR_H,'recess_m':recess},
        'roof_deck_m':[roof_w,roof_d],'window_count':0,
        'asset_objects':sum(len(collections[k].objects) for k in ['01','02','03','04']),
        'unmodified_game':True,'blender_version':bpy.app.version_string}
(OUT/f'pass-{PASS}-dimensions.json').write_text(json.dumps(report,indent=2)+'\n')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'generator-room.blend'))
print(json.dumps(report))
