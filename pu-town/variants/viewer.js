const configs={village:{title:'Sunwater Village',description:'Orchards, riverside homes and furnished village gathering rooms.'},horror:{title:'Blackthorn Hollow',description:'An abandoned abbey, infirmary and refuge among restless woodland.'},cyberpunk:{title:'Neon Ward',description:'Neon workshops, hydroponics and control rooms along the canal.'}};
const stage=document.querySelector('#stage'),world=document.querySelector('#world'),canvas=document.querySelector('#motion'),ctx=canvas.getContext('2d');
let scale=.25,x=0,y=0,drag=null,motion=[],images=new Map(),selection=0;
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
function paint(){document.querySelectorAll('.landmark').forEach(label=>{label.hidden=scale<.25&&label.dataset.priority==='detail';label.style.fontSize=Math.max(20,11/scale)+'px'});world.style.transform=`translate(${x}px,${y}px) scale(${scale})`}
function fit(){scale=Math.min(stage.clientWidth/7680,stage.clientHeight/4320);x=(stage.clientWidth-7680*scale)/2;y=(stage.clientHeight-4320*scale)/2;paint()}
function zoom(factor,cx=stage.clientWidth/2,cy=stage.clientHeight/2){const next=Math.max(.06,Math.min(2,scale*factor));x=cx-(cx-x)*next/scale;y=cy-(cy-y)*next/scale;scale=next;paint()}
function focus(px,py,width=900,height=650){const available=stage.clientWidth-(stage.clientWidth>650?285:210);scale=Math.max(.35,Math.min(1.6,available/width,(stage.clientHeight-140)/height));x=available/2-px*scale;y=stage.clientHeight/2-py*scale;paint()}
async function select(theme){
 const revision=++selection,c=configs[theme];
 const [metadata,animations,rooms]=await Promise.all(['collision.json','motion.json','interiors.json'].map(file=>fetch(theme+'/'+file+'?v=interiors').then(r=>r.json())));
 const loaded=new Map();await Promise.all([...new Set(animations.map(o=>o.sheet.image))].map(async file=>{const im=new Image();im.src=theme+'/'+file+'?v=interiors';await im.decode();loaded.set(file,im)}));
 if(revision!==selection)return;motion=animations;images=loaded;
 document.querySelector('#map').src=theme+'/base-map.png?v=interiors';document.querySelector('#map').alt=c.title+' map';document.querySelector('#title').textContent=c.title;document.querySelector('#description').textContent=c.description;
 document.querySelector('#download').href=theme+'/map.json';document.querySelectorAll('[data-theme]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.theme===theme)));
 const labels=document.querySelector('#labels'),places=document.querySelector('#places'),indoors=document.querySelector('#rooms');labels.replaceChildren();places.replaceChildren();indoors.replaceChildren();
 metadata.tasks.forEach((p,i)=>{const label=document.createElement('span');label.className='landmark';label.dataset.priority=theme==='village'&&i<14?'detail':'major';label.textContent=p.name;label.style.left=p.x+'px';label.style.top=p.y+'px';labels.append(label);const button=document.createElement('button');button.textContent=p.name;button.onclick=()=>focus(p.x,p.y);places.append(button)});
 rooms.forEach(r=>{const button=document.createElement('button');button.textContent=r.name;button.onclick=()=>focus(r.x+r.width/2,r.y+r.height/2,r.width+140,r.height+140);indoors.append(button)});
 document.querySelector('#room-count').textContent=rooms.length+' furnished interiors';document.querySelector('#motion-count').textContent=animations.length+' animated scenery elements';document.querySelector('.controls').scrollTop=0;fit();
}
let lastPaint=0;
function animate(time){
 if(time-lastPaint<50){requestAnimationFrame(animate);return}lastPaint=time;
 if(canvas.width!==stage.clientWidth||canvas.height!==stage.clientHeight){canvas.width=stage.clientWidth;canvas.height=stage.clientHeight}
 ctx.clearRect(0,0,canvas.width,canvas.height);ctx.imageSmoothingEnabled=true;
 for(const [i,o] of motion.entries()){
  const left=x+o.x*scale,top=y+(o.y-o.height)*scale,w=o.width*scale,h=o.height*scale;
  if(left+w<0||top+h<0||left>canvas.width||top>canvas.height)continue;
  const frames=o.sheet.tiles[0].animation,total=frames.reduce((n,f)=>n+f.duration,0);let t=reduced.matches?0:(time+i*137)%total;let frame=frames[0].tileid;
  for(const f of frames){frame=f.tileid;if(t<f.duration)break;t-=f.duration}
  const s=o.sheet;ctx.drawImage(images.get(s.image),(frame%s.columns)*s.tilewidth,Math.floor(frame/s.columns)*s.tileheight,s.tilewidth,s.tileheight,left,top,w,h);
 }
 requestAnimationFrame(animate);
}
document.querySelectorAll('[data-theme]').forEach(b=>b.onclick=()=>select(b.dataset.theme));document.querySelector('#fit').onclick=fit;document.querySelector('#plus').onclick=()=>zoom(1.4);document.querySelector('#minus').onclick=()=>zoom(1/1.4);document.querySelector('#show-labels').onchange=e=>document.querySelector('#labels').hidden=!e.target.checked;
stage.onwheel=e=>{if(e.target.closest('aside'))return;e.preventDefault();const r=stage.getBoundingClientRect();zoom(e.deltaY<0?1.12:1/1.12,e.clientX-r.left,e.clientY-r.top)};
stage.onpointerdown=e=>{if(e.target.closest('aside'))return;drag=[e.clientX,e.clientY,x,y];stage.setPointerCapture(e.pointerId);stage.classList.add('dragging')};stage.onpointermove=e=>{if(!drag)return;x=drag[2]+e.clientX-drag[0];y=drag[3]+e.clientY-drag[1];paint()};stage.onpointerup=stage.onpointercancel=()=>{drag=null;stage.classList.remove('dragging')};
stage.onkeydown=e=>{if(e.target!==stage)return;if(e.key==='+'||e.key==='=')zoom(1.25);else if(e.key==='-')zoom(.8);else if(e.key==='ArrowLeft')x+=60;else if(e.key==='ArrowRight')x-=60;else if(e.key==='ArrowUp')y+=60;else if(e.key==='ArrowDown')y-=60;else return;e.preventDefault();paint()};
window.addEventListener('resize',fit);select('village');requestAnimationFrame(animate);
