#!/usr/bin/env python3
"""Render reviewed hair-aware masks from exact original sources. Never publishes."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import time

import cv2
import numpy as np

HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('refine',HERE/'refine-masks.py')
r=importlib.util.module_from_spec(spec);spec.loader.exec_module(r)
MODEL_SHA='0d9bd318e46987c3bdbfacae9e2c0f461cae1c6ac6ea6d43bbe541a91727e33f'

def render(wid,plan,source_root,output,parser):
    config=plan['works'][wid];expected=config['source'];audit=config['audit']
    source=source_root/'assets/works'/wid/'film.mp4'
    if r.legacy.sha(source)!=expected['originalSha256']:
        raise RuntimeError(f'{wid}: changed original; fresh review required')
    r.legacy.validate(source,expected)
    dest=output/'assets/works'/wid/'film.mp4';dest.parent.mkdir(parents=True,exist_ok=True)
    tmp=dest.with_name('film.building.mp4')
    width,height,fps=audit['width'],audit['height'],audit['fps']
    command=['ffmpeg','-v','error','-y','-f','rawvideo','-pix_fmt','bgr24','-s',f'{width}x{height}',
        '-r',str(fps),'-i','pipe:0','-i',str(source),'-map','0:v:0','-map','1:a?',
        '-c:v','libx264','-preset','medium','-crf','17','-threads','2','-pix_fmt','yuv420p',
        '-c:a','copy','-movflags','+faststart',str(tmp)]
    cap=cv2.VideoCapture(str(source));process=subprocess.Popen(command,stdin=subprocess.PIPE)
    index=0;proofs=[];contacts=[];started=time.time()
    try:
        while True:
            ok,frame=cap.read()
            if not ok:break
            boxes=r.boxes_for(plan,wid,index)
            if boxes:
                result,alpha,labels,regions=r.apply(frame,boxes,parser,eyes_only=wid=='032',temporal_support=wid=='026',hair_priority=wid=='017')
                proofs.append({'frame':index,'regions':regions})
                if index%15==0 or index==expected['frames']-1:
                    thumb=cv2.resize(result,(216,384))
                    cv2.putText(thumb,f'{wid} / {index}',(8,22),cv2.FONT_HERSHEY_SIMPLEX,.5,(255,255,255),2)
                    contacts.append(thumb)
            else:result=frame
            process.stdin.write(result.tobytes());index+=1
        process.stdin.close()
        if process.wait() or index!=expected['frames']:raise RuntimeError(f'{wid}: incomplete render')
        proof=r.legacy.validate(tmp,expected,source);tmp.replace(dest)
        review=output/'review';review.mkdir(exist_ok=True,parents=True)
        (review/f'{wid}-mask-audit.json').write_text(json.dumps(proofs,separators=(',',':'))+'\n')
        if contacts:
            while len(contacts)%4:contacts.append(np.zeros_like(contacts[0]))
            sheet=np.vstack([np.hstack(contacts[n:n+4]) for n in range(0,len(contacts),4)])
            cv2.imwrite(str(review/f'{wid}-contact.jpg'),sheet,[cv2.IMWRITE_JPEG_QUALITY,92])
        return {'id':wid,'path':f'assets/works/{wid}/film.mp4','sourceSha256':expected['originalSha256'],
                'mode':'hair-aware-soft-refinement','fps':fps,'audioUnchanged':True,
                'maskedFrames':len(proofs),'seconds':round(time.time()-started,2),**proof}
    finally:
        cap.release()
        if process.poll() is None:process.kill();process.wait()
        tmp.unlink(missing_ok=True)

def main():
    p=argparse.ArgumentParser();p.add_argument('--source',type=Path,required=True);p.add_argument('--output',type=Path,required=True)
    p.add_argument('--model',type=Path,required=True);p.add_argument('--ids',nargs='+');p.add_argument('--keep-existing',action='store_true');a=p.parse_args()
    assert a.source.resolve()!=a.output.resolve()
    assert hashlib.sha256(a.model.read_bytes()).hexdigest()==MODEL_SHA,'Model identity mismatch'
    cv2.setNumThreads(1);plan=json.loads((HERE/'privacy-plan.json').read_text());parser=r.Parser(a.model)
    ids=a.ids or sorted(plan['works']);assert all(i in plan['works'] for i in ids)
    assets=[]
    if a.keep_existing:
        existing=json.loads((a.output/'assets.json').read_text())
        assert existing['algorithm']=='hair-aware-soft-v2'
        assert sorted(v['id'] for v in existing['assets'])==sorted(plan['works'])
        for asset in existing['assets']:
            assert asset['path']==f"assets/works/{asset['id']}/film.mp4"
            assert asset['sourceSha256']==plan['works'][asset['id']]['source']['originalSha256']
            assert r.legacy.sha(a.output/asset['path'])==asset['sha256']
            if asset['id'] not in ids:assets.append(asset)
    for wid in ids:
        result=render(wid,plan,a.source,a.output,parser);assets.append(result);print(json.dumps(result),flush=True)
    assets.sort(key=lambda asset:asset['id'])
    (a.output/'assets.json').write_text(json.dumps({'schemaVersion':1,'algorithm':'hair-aware-soft-v2','assets':assets},indent=2)+'\n')
    (a.output/'privacy-validation.json').write_text(json.dumps(assets,indent=2)+'\n')

if __name__=='__main__':main()
