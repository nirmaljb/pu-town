from PIL import Image
from lib import SM
import os
im=Image.open(os.path.join(SM,'[A]Water_pipo.png')).convert('RGBA')
def a(t,x,y):
    c,r=t%8,t//8
    return im.getpixel((c*32+x, r*32+y))[3]>0
# bits: N=1,E=2,S=4,W=8,NE=16,SE=32,SW=64,NW=128
def sig(t):
    N=a(t,16,0);E=a(t,31,16);S=a(t,16,31);W=a(t,0,16)
    m=N|E<<1|S<<2|W<<3
    if N and E and a(t,31,0): m|=16
    if S and E and a(t,31,31): m|=32
    if S and W and a(t,0,31): m|=64
    if N and W and a(t,0,0): m|=128
    return m
LAYOUT={}
for t in range(47):
    s=sig(t)
    if s in LAYOUT: print('dup',t,s,LAYOUT[s])
    LAYOUT[s]=t
if __name__=='__main__':
    print(len(LAYOUT)); print(LAYOUT)
