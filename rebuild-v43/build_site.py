from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
import time
from pathlib import Path
from typing import Iterable

import requests
from PIL import Image

REPO_ROOT = Path(__file__).resolve().parents[1]
SOURCE_ROOT = REPO_ROOT / "rebuild-v43"
SITE_ROOT = Path("/tmp/magicoffice-v43-site")
OFFICIAL = "https://magicoffice.vercel.app"
IMMUTABLE = "https://magicoffice-hwpboyvf0-magicoffice.vercel.app"
RAW_MAIN = "https://raw.githubusercontent.com/sasta02001-hash/magicoffice-deploy/main"
JSDELIVR_OLD = "https://cdn.jsdelivr.net/gh/sasta02001-hash/magicoffice-deploy@new-domain-v1.0.4-menu-cms"
RELEASE = "magicoffice-v4.3-clean-replacement-2026-09-03"

SESSION = requests.Session()
SESSION.headers.update({"User-Agent": "MagicOffice-v4.3-clean-builder/2.0", "Cache-Control": "no-cache"})


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def binary_payload_is_valid(data: bytes, minimum: int) -> bool:
    if len(data) < minimum:
        return False
    head = data[:256].lstrip().lower()
    return not (head.startswith(b"<!doctype html") or head.startswith(b"<html"))


def download(urls: Iterable[str], relative_target: str, minimum: int = 1_000) -> Path:
    target = SITE_ROOT / relative_target
    target.parent.mkdir(parents=True, exist_ok=True)
    errors: list[str] = []
    for url in urls:
        for attempt in range(4):
            try:
                response = SESSION.get(url, timeout=60, allow_redirects=True)
                response.raise_for_status()
                data = response.content
                if not binary_payload_is_valid(data, minimum):
                    raise RuntimeError(f"invalid binary payload ({len(data)} bytes; final={response.url})")
                target.write_bytes(data)
                print(f"DOWNLOADED {relative_target} {len(data)} {url} -> {response.url}")
                return target
            except Exception as exc:  # noqa: BLE001
                errors.append(f"{url}: {exc}")
                time.sleep(0.8 + attempt * 0.8)
    raise RuntimeError(f"Download failed for {relative_target}: {' | '.join(errors[-8:])}")


def old_asset(path_with_query: str) -> list[str]:
    pathname = path_with_query.split("?", 1)[0]
    return [
        f"{OFFICIAL}{path_with_query}",
        f"{JSDELIVR_OLD}{pathname}",
        f"{IMMUTABLE}{path_with_query}",
    ]


def convert_to_webp(source: Path, target: Path, max_size: tuple[int, int] = (1800, 1800)) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    with Image.open(source) as image:
        image.seek(0)
        image = image.convert("RGBA" if "A" in image.getbands() else "RGB")
        image.thumbnail(max_size, Image.Resampling.LANCZOS)
        image.save(target, "WEBP", quality=90, method=6)


def create_mobile_background(desktop: Path, target: Path) -> None:
    with Image.open(desktop) as image:
        image = image.convert("RGB")
        width, height = image.size
        target_ratio = 1000 / 1333
        crop_width = min(width, max(1, round(height * target_ratio)))
        # Preserve the approved brand-side cherry-blossom / sofa composition.
        x0 = max(0, min(width - crop_width, round(width * 0.12)))
        crop = image.crop((x0, 0, x0 + crop_width, height))
        crop = crop.resize((1000, 1333), Image.Resampling.LANCZOS)
        crop.save(target, "WEBP", quality=91, method=6)
    print(f"GENERATED {target.relative_to(SITE_ROOT)} from approved desktop clean scene")


def patch_runtime() -> None:
    app = SITE_ROOT / "assets/app.js"
    text = app.read_text(encoding="utf-8")
    old = """      } catch {
        video.muted = true;
        sound?.setAttribute('aria-pressed', 'false');
        if (sound) sound.textContent = '開啟聲音';
      }"""
    new = """      } catch {
        video.muted = true;
        sound?.setAttribute('aria-pressed', 'false');
        if (sound) sound.textContent = '開啟聲音';
        try { await video.play(); } catch {}
      }"""
    if old not in text:
        raise RuntimeError("video fallback patch marker missing")
    app.write_text(text.replace(old, new, 1), encoding="utf-8")


def make_audio_video() -> None:
    silent = SITE_ROOT / "assets/video/hero-silent.mp4"
    output = SITE_ROOT / "assets/video/hero-trial-12s-with-audio.mp4"
    command = [
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
        "-i", str(silent),
        "-f", "lavfi", "-i", "sine=frequency=174.61:sample_rate=48000:duration=12",
        "-f", "lavfi", "-i", "sine=frequency=261.63:sample_rate=48000:duration=12",
        "-filter_complex", "[1:a]volume=0.12[a1];[2:a]volume=0.07[a2];[a1][a2]amix=inputs=2:normalize=0,lowpass=f=1350,afade=t=in:st=0:d=1.1,afade=t=out:st=10.2:d=1.8[a]",
        "-map", "0:v:0", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "128k",
        "-ar", "48000", "-ac", "2", "-shortest", "-movflags", "+faststart", str(output),
    ]
    subprocess.run(command, check=True)
    silent.unlink()


def verify_images() -> None:
    failures: list[str] = []
    for path in (SITE_ROOT / "assets/images").rglob("*"):
        if not path.is_file():
            continue
        try:
            with Image.open(path) as image:
                image.verify()
        except Exception as exc:  # noqa: BLE001
            failures.append(f"{path.relative_to(SITE_ROOT)}: {exc}")
    if failures:
        raise RuntimeError("Image verification failed: " + " | ".join(failures))


def main() -> None:
    if SITE_ROOT.exists():
        shutil.rmtree(SITE_ROOT)
    shutil.copytree(SOURCE_ROOT, SITE_ROOT, ignore=shutil.ignore_patterns("build_site.py", "test*.mjs"))

    for directory in [
        "assets/images/logo", "assets/images/hero", "assets/images/events", "assets/images/menu",
        "assets/images/venue", "assets/images/roster", "assets/video",
    ]:
        (SITE_ROOT / directory).mkdir(parents=True, exist_ok=True)

    download([f"{RAW_MAIN}/assets/home-hero-preview-v3/magicoffice-home-video-poster-v1.webp"], "assets/images/hero/poster.webp", 40_000)
    desktop = download([f"{RAW_MAIN}/assets/home-clean-scene-desktop-v1/magicoffice-home-clean-scene-desktop-v1.webp"], "assets/images/hero/background-desktop.webp", 100_000)
    create_mobile_background(desktop, SITE_ROOT / "assets/images/hero/background-mobile.webp")
    download(old_asset("/assets/media/05f19666ed49f368.png?v=2072"), "assets/images/logo/logo-gold.png", 10_000)
    download([f"{RAW_MAIN}/assets/production-trial-video/MagicOffice_home_trial_720p_12s_v1.mp4"], "assets/video/hero-silent.mp4", 2_500_000)

    sources = {
        "assets/images/events/heartbeat.webp": "/assets/media/heartbeat-support-v7.png?v=20260830-v7",
        "assets/images/events/mid-autumn.webp": "/assets/media/aa7f2899b9a883f5.webp?v=2072",
        "assets/images/events/yuzu.webp": "/assets/media/a1b97912e03ddf75.webp?v=2072",
        "assets/images/events/summer.webp": "/assets/media/38f7487b4a48705b.webp?v=2072",
        "assets/images/events/jubi.webp": "/assets/media/183eaf19e84ad365.webp?v=2072",
        "assets/images/menu/cafe.webp": "/assets/media/441b778dda048206.webp?v=2072",
        "assets/images/menu/bar.webp": "/assets/media/f12cf40a97634cc9.webp?v=2072",
        "assets/images/menu/collection.webp": "/assets/media/d9961b8b48fdb587.webp?v=2072",
        "assets/images/venue/sakura.webp": "/assets/media/d878f9472706fdbe.webp?v=2072",
        "assets/images/venue/cafe.webp": "/assets/media/49acafbeb1e4b6bb.webp?v=2072",
        "assets/images/venue/bar.webp": "/assets/media/4739c5c2017c4c0e.webp?v=2072",
        "assets/images/roster/mibao.webp": "/assets/media/46a75e190baad8e8.webp?v=2072",
        "assets/images/roster/yuzu.webp": "/assets/media/e22350b8ec2d748a.webp?v=2072",
        "assets/images/roster/jubi.webp": "/assets/media/9cf5f3c7c8e43450.webp?v=2072",
        "assets/images/roster/cc.webp": "/assets/media/815c2fdfd2a254ce.webp?v=2072",
        "assets/images/roster/lele.webp": "/assets/media/1d6e303714642bf6.webp?v=2072",
        "assets/images/roster/cara.webp": "/assets/media/6abf49f3aab3c507.webp?v=2072",
        "assets/images/roster/medamayaki.webp": "/assets/media/3241306c93000ad3.webp?v=2072",
        "assets/images/roster/sakuri.webp": "/assets/media/8f1e2635714effb9.webp?v=2072",
        "assets/images/roster/hekiru.webp": "/assets/media/617f58b1207050e6.webp?v=2072",
        "assets/images/roster/rumei.webp": "/assets/media/2d5ed350d26c050b.webp?v=2072",
        "assets/images/roster/naya.webp": "/assets/media/4fd4c223e064c15d.webp?v=2072",
        "assets/images/roster/sakuma.webp": "/assets/media/f2097a926bdf48b3.webp?v=2072",
        "assets/images/roster/nana.webp": "/assets/media/e404ebb20f7273f8.webp?v=2072",
        "assets/images/roster/mona.webp": "/assets/media/59f9acb8861a6595.webp?v=2072",
        "assets/images/roster/kokoro.webp": "/assets/media/4bf65583e3739d3f.webp?v=2072",
        "assets/images/roster/mika.webp": "/assets/media/d9800fa21c1b6e2e.webp?v=2072",
    }
    for target_relative, source_path in sources.items():
        temporary = download(old_asset(source_path), f"{target_relative}.source", 8_000)
        convert_to_webp(temporary, SITE_ROOT / target_relative)
        temporary.unlink()

    patch_runtime()
    make_audio_video()
    verify_images()

    index = (SITE_ROOT / "index.html").read_text(encoding="utf-8")
    required = [RELEASE, "魔幻姶仕社", "id=\"event-hub\"", "id=\"menu\"", "id=\"roster\"", "id=\"schedule\""]
    missing = [value for value in required if value not in index]
    if missing:
        raise RuntimeError("Required HTML markers missing: " + ", ".join(missing))

    roster_count = len(list((SITE_ROOT / "assets/images/roster").glob("*.webp")))
    event_count = len(list((SITE_ROOT / "assets/images/events").glob("*.webp")))
    menu_count = len(list((SITE_ROOT / "assets/images/menu").glob("*.webp")))
    if (roster_count, event_count, menu_count) != (16, 5, 3):
        raise RuntimeError(f"Asset counts invalid: roster={roster_count}, events={event_count}, menu={menu_count}")

    manifest = {
        "release": RELEASE,
        "replacementType": "clean full-site replacement",
        "oldSitePatched": False,
        "files": {},
    }
    for path in sorted(SITE_ROOT.rglob("*")):
        if path.is_file() and ".vercel" not in path.parts:
            manifest["files"][str(path.relative_to(SITE_ROOT))] = {"bytes": path.stat().st_size, "sha256": sha256(path)}
    (SITE_ROOT / "build-manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"release": RELEASE, "roster": roster_count, "events": event_count, "menus": menu_count, "site": str(SITE_ROOT)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
