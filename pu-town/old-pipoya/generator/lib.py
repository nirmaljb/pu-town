import re, os
from PIL import Image
SM = r"D:/pu-town map/Pipoya RPG Tileset 32x32/Pipoya RPG Tileset 32x32/SampleMap"
TS = [(1,'[A]WaterFall_pipo.png',32),(577,'[Base]BaseChip_pipo.png',8),(1641,'[A]Grass_pipo.png',8),(2169,'[A]Water_pipo.png',64),(5241,'[A]Flower_pipo.png',8)]
_imgs={}
def tile_img(gid):
    gid &= 0x1FFFFFFF
    for first,f,cols in reversed(TS):
        if gid>=first:
            if f not in _imgs: _imgs[f]=Image.open(os.path.join(SM,f)).convert('RGBA')
            i=gid-first; return _imgs[f].crop(((i%cols)*32,(i//cols)*32,(i%cols)*32+32,(i//cols)*32+32))
def load_sample():
    s=open(os.path.join(SM,'samplemap.tmx')).read()
    layers={}
    for m in re.finditer(r'<layer id="\d+" name="([^"]+)" width="(\d+)" height="(\d+)">\s*<data encoding="csv">(.*?)</data>',s,re.S):
        w,h=int(m[2]),int(m[3]); v=[int(x) for x in m[4].replace('\n','').split(',') if x.strip()]
        layers[m[1]]=[v[r*w:(r+1)*w] for r in range(h)]
    return layers
def render(layers, x0=0,y0=0,x1=None,y1=None, scale=1):
    L=list(layers.values()) if isinstance(layers,dict) else layers
    h=len(L[0]); w=len(L[0][0]); x1=x1 or w; y1=y1 or h
    im=Image.new('RGBA',((x1-x0)*32,(y1-y0)*32),(0,0,0,255))
    for lay in L:
        for y in range(y0,y1):
            for x in range(x0,x1):
                g=lay[y][x]
                if g: im.alpha_composite(tile_img(g),((x-x0)*32,(y-y0)*32))
    if scale!=1: im=im.resize((int(im.width*scale),int(im.height*scale)))
    return im
