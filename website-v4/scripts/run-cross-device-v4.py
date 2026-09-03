import json
import os
import subprocess
import sys
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
CASE_DIR=ROOT/'verification/v4-cross-device/cases'
REPORT=ROOT/'verification/v4-cross-device/cross-device-report.json'
CASES=[
 'chromium-desktop-1440x900','chromium-desktop-1366x768','chromium-desktop-1920x1080','chromium-desktop-csszoom125',
 'chromium-iphone-like-390x844','chromium-iphone-small-320x568','chromium-android-360x800','chromium-android-large-430x932',
 'chromium-tablet-768x1024','chromium-mobile-landscape-844x390','chromium-poster-fallback-390x844'
]
CASE_DIR.mkdir(parents=True,exist_ok=True)
for old in CASE_DIR.glob('*.json'): old.unlink()
process_failures=[]
for name in CASES:
 env={**os.environ,'V4_CASE':name}
 try:
  result=subprocess.run([sys.executable,str(ROOT/'scripts/cross-device-one-v4.py')],cwd=ROOT,env=env,timeout=50,check=False)
  if result.returncode not in (0,1): process_failures.append(f'{name}: process exit {result.returncode}')
 except subprocess.TimeoutExpired:
  process_failures.append(f'{name}: process timeout')
 if sys.platform.startswith('linux'):
  subprocess.run(['pkill','-9','chromium'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,check=False)

cases={}; failures=list(process_failures)
for p in sorted(CASE_DIR.glob('*.json')):
 d=json.loads(p.read_text())
 cases[d['name']]=d['data']; failures.extend(d.get('failures',[]))
missing=[x for x in CASES if x not in cases]
failures.extend(f'{x}: no result file' for x in missing)
report={
 'attempted':True,'engine':'Chromium via Playwright',
 'method':'Built dist loaded with all same-origin assets and API fixtures routed locally; MP4 byte-range enabled',
 'physicalDeviceTesting':False,
 'limitations':['No physical iPhone/iPad or Android hardware','iOS/Android cases are Chromium UA/touch/DPR/viewport emulation, not Safari/WebKit or Samsung Internet','LINE/Instagram/Facebook in-app browsers require real-device acceptance'],
 'caseCount':len(CASES),'passedCaseCount':len(CASES)-len({f.split(':',1)[0] for f in failures}),'failureCount':len(failures),'failures':failures,'cases':cases
}
REPORT.parent.mkdir(parents=True,exist_ok=True); REPORT.write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps({'caseCount':report['caseCount'],'passed':report['passedCaseCount'],'failures':report['failureCount']},ensure_ascii=False))
raise SystemExit(1 if failures else 0)
