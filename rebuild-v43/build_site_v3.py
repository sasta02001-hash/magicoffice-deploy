#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import io
import json
import os
import shutil
import subprocess
import time
from pathlib import Path

import requests
from PIL import Image, ImageDraw, ImageFont

REPO = "sasta02001-hash/magicoffice-deploy"
RELEASE = "magicoffice-clean-v4.3-production-20260903"
SOURCE_ROOT = Path("rebuild-v43")
SITE_ROOT = Path(os.environ.get("SITE_DIR", "/tmp/magicoffice-clean-v43-site"))
RAW_MAIN = f"https://raw.githubusercontent.com/{REPO}/main"
RAW_V207 = f"https://raw.githubusercontent.com/{REPO}/v2.0.7-preview-source"
OLD_ORIGIN = "https://magicoffice.vercel.app"

SESSION = requests.Session()
SESSION.headers.update({
    "User-Agent": "Mozilla/5.0 (compatible; MagicOffice-Clean-V43-Builder/3.0)",
    "Accept": "*/*",
})


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def clean_copy() -> None:
    if SITE_ROOT.exists():
        shutil.rmtree(SITE_ROOT)
    shutil.copytree(SOURCE_ROOT, SITE_ROOT)
    for pattern in ("build_site*.py", "test*.mjs", "asset-report.json"):
        for item in SITE_ROOT.glob(pattern):
            item.unlink(missing_ok=True)


def download_bytes(urls: list[str], *, min_bytes: int = 256, attempts: int = 4) -> tuple[bytes, str]:
    errors: list[str] = []
    for url in urls:
        for attempt in range(1, attempts + 1):
            try:
                response = SESSION.get(url, timeout=90, allow_redirects=True)
                response.raise_for_status()
                data = response.content
                head = data[:200].lstrip().lower()
                if len(data) < min_bytes:
                    raise ValueError(f"too small ({len(data)} bytes)")
                if head.startswith(b"<!doctype html") or head.startswith(b"<html"):
                    raise ValueError("resolved to HTML instead of binary asset")
                return data, response.url
            except Exception as exc:  # noqa: BLE001
                errors.append(f"{url} attempt {attempt}: {exc}")
                if attempt < attempts:
                    time.sleep(0.8 * attempt)
    raise RuntimeError("Unable to download asset:\n" + "\n".join(errors[-12:]))


def v207_candidates(filename: str) -> list[str]:
    return [
        f"{RAW_V207}/v207-reused-assets/{filename}",
        f"{RAW_V207}/v207-live-assets/{filename}",
        f"{OLD_ORIGIN}/assets/media/{filename}?v=2072",
    ]


def save_image(urls: list[str], destination: Path, *, quality: int = 91, min_bytes: int = 600) -> dict:
    data, source = download_bytes(urls, min_bytes=min_bytes)
    try:
        with Image.open(io.BytesIO(data)) as image:
            image.load()
            width, height = image.size
            destination.parent.mkdir(parents=True, exist_ok=True)
            suffix = destination.suffix.lower()
            if suffix == ".webp":
                converted = image.convert("RGBA" if image.mode in {"RGBA", "LA"} else "RGB")
                converted.save(destination, "WEBP", quality=quality, method=6)
            elif suffix == ".png":
                converted = image.convert("RGBA" if image.mode in {"RGBA", "LA"} else "RGB")
                converted.save(destination, "PNG", optimize=True)
            else:
                image.convert("RGB").save(destination, quality=quality, optimize=True)
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(f"Invalid image from {source}: {exc}") from exc
    final = destination.read_bytes()
    return {
        "path": str(destination.relative_to(SITE_ROOT)),
        "source": source,
        "bytes": len(final),
        "sha256": sha256(final),
        "width": width,
        "height": height,
    }


def make_mobile_background(desktop_path: Path, mobile_path: Path) -> dict:
    with Image.open(desktop_path) as original:
        image = original.convert("RGB")
        width, height = image.size
        target_ratio = 1000 / 1333
        crop_width = min(width, max(1, round(height * target_ratio)))
        free = max(0, width - crop_width)
        x0 = round(free * 0.13)
        crop = image.crop((x0, 0, x0 + crop_width, height))
        crop = crop.resize((1000, 1333), Image.Resampling.LANCZOS)
        mobile_path.parent.mkdir(parents=True, exist_ok=True)
        crop.save(mobile_path, "WEBP", quality=91, method=6)
    data = mobile_path.read_bytes()
    return {
        "path": str(mobile_path.relative_to(SITE_ROOT)),
        "source": "derived from desktop background",
        "bytes": len(data),
        "sha256": sha256(data),
        "width": 1000,
        "height": 1333,
    }


def find_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    choices = [
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc" if bold else "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
        "/usr/share/fonts/opentype/noto/NotoSerifCJK-Bold.ttc" if bold else "/usr/share/fonts/opentype/noto/NotoSerifCJK-Regular.ttc",
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    ]
    for path in choices:
        if Path(path).exists():
            return ImageFont.truetype(path, size=size)
    return ImageFont.load_default()


def make_heartbeat_poster(destination: Path) -> dict:
    width, height = 1200, 675
    image = Image.new("RGB", (width, height), "#f8dce8")
    pixels = image.load()
    top = (254, 239, 246)
    bottom = (205, 84, 133)
    for y in range(height):
        t = y / max(1, height - 1)
        row = tuple(round(top[i] * (1 - t) + bottom[i] * t) for i in range(3))
        for x in range(width):
            pixels[x, y] = row
    draw = ImageDraw.Draw(image, "RGBA")
    for x, y, scale, alpha in [
        (92, 92, 1.0, 70), (1070, 82, 0.75, 60), (1060, 560, 1.15, 58),
        (170, 545, 0.68, 48), (875, 205, 0.45, 45), (340, 160, 0.38, 40),
    ]:
        r = 48 * scale
        draw.ellipse((x-r, y-r, x, y), fill=(255,255,255,alpha))
        draw.ellipse((x, y-r, x+r, y), fill=(255,255,255,alpha))
        draw.polygon([(x-r, y-r/4), (x+r, y-r/4), (x, y+r*1.45)], fill=(255,255,255,alpha))
    draw.rounded_rectangle((38, 38, width-38, height-38), radius=44, outline=(255,244,225,200), width=5)
    draw.rounded_rectangle((58, 58, width-58, height-58), radius=36, outline=(111,30,67,105), width=2)
    title_font = find_font(92, bold=True)
    sub_font = find_font(36, bold=True)
    small_font = find_font(28, bold=False)
    draw.text((86, 140), "心跳應援", font=title_font, fill=(112, 24, 65, 255))
    draw.text((90, 270), "HEARTBEAT SUPPORT", font=sub_font, fill=(255, 248, 240, 245))
    draw.text((90, 332), "2026.09.01 — 09.15", font=sub_font, fill=(255, 241, 217, 245))
    draw.text((90, 408), "全力で応援するよ！！", font=small_font, fill=(91, 24, 57, 235))
    draw.text((90, 474), "九月整月活動｜訂位即送小卡一張", font=small_font, fill=(91, 24, 57, 225))
    draw.ellipse((890, 165, 1100, 375), fill=(255,243,230,215), outline=(125,37,74,170), width=5)
    draw.text((947, 224), "MO", font=find_font(54, bold=True), fill=(134, 40, 81, 255))
    draw.text((926, 310), "MAGIC", font=find_font(24, bold=True), fill=(134, 40, 81, 230))
    destination.parent.mkdir(parents=True, exist_ok=True)
    image.save(destination, "WEBP", quality=93, method=6)
    data = destination.read_bytes()
    return {
        "path": str(destination.relative_to(SITE_ROOT)),
        "source": "generated original MagicOffice heartbeat visual",
        "bytes": len(data),
        "sha256": sha256(data),
        "width": width,
        "height": height,
    }


def build_video() -> dict:
    source_path = SITE_ROOT / "assets/video/hero-silent-source.mp4"
    output_path = SITE_ROOT / "assets/video/hero-trial-12s-with-audio.mp4"
    source_path.parent.mkdir(parents=True, exist_ok=True)
    data, source = download_bytes(
        [f"{RAW_MAIN}/assets/production-trial-video/MagicOffice_home_trial_720p_12s_v1.mp4"],
        min_bytes=1_000_000,
    )
    source_path.write_bytes(data)
    command = [
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
        "-i", str(source_path),
        "-f", "lavfi", "-i", "sine=frequency=174.61:sample_rate=48000:duration=12",
        "-f", "lavfi", "-i", "sine=frequency=261.63:sample_rate=48000:duration=12",
        "-filter_complex",
        "[1:a]volume=0.14[a1];[2:a]volume=0.07[a2];[a1][a2]amix=inputs=2:normalize=0,lowpass=f=1450,afade=t=in:st=0:d=1.2,afade=t=out:st=10.3:d=1.7,alimiter=limit=0.82[a]",
        "-map", "0:v:0", "-map", "[a]", "-c:v", "copy", "-c:a", "aac", "-b:a", "128k",
        "-movflags", "+faststart", "-shortest", str(output_path),
    ]
    subprocess.run(command, check=True)
    source_path.unlink(missing_ok=True)
    probe = subprocess.check_output([
        "ffprobe", "-v", "error", "-show_entries", "stream=codec_type,codec_name,width,height,r_frame_rate,sample_rate,channels",
        "-show_entries", "format=duration,size", "-of", "json", str(output_path),
    ], text=True)
    metadata = json.loads(probe)
    stream_types = {stream.get("codec_type") for stream in metadata.get("streams", [])}
    if not {"video", "audio"}.issubset(stream_types):
        raise RuntimeError(f"Output MP4 missing video/audio streams: {metadata}")
    final = output_path.read_bytes()
    return {
        "path": str(output_path.relative_to(SITE_ROOT)),
        "source": source,
        "bytes": len(final),
        "sha256": sha256(final),
        "ffprobe": metadata,
    }


def patch_runtime() -> None:
    app_path = SITE_ROOT / "assets/app.js"
    source = app_path.read_text(encoding="utf-8")
    old = """      } catch {\n        video.muted = true;\n        video.defaultMuted = true;\n        sound.textContent = '開啟聲音';\n        sound.setAttribute('aria-pressed', 'false');\n      }"""
    new = """      } catch {\n        video.muted = true;\n        video.defaultMuted = true;\n        sound.textContent = '開啟聲音';\n        sound.setAttribute('aria-pressed', 'false');\n        try { await video.play(); } catch {}\n      }"""
    if old not in source:
        raise RuntimeError("Expected video fallback block was not found in assets/app.js")
    app_path.write_text(source.replace(old, new, 1), encoding="utf-8")


def validate_assets(records: list[dict], video_record: dict) -> dict:
    image_records: list[dict] = []
    for path in sorted((SITE_ROOT / "assets/images").rglob("*")):
        if not path.is_file() or path.suffix.lower() not in {".png", ".jpg", ".jpeg", ".webp"}:
            continue
        with Image.open(path) as image:
            image.load()
            width, height = image.size
        data = path.read_bytes()
        image_records.append({
            "path": str(path.relative_to(SITE_ROOT)),
            "bytes": len(data),
            "sha256": sha256(data),
            "width": width,
            "height": height,
        })
    by_prefix = {
        "roster": [item for item in image_records if "/roster/" in item["path"]],
        "events": [item for item in image_records if "/events/" in item["path"]],
        "menu": [item for item in image_records if "/menu/" in item["path"]],
    }
    expected = {"roster": 16, "events": 5, "menu": 3}
    failures: list[str] = []
    for group, count in expected.items():
        actual = len(by_prefix[group])
        if actual != count:
            failures.append(f"{group} count {actual} != {count}")
        hashes = [item["sha256"] for item in by_prefix[group]]
        if len(set(hashes)) != len(hashes):
            failures.append(f"{group} contains duplicate binary assets")
    html = (SITE_ROOT / "index.html").read_text(encoding="utf-8")
    css = (SITE_ROOT / "assets/site.css").read_text(encoding="utf-8")
    js = (SITE_ROOT / "assets/app.js").read_text(encoding="utf-8")
    static_checks = {
        "releaseMarker": RELEASE in html,
        "newBuildMarker": 'data-build="clean-replacement"' in html,
        "borderlessHeroLogo": "hero-logo-floating" in html and "brand-plaque" not in html,
        "videoLocal": "/assets/video/hero-trial-12s-with-audio.mp4" in html,
        "videoFallback": "data-video-ready" in html and "home-video-poster" in html,
        "menuThemes": all(token in css for token in ["menu-theme-cafe", "menu-theme-bar", "menu-theme-collection"]),
        "menuTabs": "data-menu-world" in html,
        "runtimeRetry": "try { await video.play(); } catch {}" in js,
        "noOldSourceCode": "site-v2.0.6.css" not in html and "magic-core-js.js" not in html,
        "localImages": "raw.githubusercontent.com" not in html and "magicoffice-hwpboy" not in html,
    }
    failures.extend(name for name, value in static_checks.items() if not value)
    if failures:
        raise RuntimeError("Asset/build validation failed: " + ", ".join(failures))
    return {
        "release": RELEASE,
        "downloaded": records,
        "video": video_record,
        "images": image_records,
        "groups": {name: len(items) for name, items in by_prefix.items()},
        "checks": static_checks,
    }


def main() -> None:
    clean_copy()
    records: list[dict] = []

    records.append(save_image(
        [f"{RAW_MAIN}/assets/home-hero-preview-v3/magicoffice-home-video-poster-v1.webp"],
        SITE_ROOT / "assets/images/hero/poster.webp", min_bytes=40_000,
    ))
    records.append(save_image(
        [f"{RAW_MAIN}/assets/home-clean-scene-desktop-v1/magicoffice-home-clean-scene-desktop-v1.webp"],
        SITE_ROOT / "assets/images/hero/background-desktop.webp", min_bytes=100_000,
    ))
    records.append(make_mobile_background(
        SITE_ROOT / "assets/images/hero/background-desktop.webp",
        SITE_ROOT / "assets/images/hero/background-mobile.webp",
    ))

    records.append(save_image(v207_candidates("05f19666ed49f368.png"), SITE_ROOT / "assets/images/logo/logo-gold.png", min_bytes=3_000))

    roster_map = {
        "mibao": "46a75e190baad8e8.webp", "yuzu": "e22350b8ec2d748a.webp",
        "jubi": "9cf5f3c7c8e43450.webp", "cc": "815c2fdfd2a254ce.webp",
        "lele": "1d6e303714642bf6.webp", "cara": "6abf49f3aab3c507.webp",
        "medamayaki": "3241306c93000ad3.webp", "sakuri": "8f1e2635714effb9.webp",
        "hekiru": "617f58b1207050e6.webp", "rumei": "2d5ed350d26c050b.webp",
        "naya": "4fd4c223e064c15d.webp", "sakuma": "f2097a926bdf48b3.webp",
        "nana": "e404ebb20f7273f8.webp", "mona": "59f9acb8861a6595.webp",
        "kokoro": "4bf65583e3739d3f.webp", "mika": "d9800fa21c1b6e2e.webp",
    }
    for slug, filename in roster_map.items():
        records.append(save_image(v207_candidates(filename), SITE_ROOT / f"assets/images/roster/{slug}.webp", min_bytes=1_500))

    records.append(make_heartbeat_poster(SITE_ROOT / "assets/images/events/heartbeat.webp"))
    event_map = {
        "mid-autumn": "aa7f2899b9a883f5.webp",
        "yuzu": "a1b97912e03ddf75.webp",
        "summer": "38f7487b4a48705b.webp",
        "jubi": "3760e1f1d1df1182.webp",
    }
    for slug, filename in event_map.items():
        records.append(save_image(v207_candidates(filename), SITE_ROOT / f"assets/images/events/{slug}.webp", min_bytes=2_000))

    menu_map = {
        "cafe": "441b778dda048206.webp",
        "bar": "f12cf40a97634cc9.webp",
        "collection": "d9961b8b48fdb587.webp",
    }
    for slug, filename in menu_map.items():
        records.append(save_image(v207_candidates(filename), SITE_ROOT / f"assets/images/menu/{slug}.webp", min_bytes=2_000))

    venue_map = {
        "sakura-throne": "d878f9472706fdbe.webp",
        "cafe-corner": "49acafbeb1e4b6bb.webp",
        "night-bar": "4739c5c2017c4c0e.webp",
    }
    for slug, filename in venue_map.items():
        records.append(save_image(v207_candidates(filename), SITE_ROOT / f"assets/images/venue/{slug}.webp", min_bytes=2_000))

    patch_runtime()
    video_record = build_video()
    manifest = validate_assets(records, video_record)
    (SITE_ROOT / "build-manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print("MAGICOFFICE_CLEAN_V43_SITE_BUILT")
    print(json.dumps({
        "release": RELEASE,
        "siteRoot": str(SITE_ROOT),
        "imageCount": len(manifest["images"]),
        "groups": manifest["groups"],
        "videoBytes": video_record["bytes"],
        "videoSha256": video_record["sha256"],
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
