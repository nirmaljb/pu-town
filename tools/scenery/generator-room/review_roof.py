"""Render the independently saved roof; temporary review objects are not saved."""
import bpy
import sys
from pathlib import Path
from mathutils import Vector

out=Path(sys.argv[sys.argv.index('--')+1])
s=bpy.context.scene
s.render.engine='CYCLES';s.cycles.samples=32;s.cycles.use_denoising=True
s.cycles.device='CPU'
s.render.resolution_x=1440;s.render.resolution_y=900;s.render.resolution_percentage=100
s.render.image_settings.file_format='PNG';s.render.image_settings.color_mode='RGBA'
s.render.film_transparent=True
s.view_settings.view_transform='AgX';s.view_settings.look='AgX - Medium High Contrast'

def aim(ob,target):
    ob.rotation_euler=(Vector(target)-ob.location).to_track_quat('-Z','Y').to_euler()

for name,loc,power,color in [('Key',(-3,-6,9),1550,(.94,.96,1)),
                              ('Fill',(5,4,8),1150,(.82,.87,.96)),
                              ('Underside',(0,-4,-8),1000,(.94,.96,1))]:
    data=bpy.data.lights.new(name,'AREA');data.energy=power;data.color=color;data.shape='DISK';data.size=8
    ob=bpy.data.objects.new(name,data);s.collection.objects.link(ob);ob.location=loc;aim(ob,(0,0,0))
data=bpy.data.cameras.new('Roof review');data.type='ORTHO';data.ortho_scale=12.6
camera=bpy.data.objects.new('Roof review',data);s.collection.objects.link(camera);s.camera=camera
for name,loc,target in [('roof',(10,-18,10),(0,0,0)),
                        ('roof-underside',(10,-18,-10),(0,0,-.2))]:
    camera.location=loc;aim(camera,target)
    s.render.filepath=str(out/(name+'.png'))
    bpy.ops.render.render(write_still=True)
print('ROOF REVIEW COMPLETE')
