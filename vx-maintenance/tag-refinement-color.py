"""Tag the rendered BT.601 matrix with original BT.709 primaries/transfer.

OpenCV decodes originals to BGR; ffmpeg's raw BGR -> YUV conversion uses the
BT.601 matrix. Add the matching explicit VUI/container tags, without encoding,
then require identical decoded BGR pixels, geometry and copied audio payloads.
"""
import hashlib,json,subprocess,sys
from pathlib import Path

root=Path(sys.argv[1]);manifest_path=root/'assets.json'
manifest=json.loads(manifest_path.read_text())
assert 'reviewedAssets' not in manifest,'Already normalized; do not repeat'
manifest['reviewedAssets']=json.loads(json.dumps(manifest['assets']))
proofs=[]

def probe(p):
    return json.loads(subprocess.check_output(['ffprobe','-v','error','-count_frames','-show_streams','-of','json',str(p)]))['streams']
def payload(p,stream,decode=False):
    args=['ffmpeg','-v','error','-i',str(p),'-map',stream]
    args+=['-pix_fmt','bgr24'] if decode else ['-c','copy']
    return subprocess.check_output(args+['-f','hash','-hash','sha256','-']).decode().strip()
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()

for asset in manifest['assets']:
    assert asset['path']==f"assets/works/{asset['id']}/film.mp4"
    p=root/asset['path'];assert sha(p)==asset['sha256'],'Unreviewed input bytes'
    before=probe(p);video=next(s for s in before if s['codec_type']=='video');assert video['codec_name']=='h264'
    rgb_before=payload(p,'0:v:0',True)
    audio_before=[payload(p,f'0:a:{i}') for i,s in enumerate(s for s in before if s['codec_type']=='audio')]
    temp=p.with_name('color-tagging.mp4')
    subprocess.run(['ffmpeg','-v','error','-y','-i',str(p),'-map','0','-c','copy',
        '-bsf:v','h264_metadata=matrix_coefficients=6:colour_primaries=1:transfer_characteristics=1:video_full_range_flag=0',
        '-colorspace','smpte170m','-color_primaries','bt709','-color_trc','bt709','-color_range','tv',
        '-movflags','+faststart',str(temp)],check=True)
    after=probe(temp);new_video=next(s for s in after if s['codec_type']=='video')
    for key in ['width','height','nb_read_frames','avg_frame_rate']:assert video[key]==new_video[key]
    rgb_after=payload(temp,'0:v:0',True);assert rgb_before==rgb_after,'Color tagging changed decoded pixels'
    audio_after=[payload(temp,f'0:a:{i}') for i,s in enumerate(s for s in after if s['codec_type']=='audio')]
    assert audio_before==audio_after,'Color tagging changed audio'
    proof={'id':asset['id'],'inputSha256':asset['sha256'],'outputSha256':sha(temp),
        'decodedPixelHashBefore':rgb_before,'decodedPixelHashAfter':rgb_after,'audioUnchanged':True,'geometryUnchanged':True}
    temp.replace(p);asset['sha256']=proof['outputSha256'];asset['bytes']=p.stat().st_size;proofs.append(proof)
manifest['colorNormalization']=proofs
manifest_path.write_text(json.dumps(manifest,indent=2)+'\n')
Path('vx-maintenance/refinement-normalization.json').write_text(json.dumps(proofs,indent=2)+'\n')
print(json.dumps({'normalized':len(proofs),'decodedPixelsIdentical':True,'reencoded':False,'audioUnchanged':True}))
