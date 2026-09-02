#!/usr/bin/env python3
from __future__ import annotations

import hashlib
import json
import time
from pathlib import Path

from PIL import Image

import build_site_v3 as builder
import build_site_v5 as runtime_fix

builder.RELEASE = "magicoffice-v4.3-clean-replacement-2026-09-03"
builder.patch_runtime = runtime_fix.patch_runtime

_original_clean_copy = builder.clean_copy


def clean_copy() -> None:
    _original_clean_copy()
    html_path = builder.SITE_ROOT / "index.html"
    html = html_path.read_text(encoding="utf-8")
    if 'data-build="clean-replacement"' not in html:
        html = html.replace(
            '<html lang="zh-Hant"',
            '<html lang="zh-Hant" data-build="clean-replacement"',
            1,
        )
    html_path.write_text(html, encoding="utf-8")


builder.clean_copy = clean_copy


def download_bytes(urls: list[str], *, min_bytes: int = 256, attempts: int = 2):
    errors: list[str] = []
    for url in urls:
        for attempt in range(1, attempts + 1):
            try:
                response = builder.SESSION.get(url, timeout=90, allow_redirects=True)
                if response.status_code == 404:
                    errors.append(f"{url}: HTTP 404")
                    break
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
                    time.sleep(0.6 * attempt)
    raise RuntimeError("Unable to download asset:\n" + "\n".join(errors[-12:]))


builder.download_bytes = download_bytes


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def validate_assets(records: list[dict], video_record: dict) -> dict:
    image_records: list[dict] = []
    for path in sorted((builder.SITE_ROOT / "assets/images").rglob("*")):
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
    failures: list[str] = []
    for name, expected in {"roster": 16, "events": 5, "menu": 3}.items():
        items = groups[name]
        if len(items) != expected:
            failures.append(f"{name} count {len(items)} != {expected}")
        hashes = [item["sha256"] for item in items]
        if len(set(hashes)) != len(hashes):
            failures.append(f"{name} contains duplicate binary assets")

    html = (builder.SITE_ROOT / "index.html").read_text(encoding="utf-8")
    css = (builder.SITE_ROOT / "assets/site.css").read_text(encoding="utf-8")
    js = (builder.SITE_ROOT / "assets/app.js").read_text(encoding="utf-8")
    events_payload = json.loads((builder.SITE_ROOT / "content/events.json").read_text(encoding="utf-8"))
    roster_payload = json.loads((builder.SITE_ROOT / "content/roster.json").read_text(encoding="utf-8"))
    menu_payload = json.loads((builder.SITE_ROOT / "content/menu-snapshot.json").read_text(encoding="utf-8"))
    events = events_payload.get("events", [])
    roster = roster_payload.get("people", [])
    menu_items = sum(
        len(category.get("items", []))
        for world in menu_payload.get("worlds", [])
        for category in world.get("categories", [])
    )

    checks = {
        "releaseMarker": f'data-release="{builder.RELEASE}"' in html,
        "cleanReplacement": 'data-build="clean-replacement"' in html,
        "newHeroStructure": all(token in html for token in [
            '<section class="hero" id="top"', 'class="hero-copy"',
            'class="hero-media"', 'class="hero-logo"',
        ]),
        "borderlessHeroLogo": 'class="hero-logo"' in html and 'brand-plaque' not in html,
        "heroTitle": '<h1 id="hero-title">魔幻姶仕社</h1>' in html,
        "videoFallback": all(token in html for token in [
            'class="video-stage"', 'data-video-state="poster"',
            'class="video-poster"', 'id="hero-video"',
            'poster="/assets/images/hero/poster.webp"',
        ]),
        "localVideo": '/assets/video/hero-trial-12s-with-audio.mp4' in html,
        "runtimeRetry": 'try { await video.play(); } catch {}' in js,
        "menuTabsRuntime": all(token in js for token in [
            'menu-tabs', 'data-menu-world', 'menu-theme-',
        ]),
        "menuThemes": all(token in css for token in [
            'menu-theme-cafe', 'menu-theme-bar', 'menu-theme-collection',
        ]),
        "softContours": css.count("border-radius") >= 20,
        "cmsInterfaces": '/api/schedule' in js and '/api/menu' in js,
        "eventsComplete": len(events) == 5,
        "eventSectionsComplete": sum(len(event.get("sections", [])) for event in events) >= 13,
        "rosterComplete": len(roster) == 16 and all(person.get("active") is True for person in roster),
        "menuComplete": menu_items >= 88,
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
            "eventSections": sum(len(event.get("sections", [])) for event in events),
            "roster": len(roster),
            "menuItems": menu_items,
        },
        "checks": checks,
    }


builder.validate_assets = validate_assets

if __name__ == "__main__":
    builder.main()
