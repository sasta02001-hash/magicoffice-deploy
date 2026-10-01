"""Restore hash-pinned published masked media when a review artifact has expired.

No credentials; no publication. Only previously approved, source-bound bytes
are accepted, and all files are fully decoded before use as a focused base.
"""
import argparse, concurrent.futures, hashlib, importlib.util, json
from pathlib import Path
import urllib.request

HERE=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('legacy',HERE/'render-privacy.py')
legacy=importlib.util.module_from_spec(spec);spec.loader.exec_module(legacy)
HOST='https://vxsagittarius-media-privacy-2026091.vercel.app'

def restore(output, revision):
    plan=json.loads((HERE/'privacy-plan.json').read_text())
    with urllib.request.urlopen(HOST+'/privacy-manifest.json',timeout=60) as r:
        manifest=json.load(r)
    assets=manifest['assets']
    digest=hashlib.sha256(json.dumps(assets,separators=(',',':')).encode()).hexdigest()
    assert manifest['revision']==revision==digest,'Published base revision changed'
    assert len(assets)==len(plan['works'])==24
    assert {a['path'] for a in assets}=={f'assets/works/{wid}/film.mp4' for wid in plan['works']}
    def one(asset):
        wid=asset['path'].split('/')[2];source=plan['works'][wid]['source']
        assert asset['sha256']==source['sha256'],'Media does not match reviewed source-bound plan'
        with urllib.request.urlopen(HOST+'/'+asset['path'],timeout=90) as r:
            assert 'video/mp4' in r.headers.get('Content-Type','')
            data=r.read(asset['bytes']+1)
        assert len(data)==asset['bytes'] and hashlib.sha256(data).hexdigest()==asset['sha256']
        p=output/asset['path'];p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(data)
        proof=legacy.validate(p,source)
        return {'id':wid,'path':asset['path'],'sourceSha256':source['originalSha256'],
                'fps':source['fps'],'audioUnchanged':True,'restoredFromProduction':revision,
                'mode':'hash-identical-reviewed-production',**proof}
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        checked=list(pool.map(one,assets))
    checked.sort(key=lambda a:a['id'])
    (output/'assets.json').write_text(json.dumps({'schemaVersion':1,'algorithm':'hair-aware-soft-v2',
        'restoredProductionRevision':revision,'assets':checked},indent=2)+'\n')
    print(json.dumps({'restored':len(checked),'revision':revision,'fullDecode':True}))

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--output',type=Path,required=True);p.add_argument('--revision',required=True)
    args=p.parse_args();restore(args.output,args.revision)
