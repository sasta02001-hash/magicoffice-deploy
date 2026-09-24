#!/usr/bin/env python3
"""Reproduce the approved VX masks from hash-verified sources; never uploads.

python render-privacy.py --origin https://vxsagittarius.vercel.app --output /tmp/vx-privacy --rules privacy-plan.json
Requires Python 3, numpy, opencv-python-headless and ffmpeg/ffprobe.
Only the 24 approved films are accepted. New source bytes fail closed for review.
"""
import argparse
from fractions import Fraction
import hashlib
import json
import math
from pathlib import Path
import shutil
import subprocess
import tempfile
import urllib.request
from urllib.parse import urlsplit

import cv2
import numpy as np


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def probe(path):
    return json.loads(subprocess.check_output([
        'ffprobe', '-v', 'error', '-count_frames', '-show_streams', '-show_format',
        '-of', 'json', str(path)]))


def interp(points, frame):
    values = np.asarray(points, float)
    return [float(np.interp(frame, values[:, 0], values[:, i])) for i in range(1, 5)]


def blur(frame, boxes):
    height, width = frame.shape[:2]
    for x, y, bw, bh in boxes:
        x0, y0 = max(0, int(x)), max(0, int(y))
        x1, y1 = min(width, int(math.ceil(x + bw))), min(height, int(math.ceil(y + bh)))
        if x1 <= x0 or y1 <= y0:
            continue
        roi = frame[y0:y1, x0:x1]
        rh, rw = roi.shape[:2]
        softened = cv2.resize(cv2.resize(roi, (4, 5), interpolation=cv2.INTER_AREA),
                              (rw, rh), interpolation=cv2.INTER_CUBIC)
        softened = cv2.GaussianBlur(softened, (0, 0), max(3, min(rw, rh) * .12))
        yy, xx = np.mgrid[y0:y1, x0:x1]
        distance = (abs((xx-x-bw/2)/(bw*.54))**3 + abs((yy-y-bh/2)/(bh*.54))**3)**(1/3)
        alpha = np.clip((1-distance)/.1, 0, 1).astype(np.float32)[..., None]
        frame[y0:y1, x0:x1] = (roi*(1-alpha) + softened*alpha).astype(np.uint8)
    return frame


def audio_payloads(path, streams):
    result = []
    for index, stream in enumerate(s for s in streams if s['codec_type'] == 'audio'):
        digest = subprocess.check_output([
            'ffmpeg', '-v', 'error', '-i', str(path), '-map', f'0:a:{index}',
            '-c', 'copy', '-f', 'hash', '-hash', 'sha256', '-']).decode().strip()
        result.append({'codec': stream['codec_name'], 'payload': digest})
    return result


def validate(path, expected, source=None):
    info = probe(path)
    video = next(s for s in info['streams'] if s['codec_type'] == 'video')
    for key in ('width', 'height'):
        if video[key] != expected[key]:
            raise RuntimeError(f'{path}: {key} changed')
    if int(video['nb_read_frames']) != expected['frames']:
        raise RuntimeError(f'{path}: frame count changed')
    if abs(float(Fraction(video['avg_frame_rate'])) - expected['fps']) > .001:
        raise RuntimeError(f'{path}: frame rate changed')
    decoded = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(path), '-f', 'null', '-'],
                             capture_output=True, text=True)
    if decoded.returncode or decoded.stderr.strip():
        raise RuntimeError(f'{path}: decode validation failed: {decoded.stderr[:300]}')
    if source:
        old = probe(source)
        if audio_payloads(path, info['streams']) != audio_payloads(source, old['streams']):
            raise RuntimeError(f'{path}: audio changed')
    return {'bytes': path.stat().st_size, 'sha256': sha(path), 'frames': expected['frames'],
            'width': expected['width'], 'height': expected['height'], 'validated': True}


def render(wid, config, masks, source_root, output_root):
    expected, audit = config['source'], config['audit']
    source = source_root/'assets/works'/wid/'film.mp4'
    destination = output_root/'assets/works'/wid/'film.mp4'
    destination.parent.mkdir(parents=True, exist_ok=True)
    approved_passthrough = expected.get('allowApprovedPassthrough', True)
    if approved_passthrough and destination.exists() and sha(destination) == expected['sha256']:
        return {'id': wid, 'mode': 'existing-approved', **validate(destination, expected)}
    if not source.is_file():
        raise RuntimeError(f'{wid}: missing source')
    source_hash = sha(source)
    if approved_passthrough and source_hash == expected['sha256']:
        shutil.copy2(source, destination)
        return {'id': wid, 'mode': 'copy-approved', **validate(destination, expected)}
    if source_hash != expected['originalSha256']:
        raise RuntimeError(f'{wid}: unrecognized source SHA; review required')
    if expected.get('refinementRequired', False):
        raise RuntimeError(f'{wid}: regenerate with the hair-aware refinement review; legacy masks would regress the approved result')
    # Verify full source decoding and geometry before reusing tracked masks.
    validate(source, expected)
    width, height, fps = audit['width'], audit['height'], audit['fps']
    tracks = [track for track in audit['tracks'] if track['id'] in masks['tracks'].get(wid, [])]
    temp = destination.with_name('film.building.mp4')
    command = ['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'bgr24',
               '-s', f'{width}x{height}', '-r', str(fps), '-i', 'pipe:0', '-i', str(source),
               '-map', '0:v:0', '-map', '1:a?', '-c:v', 'libx264', '-preset', 'medium',
               '-crf', '20', '-threads', '2', '-pix_fmt', 'yuv420p', '-c:a', 'copy',
               '-movflags', '+faststart', str(temp)]
    cap = cv2.VideoCapture(str(source))
    process = subprocess.Popen(command, stdin=subprocess.PIPE)
    index = 0
    try:
        while True:
            ok, frame = cap.read()
            if not ok:
                break
            boxes = []
            for track in tracks:
                points = track['points']
                if wid == '025' and index >= 298:
                    continue
                if points[0][0]-7 <= index <= points[-1][0]+7:
                    x, y, bw, bh = interp(points, index)
                    boxes.append([x-.12*bw, y-.06*bh, bw*1.24, bh*1.15])
            for points in masks['manual'].get(wid, []):
                if points[0][0]-.05 <= index/fps <= points[-1][0]+.05:
                    x0, y0, x1, y1 = interp(points, index/fps)
                    boxes.append([x0*width, y0*height, (x1-x0)*width, (y1-y0)*height])
            process.stdin.write(blur(frame, boxes).tobytes())
            index += 1
        process.stdin.close()
        if process.wait() or index != audit['frames']:
            raise RuntimeError(f'{wid}: incomplete render')
        proof = validate(temp, expected, source)
        temp.replace(destination)
        return {'id': wid, 'mode': 'rendered', 'sourceSha256': source_hash,
                'matches20260918': proof['sha256'] == expected['sha256'], **proof}
    finally:
        cap.release()
        if process.poll() is None:
            process.kill()
            process.wait()
        temp.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, help='Existing verified local source tree')
    parser.add_argument('--origin', help='Public VX origin used when --source is omitted')
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--rules', type=Path, required=True)
    parser.add_argument('--ids', nargs='+', help='Optional subset of approved work IDs')
    args = parser.parse_args()
    if args.source and args.source.resolve() == args.output.resolve():
        parser.error('source and output must differ')
    if bool(args.source) == bool(args.origin):
        parser.error('specify exactly one of --source or --origin')
    if args.origin and args.origin.rstrip('/') != 'https://vxsagittarius.vercel.app':
        parser.error('only the approved public VX origin is supported')
    config = json.loads(args.rules.read_text())
    ids = args.ids or sorted(config['works'])
    if any(wid not in config['works'] for wid in ids):
        parser.error('unknown work ID')
    cv2.setNumThreads(1)
    proofs = []
    with tempfile.TemporaryDirectory(prefix='vx-privacy-source-') as temporary:
        source = args.source or Path(temporary)
        for wid in ids:
            if args.origin:
                url = args.origin.rstrip('/')+'/assets/works/'+wid+'/film.mp4'
                request = urllib.request.Request(url, headers={'User-Agent':'VX-Privacy-Repair/1.0'})
                with urllib.request.urlopen(request, timeout=60) as response:
                    final = urlsplit(response.url)
                    if final.scheme != 'https' or final.netloc != 'vxsagittarius.vercel.app':
                        raise RuntimeError(f'{wid}: unexpected source redirect')
                    if 'video/mp4' not in response.headers.get('Content-Type', ''):
                        raise RuntimeError(f'{wid}: source is not video/mp4')
                    data = response.read(64*1024*1024+1)
                if len(data) > 64*1024*1024:
                    raise RuntimeError(f'{wid}: excessive source size')
                expected = config['works'][wid]['source']
                known_hashes = [expected['originalSha256']]
                if expected.get('allowApprovedPassthrough', True):
                    known_hashes.append(expected['sha256'])
                if hashlib.sha256(data).hexdigest() not in known_hashes:
                    raise RuntimeError(f'{wid}: public source changed; review required')
                path = source/'assets/works'/wid/'film.mp4'
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(data)
            result = render(wid, config['works'][wid], config['masks'], source, args.output)
            result['path'] = f'assets/works/{wid}/film.mp4'
            proofs.append(result)
            print(json.dumps(result), flush=True)
    (args.output/'privacy-validation.json').write_text(json.dumps(proofs, indent=2)+'\n')
    (args.output/'assets.json').write_text(json.dumps({'schemaVersion':1,'assets':proofs}, indent=2)+'\n')


if __name__ == '__main__':
    main()
