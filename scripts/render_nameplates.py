from PIL import Image,ImageEnhance
from pathlib import Path
import sys,math,subprocess
FPS=48; W,H=430,735

def load_role(d):
 p=Path(d); imgs={}
 for f in p.rglob('*.png'):
  try:
   im=Image.open(f).convert('RGBA')
   if im.size!=(W,H): im=im.resize((W,H),Image.Resampling.LANCZOS)
   imgs[f.stem.upper()]=im
  except: pass
 return imgs

def pick(imgs,*tokens):
 for tok in tokens:
  for k,v in imgs.items():
   if tok in k:return v
 return None

def alpha(im,a):
 if im is None:return None
 if a>=.999:return im
 x=im.copy(); ch=x.getchannel('A').point(lambda p:int(p*max(0,min(1,a)))); x.putalpha(ch); return x

def topdown(im,p):
 if im is None:return None
 p=max(0,min(1,p)); x=im.copy(); a=x.getchannel('A'); m=Image.new('L',(W,H),0); mh=int(H*p)
 if mh>0:m.paste(255,(0,0,W,mh))
 import PIL.ImageChops as IC
 x.putalpha(IC.multiply(a,m)); return x

def put(dst,im,xy=(0,0)):
 if im is not None:dst.alpha_composite(im,xy)

def ramp(t,a,b):return max(0,min(1,(t-a)/(b-a))) if b>a else float(t>=b)

def render(role_dir,outdir):
 imgs=load_role(role_dir); out=Path(outdir);out.mkdir(parents=True,exist_ok=True)
 static=pick(imgs,'PANEL_COMPLETE','MASTER','COMPLETE')
 panel=pick(imgs,'PANEL_BASE_CLEAN','PANEL_BASE')
 uki=pick(imgs,'UKIYOE_REVEAL','UKIYOE')
 frame=pick(imgs,'FRAME_FULL','FRAME')
 bottom=pick(imgs,'BOTTOM_CREST')
 gold=pick(imgs,'BOTTOM_GOLD_ORNAMENT','GOLD_ORNAMENT')
 topcore=pick(imgs,'TOP_CREST_CORE')
 topring=pick(imgs,'TOP_CREST_OUTER_RING','TOP_CREST_RING')
 topglow=pick(imgs,'TOP_CREST_GLOW')
 tl=pick(imgs,'TASSEL_LEFT'); tr=pick(imgs,'TASSEL_RIGHT')
 fans=sorted([(k,v) for k,v in imgs.items() if 'FAN_SLICE_' in k])
 for n in range(192):
  t=n/FPS; c=Image.new('RGBA',(W,H),(0,0,0,0))
  fade=1-ramp(t,3.48,3.92)
  # top crest light aggregation
  put(c,alpha(topglow,(math.sin(min(1,t/.28)*math.pi)*.9)*fade))
  put(c,alpha(topring,ramp(t,.04,.24)*fade)); put(c,alpha(topcore,ramp(t,.08,.28)*fade))
  # downward construction
  put(c,alpha(topdown(panel,ramp(t,.28,.76)),fade))
  put(c,alpha(topdown(uki,ramp(t,.48,.96)),fade))
  put(c,alpha(topdown(frame,ramp(t,.76,1.18)),fade))
  put(c,alpha(bottom,ramp(t,1.06,1.30)*fade));put(c,alpha(gold,ramp(t,1.06,1.30)*fade))
  # fan opens L->R and closes R->L
  if fans:
   if t<1.18:count=0
   elif t<1.62:count=math.ceil(len(fans)*ramp(t,1.18,1.62))
   elif t<3.18:count=len(fans)
   elif t<3.48:count=max(0,len(fans)-math.ceil(len(fans)*ramp(t,3.18,3.48)))
   else:count=0
   for _,im in fans[:count]:put(c,im)
  # tassels fall and settle
  tp=ramp(t,1.40,1.72); off=int((1-tp)*-42)
  put(c,alpha(tl,tp*fade),(0,off));put(c,alpha(tr,tp*fade),(0,off))
  # fallback ensures stable complete hold if component naming differs
  if static is not None and t>=1.72 and t<3.18 and len(imgs)<5:put(c,static)
  c.save(out/f'f_{n:03d}.png')

if __name__=='__main__':render(sys.argv[1],sys.argv[2])
