"""Hair-aware soft privacy masks from the reviewed source tracks.

BiSeNet semantic parsing distinguishes face features from hair; its output is
restricted to the existing reviewed privacy regions. Original source hashes
remain the identity guard. This file never publishes or changes site content.
"""
import argparse
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import time

import cv2
import numpy as np
import onnxruntime as ort
import mediapipe as mp

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('legacy', HERE / 'render-privacy.py')
legacy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(legacy)
FACE = [1, 2, 3, 4, 5, 6, 10, 11, 12, 13]
FEATURES = [2, 3, 4, 5, 6, 10, 11, 12, 13]

class Parser:
    def __init__(self, model):
        opts = ort.SessionOptions()
        opts.intra_op_num_threads = 2
        opts.inter_op_num_threads = 1
        self.session = ort.InferenceSession(str(model), sess_options=opts, providers=['CPUExecutionProvider'])
        self.name = self.session.get_inputs()[0].name
        self.mesh = mp.solutions.face_mesh.FaceMesh(static_image_mode=True, max_num_faces=8, refine_landmarks=True, min_detection_confidence=.2)
        self.previous_gray = None
        self.previous_faces = []
        self.previous_age = 0

    def landmarks(self, frame):
        result=self.mesh.process(cv2.cvtColor(frame,cv2.COLOR_BGR2RGB))
        h,w=frame.shape[:2]
        return [np.array([(p.x*w,p.y*h) for p in face.landmark],np.float32) for face in (result.multi_face_landmarks or [])]

    def parse(self, frame, box):
        h, w = frame.shape[:2]
        x, y, bw, bh = box
        # Include context around the face so parsing can identify the hairline.
        side = max(bw, bh) * 1.1
        cx, cy = x + bw/2, y + bh/2
        pa, pb = int(cx-side/2), int(cy-side/2)
        size = int(math.ceil(side))
        a, b = max(0, pa), max(0, pb)
        c, d = min(w, pa+size), min(h, pb+size)
        if c <= a or d <= b:
            return None
        # Keep the original aspect ratio and face centre at frame edges.
        # Stretching a clipped crop previously made small mirror faces vanish.
        patch = np.full((size,size,3),127,np.uint8)
        patch[b-pb:d-pb,a-pa:c-pa] = frame[b:d,a:c]
        rgb = cv2.cvtColor(cv2.resize(patch, (512,512)), cv2.COLOR_BGR2RGB).astype(np.float32)/255
        rgb = (rgb - np.array([.485,.456,.406],np.float32))/np.array([.229,.224,.225],np.float32)
        out = self.session.run(None,{self.name:rgb.transpose(2,0,1)[None]})[0][0]
        labels = cv2.resize(out.argmax(0).astype(np.uint8), (size,size), interpolation=cv2.INTER_NEAREST)[b-pb:d-pb,a-pa:c-pa]
        # Restrict parsing to the original reviewed face region, without its
        # former 24% blanket enlargement across the hair.
        yy,xx = np.mgrid[b:d,a:c]
        support = ((xx >= x-.03*bw)&(xx <= x+1.03*bw)&(yy >= y-.03*bh)&(yy <= y+1.03*bh))
        mask = (np.isin(labels,FACE)&support).astype(np.uint8)
        hair = labels==17
        feature = np.isin(labels,FEATURES)&support
        # Fill tiny gaps within face skin, while restoring all hair pixels.
        rad=max(1,int(min(bw,bh)*.012))
        kernel=cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(rad*2+1,rad*2+1))
        mask=cv2.morphologyEx(mask,cv2.MORPH_CLOSE,kernel)
        mask[hair]=0
        distance=cv2.distanceTransform(mask,cv2.DIST_L2,5)
        feather=max(3,min(bw,bh)*.28)
        t=np.clip(distance/feather,0,1)
        alpha=t*t*(3-2*t)
        # Keep every parsed identifying feature fully covered, feathering skin
        # around it; no alpha is extended into hair/background.
        if feature.any():
            feature_dist=cv2.distanceTransform((~feature).astype(np.uint8),cv2.DIST_L2,5)
            f=np.clip(1-feature_dist/max(3,min(bw,bh)*.16),0,1)
            f=f*f*(3-2*f)
            alpha=np.maximum(alpha,f*mask)
        alpha[hair]=0
        # Semantic skin classification is unreliable for profiles and tiny
        # reflections. Keep the reviewed region as the privacy safety net,
        # shaped as a broad soft oval, with hair explicitly protected.
        radius=np.sqrt(((xx-x-bw*.5)/(bw*.60))**2+((yy-y-bh*.51)/(bh*.57))**2)
        t=np.clip((1-radius)/.38,0,1)
        oval=t*t*(3-2*t)
        hair_distance=cv2.distanceTransform((~hair).astype(np.uint8),cv2.DIST_L2,5)
        ht=np.clip(hair_distance/max(2,min(bw,bh)*.10),0,1)
        alpha=np.maximum(alpha,oval*ht*ht*(3-2*ht))
        return (a,b,c,d,alpha.astype(np.float32),labels,feature)

def boxes_for(plan,wid,index):
    audit=plan['works'][wid]['audit']; fps=audit['fps']; width=audit['width']; height=audit['height']
    result=[]
    for track in audit['tracks']:
        if track['id'] not in plan['masks']['tracks'].get(wid,[]):continue
        pts=track['points']
        if wid=='025' and index>=298:continue
        if pts[0][0]-7<=index<=pts[-1][0]+7:
            result.append(legacy.interp(pts,index))
    for pts in plan['masks']['manual'].get(wid,[]):
        if pts[0][0]-.05<=index/fps<=pts[-1][0]+.05:
            x0,y0,x1,y1=legacy.interp(pts,index/fps)
            result.append([x0*width,y0*height,(x1-x0)*width,(y1-y0)*height])
    return result

def apply(frame,boxes,parser,eyes_only=False,temporal_support=False,hair_priority=False,profile_core=False):
    h,w=frame.shape[:2]
    output=frame.astype(np.float32)
    combined=np.zeros((h,w),np.float32)
    texture_sum=np.zeros((h,w,3),np.float32)
    texture_weight=np.zeros((h,w),np.float32)
    full_labels=np.zeros((h,w),np.uint8)
    audit=[]
    landmarks=parser.landmarks(frame) if boxes else []
    propagated=[]
    current_gray=cv2.cvtColor(frame,cv2.COLOR_BGR2GRAY) if temporal_support else None
    if temporal_support and parser.previous_gray is not None and parser.previous_age<4:
        for previous in parser.previous_faces:
            points,status,error=cv2.calcOpticalFlowPyrLK(parser.previous_gray,current_gray,previous.astype(np.float32),None,
                winSize=(25,25),maxLevel=3,criteria=(cv2.TERM_CRITERIA_EPS|cv2.TERM_CRITERIA_COUNT,30,.01))
            if points is not None:
                good=(status[:,0]==1)&(error[:,0]<18)
                if np.mean(good)>.35:
                    transform,inliers=cv2.estimateAffinePartial2D(previous[good],points[good],method=cv2.RANSAC,ransacReprojThreshold=2)
                    if transform is not None and float(np.mean(inliers))>.65:
                        tracked=cv2.transform(previous[None].astype(np.float32),transform)[0]
                        if float(np.median(np.linalg.norm(tracked-previous,axis=1)))<30:propagated.append(tracked)
    observed=[]
    used_propagation=False
    for box in boxes:
        r=parser.parse(frame,box)
        if r is None:continue
        a,b,c,d,alpha,labels,features=r
        landmark_mask=np.zeros(alpha.shape,np.uint8)
        landmark_face=np.zeros(alpha.shape,np.uint8)
        x,y,bw,bh=box
        if eyes_only:
            yy,xx=np.mgrid[b:d,a:c]
            radius=np.sqrt(((xx-x-bw*.5)/(bw*.55))**2+((yy-y-bh*.46)/(bh*.19))**2)
            t=np.clip((1-radius)/.40,0,1)
            alpha=t*t*(3-2*t)*(labels!=17)
            features=np.isin(labels,[2,3,4,5])
        local_landmarks=landmarks
        if not any(x-.1*bw<=lm[1,0]<=x+1.1*bw and y-.1*bh<=lm[1,1]<=y+1.1*bh for lm in landmarks):
            crop=frame[b:d,a:c]
            scale=512/max(crop.shape[:2])
            local_landmarks=landmarks+[lm/scale+np.array([a,b]) for lm in parser.landmarks(cv2.resize(crop,None,fx=scale,fy=scale))]
            if not any(x-.1*bw<=lm[1,0]<=x+1.1*bw and y-.1*bh<=lm[1,1]<=y+1.1*bh for lm in local_landmarks):
                side=max(bw,bh)*1.7;cx=x+bw/2;cy=y+bh/2
                ca=max(0,int(cx-side/2));cb=max(0,int(cy-side/2))
                cc=min(w,int(cx+side/2));cd=min(h,int(cy+side/2))
                crop=frame[cb:cd,ca:cc];scale=512/max(crop.shape[:2])
                local_landmarks += [lm/scale+np.array([ca,cb]) for lm in parser.landmarks(cv2.resize(crop,None,fx=scale,fy=scale))]
        matched=[lm for lm in local_landmarks if x-.1*bw<=lm[1,0]<=x+1.1*bw and y-.1*bh<=lm[1,1]<=y+1.1*bh]
        if matched:
            observed.extend(matched)
        elif temporal_support:
            # Brief hair occlusions can defeat both detectors. Carry forward
            # already verified facial features for at most four adjacent frames;
            # LK follows their actual motion instead of widening the whole mask.
            tracked=[lm for lm in propagated if x-.1*bw<=lm[1,0]<=x+1.1*bw and y-.1*bh<=lm[1,1]<=y+1.1*bh]
            local_landmarks+=tracked
            used_propagation=used_propagation or bool(tracked)
        if eyes_only and features.any():
            landmark_mask[features]=1
        for lm in local_landmarks:
            # A landmark face must match the reviewed region, not a new person.
            nx,ny=lm[1]
            if not (x-.1*bw<=nx<=x+1.1*bw and y-.1*bh<=ny<=y+1.1*bh):continue
            oval=[10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109]
            pts=(lm[oval]-np.array([a,b])).round().astype(np.int32)
            cv2.fillPoly(landmark_face,[pts],1)
            groups=[[33,160,158,133,153,144],[362,385,387,263,373,380]]
            if not eyes_only:groups += [[98,97,2,326,327,168],[61,40,37,0,267,270,291,321,314,17,84,91]]
            for ids in groups:
                pts=(lm[list(ids)]-np.array([a,b])).round().astype(np.int32)
                cv2.fillConvexPoly(landmark_mask,cv2.convexHull(pts),1)
        used_profile_core=False
        if profile_core and not landmark_mask.any():
            # 019's reviewed profile turn is missed by both face detectors.
            # Its manually reviewed region locates the exposed nose/mouth on
            # the right side. Keep a compact opaque feature core there.
            center=(int(x+bw*.77-a),int(y+bh*.60-b))
            axes=(max(2,int(bw*.16)),max(2,int(bh*.23)))
            cv2.ellipse(landmark_mask,center,axes,0,0,360,1,-1)
            used_profile_core=True
        if landmark_mask.any():
            landmark_face[labels==17]=0
            distance=cv2.distanceTransform(landmark_face,cv2.DIST_L2,5)
            t=np.clip(distance/max(3,min(bw,bh)*.28),0,1)
            if not eyes_only:alpha=np.maximum(alpha,t*t*(3-2*t))
            # Eyelashes can be labelled as hair by the segmenter; landmarks
            # explicitly cover visible eyes without covering the whole fringe.
            radius=max(2,int(min(bw,bh)*.018))
            landmark_mask=cv2.dilate(landmark_mask,cv2.getStructuringElement(cv2.MORPH_ELLIPSE,(radius*2+1,radius*2+1)))
            dist=cv2.distanceTransform(1-landmark_mask,cv2.DIST_L2,5)
            t=np.clip(1-dist/max(4,min(bw,bh)*.16),0,1)
            if hair_priority:
                hair_distance=cv2.distanceTransform((labels!=17).astype(np.uint8),cv2.DIST_L2,5)
                edge=np.clip(hair_distance/max(2,min(bw,bh)*.035),0,1)
                t*=edge
            alpha=np.maximum(alpha,t*t*(3-2*t))
        fallback=False
        if alpha.max()<.1:
            # Tiny/partially clipped mirror faces can defeat semantic parsing.
            # Retain a compact, feathered feature ellipse within the reviewed
            # face box rather than silently dropping its privacy protection.
            yy,xx=np.mgrid[b:d,a:c]
            radius=np.sqrt(((xx-x-bw*.5)/(bw*.46))**2+((yy-y-bh*.55)/(bh*.43))**2)
            t=np.clip((1-radius)/.32,0,1)
            alpha=t*t*(3-2*t)
            fallback=True
        # Build a wider continuous transition, then composite the hair matte.
        # Feature masking and peripheral softness are separate controls.
        size=min(bw,bh)
        hair=(labels==17).astype(np.uint8)
        hair_gate=cv2.GaussianBlur((1-hair).astype(np.float32),(0,0),max(1,size*.018))
        # Preserve the solid hair interior exactly; a narrow antialiased matte
        # follows wispy edge pixels instead of binary jagged cutouts.
        hair_depth=cv2.distanceTransform(hair,cv2.DIST_L2,5)
        hair_gate[hair_depth>max(2,size*.035)]=0
        core=((landmark_mask>0)|features)&(labels!=17)
        smooth=cv2.GaussianBlur(alpha,(0,0),max(1,size*.045))
        if core.any():
            outside=cv2.distanceTransform((~core).astype(np.uint8),cv2.DIST_L2,5)
            t=np.clip(1-outside/max(6,size*.22),0,1)
            smooth=t*t*(3-2*t)
        alpha=np.clip(smooth*hair_gate,0,1)
        if (eyes_only or temporal_support or profile_core) and landmark_mask.any():
            # Exposed eyelashes are sometimes classified as hair. Keep the
            # reviewed eye/feature core opaque, with a soft local transition.
            distance=cv2.distanceTransform(1-landmark_mask,cv2.DIST_L2,5)
            ramp=np.clip(1-distance/max(6,size*.22),0,1)
            gate=np.maximum(hair_gate,np.exp(-.5*(distance/max(2,size*.045))**2))
            alpha=np.maximum(alpha,ramp*ramp*(3-2*ramp)*gate)
        sigma=max(9,size*.18)
        patch=frame[b:d,a:c].astype(np.float32)
        dims=(max(16,(c-a)//4),max(16,(d-b)//4))
        # Normalized convolution excludes hair colors instead of
        # dragging colored hair into the privacy texture; background remains natural.
        weight=(labels!=17).astype(np.float32)
        weight=np.maximum(weight,core.astype(np.float32))
        if float(weight.sum())<16:weight=(labels!=17).astype(np.float32)
        sw=cv2.resize(weight,dims,interpolation=cv2.INTER_AREA)
        weighted=cv2.resize(patch*weight[...,None],dims,interpolation=cv2.INTER_AREA)
        bwgt=cv2.GaussianBlur(sw,(0,0),sigma/4,borderType=cv2.BORDER_REFLECT101)
        color=cv2.GaussianBlur(weighted,(0,0),sigma/4,borderType=cv2.BORDER_REFLECT101)
        normalized=color/np.maximum(bwgt[...,None],1e-5)
        ordinary=cv2.GaussianBlur(cv2.resize(patch,dims,interpolation=cv2.INTER_AREA),(0,0),sigma/4)
        normalized=np.where((bwgt>.02)[...,None],normalized,ordinary)
        blend=0.0 if eyes_only else .70
        texture=normalized*blend+ordinary*(1-blend)
        soft=cv2.resize(texture,(c-a,d-b),interpolation=cv2.INTER_CUBIC).astype(np.float32)
        # Blend overlapping blur textures continuously before applying the union
        # mask. Picking a different texture at alpha ties created hard color
        # seams across the face despite individually feathered masks.
        texture_sum[b:d,a:c]+=soft*alpha[...,None]
        texture_weight[b:d,a:c]+=alpha
        combined[b:d,a:c]=np.maximum(combined[b:d,a:c],alpha)
        full_labels[b:d,a:c]=np.maximum(full_labels[b:d,a:c],labels)
        audit.append({'box':[round(v,1) for v in box],'alphaPixels':int((alpha>.01).sum()),'featurePixels':int(features.sum()),'featuresFullyMasked':bool(np.all(alpha[features]>.99)) if features.any() else None,'hairMaskedPixels':int(((alpha>.01)&(labels==17)).sum()),'landmarkFeaturePixels':int(landmark_mask.sum()),'fallback':fallback,'reviewedProfileCore':used_profile_core})
    if temporal_support:
        faces=observed or propagated
        parser.previous_faces=[]
        for face in faces:
            if not any(np.linalg.norm(face[1]-saved[1])<20 for saved in parser.previous_faces):parser.previous_faces.append(face)
        parser.previous_gray=current_gray
        parser.previous_age=0 if observed else parser.previous_age+1
        if audit:audit[0]['temporalFeatureSupport']=used_propagation
    texture=texture_sum/np.maximum(texture_weight[...,None],1e-6)
    output=frame*(1-combined[...,None])+texture*combined[...,None]
    return output.clip(0,255).astype(np.uint8), combined, full_labels,audit

def main():
    p=argparse.ArgumentParser();p.add_argument('--id',required=True);p.add_argument('--frame',type=int,default=0);p.add_argument('--model',default=str(HERE.parent/'work/models/resnet34.onnx'));a=p.parse_args()
    plan=json.loads((HERE/'privacy-plan.json').read_text());source=HERE.parent/'work/sources/assets/works'/a.id/'film.mp4'
    cv2.setNumThreads(1)
    if hashlib.sha256(source.read_bytes()).hexdigest()!=plan['works'][a.id]['source']['originalSha256']:raise RuntimeError('Source hash mismatch')
    cap=cv2.VideoCapture(str(source));cap.set(cv2.CAP_PROP_POS_FRAMES,a.frame);ok,frame=cap.read();cap.release()
    if not ok:raise RuntimeError('Frame missing')
    parser=Parser(a.model);t=time.time();boxes=boxes_for(plan,a.id,a.frame);out,alpha,labels,audit=apply(frame,boxes,parser,eyes_only=a.id=='032',hair_priority=a.id=='017',profile_core=a.id=='019' and a.frame>=36)
    oldboxes=[]
    for x,y,w,h in boxes:oldboxes.append([x-.12*w,y-.06*h,w*1.24,h*1.15])
    old=legacy.blur(frame.copy(),oldboxes)
    folder=HERE.parent/'work/review';folder.mkdir(exist_ok=True,parents=True)
    base=folder/f'{a.id}-{a.frame:04d}'
    cv2.imwrite(str(base)+'-new.jpg',out)
    cv2.imwrite(str(base)+'-alpha.png',(alpha*255).astype(np.uint8))
    cv2.imwrite(str(base)+'-labels.png',labels*12)
    contact=np.hstack([cv2.resize(x,(351,640)) for x in [old,out]])
    cv2.imwrite(str(base)+'-compare.jpg',contact)
    print(json.dumps({'id':a.id,'frame':a.frame,'seconds':time.time()-t,'regions':audit}))

if __name__=='__main__':main()
