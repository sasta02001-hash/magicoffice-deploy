#!/usr/bin/env python3
"""Apply only the opening campaign overlay to a current VX source checkout."""
import argparse,hashlib,json,shutil
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('checkout',type=Path);a=p.parse_args()
bundle=Path(__file__).resolve().parent
root=a.checkout.resolve()
for required in ['main/source-manifest.json','catalog/build.mjs','catalog/content/pages/activities/index.html','main/source/index.html']:
 if not (root/required).is_file():raise SystemExit('Missing current source: '+required)
baseline=json.loads((bundle/'baseline.json').read_text())
for name,expected in baseline.items():
 raw=(root/name).read_text().strip().encode()
 if hashlib.sha256(raw).hexdigest()!=expected:raise SystemExit('Source changed; review before applying: '+name)
for source in (bundle/'patch').rglob('*'):
 if source.is_file():
  dest=root/source.relative_to(bundle/'patch');dest.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(source,dest)
manifest_path=root/'main/source-manifest.json'
manifest=json.loads(manifest_path.read_text())
for item in manifest['preservedFiles']:
 if item['path']=='index.html':
  raw=(root/'main/source/index.html').read_bytes();item.update(bytes=len(raw),sha256=hashlib.sha256(raw).hexdigest())
manifest_path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
print('Opening campaign overlay applied; current routing and media preserved.')
