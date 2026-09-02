#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
from pathlib import Path

from PIL import Image

import build_site_v3 as builder
import build_site_v5 as runtime_fix

builder.RELEASE = "magicoffice-v4.3-clean-replacement-2026-09-03"
builder.patch_runtime = runtime_fix.patch_runtime


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def validate_assets(records: list[dict], video_record: dict) -> dict:
    image_records: list[dict] = []
    images_root = builder.SITE_ROOT / "assets/images"
    for path in sorted(images_root.rglob("*")):
        if not path.is_file() or path.suffix.lower() not in {".png", ".jpg", ".jpeg", ".webp"}:
            continue
        with Image.open(path) as image:
            image.load()
            width, height = image.size
        data = path.read_bytes()
        image_records.append({
            "path": str(path.relative_to(builder.SITE_ROOT)),
            "bytes": len(data),
            "sha256": _sha256(data),
            "width": width,
            "height": height,
        })

    groups = {
        "roster": [item for item in image_records if "/roster/" in item["path"]],
        "events": [item for item in image_records if "/events/" in item["path"]],
        "menu": [item for item in image_records if "/menu/" in item["path"]],
    }
    expected_counts = {"roster": 16, "events": 5, "menu": 3}
    failures: list[str] = []
    for name, expected in expected_counts.items():
        items = groups[name]
        if len(items) != expected:
            failures.append(f"{name} count {len(items)} != {expected}")
        hashes = [item["sha256"] for item in items]
        if len(set(hashes)) != len(hashes):
            failures.append(f"{name} contains duplicate binary assets")

    html = (builder.SITE_ROOT / "index.html").read_text(encoding="utf-8")
    css = (builder.SITE_ROOT / "assets/site.css").read_text(encoding="utf-8")
    js = (builder.SITE_ROOT / "assets/app.js").read_text(encoding="utf-8")
    events = json.loads((builder.SITE_ROOT / "content/events.json").read_text(encoding="utf-8"))
    roster = json.loads((builder.SITE_ROOT / "content/roster.json").read_text(encoding="utf-8"))
    menu = json.loads((builder.SITE_ROOT / "content/menu-snapshot.json").read_text(encoding="utf-8"))

    checks = {
        "releaseMarker": f'data-release="{builder.RELEASE}"' in html,
        "cleanReplacement": 'data-build="clean-replacement"' in html,
        "newHeroStructure": '<section class="hero" id="top">' in html and 'class="hero-brand"' in html,
        "borderlessHeroLogo": 'class="hero-logo"' in html and 'brand-plaque' not in html,
        "heroTitle": '<h1 id="hero-title">魔幻姶仕社</h1>' in html,
        "videoFallback": all(token in html for token in [
            'id="video-stage"', 'data-video-ready="false"', 'class="video-poster"',
            'id="hero-video"', 'poster="assets/images/hero/poster.webp"',
        ]),
        "localVideo": 'assets/video/hero-trial-12s-with-audio.mp4' in html,
        "runtimeRetry": 'try { await video.play(); } catch {}' in js,
        "menuTabs": all(token in html for token in [
            'id="menu-tabs"', 'data-menu-world="CAFE"',
            'data-menu-world="BAR"', 'data-menu-world="COLLECTION"',
        ]),
        "menuThemes": all(token in css for token in [
            'menu-theme-cafe', 'menu-theme-bar', 'menu-theme-collection',
        ]),
        "softContours": 'border-radius' in css and '--radius' in css,
        "cmsInterfaces": '/api/schedule' in js and '/api/menu' in js,
        "eventsComplete": len(events) == 5,
        "rosterComplete": len(roster) == 16,
        "menuComplete": sum(len(category.get("items", [])) for world in menu.get("worlds", []) for category in world.get("categories", [])) >= 88,
        "noLegacyCssJs": 'site-v2.0.6.css' not in html and 'magic-core-js.js' not in html,
        "noLegacyPatchStack": 'homepage-integrated-hero-v1' not in html and 'magicoffice-home-hero-patch' not in html,
        "sameDeploymentAssets": 'raw.githubusercontent.com' not in html and 'magicoffice-hwpboy' not in html,
    }
    failures.extend(name for name, value in checks.items() if not value)

    if failures:
        raise RuntimeError("Asset/build validation failed: " + ", ".join(failures))

    return {
        "release": builder.RELEASE,
        "downloaded": records,
        "video": video_record,
        "images": image_records,
        "groups": {name: len(items) for name, items in groups.items()},
        "contentCounts": {
            "events": len(events),
            "roster": len(roster),
            "menuItems": sum(len(category.get("items", [])) for world in menu.get("worlds", []) for category in world.get("categories", [])),
        },
        "checks": checks,
    }


builder.validate_assets = validate_assets

if __name__ == "__main__":
    builder.main()
