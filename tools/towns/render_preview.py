#!/usr/bin/env python3
"""Render an actual geometry review board; never edits supplied asset images."""
import json
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont

ROOT=Path(__file__).resolve().parents[2]


def render(destination:Path)->None:
    canvas=Image.new('RGB',(1560,900),'#f5f1e5');draw=ImageDraw.Draw(canvas)
    font_path='/System/Library/Fonts/Supplemental/Arial.ttf'
    title=ImageFont.truetype(font_path,24);label=ImageFont.truetype(font_path,16)
    draw.text((35,20),'PU Town · actual seeded layouts and authoritative footprints',font=title,fill='#243b2b')
    for index,mid in enumerate(('woodland','market')):
        data=json.loads((ROOT/'towns'/mid/'layout.json').read_text())
        report=json.loads((ROOT/'towns'/mid/'reachability.json').read_text())
        scale=min(710/data['width'],710/data['height']);ox=35+index*770;oy=100
        def xy(p):return (ox+p['x']*scale,oy+p['y']*scale)
        draw.rectangle((ox,oy,ox+data['width']*scale,oy+data['height']*scale),
            fill='#b5c985' if mid=='woodland' else '#d1ca9e',outline='#73835a',width=2)
        for district in data['districts']:
            draw.line([xy(p) for p in district['points']]+[xy(district['points'][0])],fill='#a1b276',width=1)
        for route in data['routes']:
            draw.line([xy(p) for p in route['points']],fill='#bd976a',width=round(route['width']*scale),joint='curve')
        for v in data['vegetation']:
            x,y=xy(v);r=(70 if v['kind'] in ('broadleaf','pine') else 30)*v['scale']*scale
            draw.ellipse((x-r,y-r,x+r,y+r),fill='#456640' if v['kind'] in ('broadleaf','pine') else '#778757')
        for b in data['buildings']:
            x,y=xy(b);w,h=b['width']*scale,b['height']*scale
            draw.rectangle((x,y,x+w,y+h),fill='#af704e' if b['variant']=='cottage' else '#856146',outline='#514934',width=2)
            draw.line((x+w/2,y,x+w/2,y+h),fill='#764b39',width=1)
        m=data['meeting'];x,y=xy(m);rx,ry=405*scale,280*scale
        draw.ellipse((x-rx,y-ry,x+rx,y+ry),fill='#e3d4a0',outline='#947b52',width=2)
        for seat in m['seats']:
            x,y=xy(seat);r=25*scale;draw.ellipse((x-r,y-r,x+r,y+r),fill='#715442')
        for landmark in data['landmarks']:
            x,y=xy(landmark['entry']);draw.ellipse((x-4,y-4,x+4,y+4),fill='#276079')
        worst=max((r for r in report['routes'] if r['public']),key=lambda r:r['distance'])
        draw.line([xy(p) for p in worst['points']],fill='#276079',width=2)
        draw.text((ox,65),data['name'],font=title,fill='#243b2b')
        draw.text((ox,825),f'{len(data["buildings"])} buildings · {len(data["districts"])} source wards · {report["maximumMeetingTravelSeconds"]}s outward',font=label,fill='#243b2b')
        draw.text((ox,850),f'Watabou seed {data["provenance"]["seed"]} · blue: verified longest public walking route',font=label,fill='#49614d')
    destination.parent.mkdir(parents=True,exist_ok=True);canvas.save(destination)


if __name__=='__main__':render(ROOT/'towns/layout-review.png')
