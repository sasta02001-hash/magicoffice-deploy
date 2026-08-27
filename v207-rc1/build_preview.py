from __future__ import annotations

from pathlib import Path
from PIL import Image, ImageDraw, ImageOps
import base64
import csv
import hashlib
import io
import json
import re
import shutil
import tarfile

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "v207-site"
REMOTE = ROOT / "v207-remote-preview"
WORK = ROOT / ".v207-rc1-build"
CODE_DIR = ROOT / "v207-transfer" / "code"
EXPECTED_CODE_SHA = "1f700a9517296c198831dbfc89cb1882e91984dcdbb55725c9d29aa124e83363"
VERSION = "2.0.7-preview-verification"
BUILD = "2026-08-27-preview-rc1"
RAW_BASE = "https://raw.githubusercontent.com/sasta02001-hash/magicoffice-deploy/v2.0.7-preview-source/v207-site/"


def reset(path: Path) -> None:
    if path.exists():
        shutil.rmtree(path)
    path.mkdir(parents=True, exist_ok=True)


def decode_code_archive() -> tuple[bytes, str]:
    chunks = sorted(CODE_DIR.glob("chunk-*.b64"))
    if len(chunks) != 9:
        raise RuntimeError(f"Expected 9 code chunks, found {len(chunks)}")
    encoded = "".join(p.read_text("utf-8").strip() for p in chunks)
    archive = base64.b64decode(encoded, validate=True)
    actual = hashlib.sha256(archive).hexdigest()
    if actual != EXPECTED_CODE_SHA:
        raise RuntimeError(f"Code archive SHA mismatch: {actual}")
    return archive, actual


def load_targets() -> list[dict[str, object]]:
    path = ROOT / "v207-input" / "v206-original-fingerprints.tsv"
    with path.open(newline="", encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle, delimiter="\t"))
    for row in rows:
        row["width"] = int(row["width"])
        row["height"] = int(row["height"])
    return rows


def save_placeholder(target: dict[str, object], dest: Path) -> None:
    width = int(target["width"])
    height = int(target["height"])
    image = Image.new("RGB", (width, height), "#120b0d")
    draw = ImageDraw.Draw(image)
    margin = max(24, min(width, height) // 16)
    stroke = max(2, min(width, height) // 220)
    draw.rectangle((margin, margin, width - margin, height - margin), outline="#c99a54", width=stroke)
    draw.text((width / 2, height / 2 - 22), "MagicOffice", anchor="mm", fill="#f0d6a3")
    draw.text((width / 2, height / 2 + 22), "Preview visual fallback", anchor="mm", fill="#ffffff")
    dest.parent.mkdir(parents=True, exist_ok=True)
    suffix = dest.suffix.lower()
    if suffix == ".webp":
        image.save(dest, "WEBP", quality=92, method=6)
    elif suffix == ".png":
        image.save(dest, "PNG", optimize=True)
    else:
        image.save(dest, "JPEG", quality=92, optimize=True, progressive=True)


def reconstruct_media(targets: list[dict[str, object]]) -> list[dict[str, object]]:
    media_dir = SITE / "assets" / "media"
    media_dir.mkdir(parents=True, exist_ok=True)
    records: list[dict[str, object]] = []
    for target in targets:
        name = str(target["name"])
        dest = media_dir / name
        source: Path | None = None
        method = ""
        reused = ROOT / "v207-reused-assets" / name
        live = ROOT / "v207-live-assets" / name
        if reused.exists():
            source = reused
            method = "reused-exact-or-approved"
        elif live.exists():
            source = live
            method = "live-perceptual-match"
        if source:
            shutil.copy2(source, dest)
        else:
            save_placeholder(target, dest)
            method = "generated-placeholder"
        try:
            with Image.open(dest) as image:
                output_width, output_height = image.size
        except Exception as exc:
            raise RuntimeError(f"Unreadable media asset {dest}: {exc}") from exc
        records.append(
            {
                "name": name,
                "method": method,
                "source": str(source) if source else "generated-placeholder",
                "target_width": target["width"],
                "target_height": target["height"],
                "output_width": output_width,
                "output_height": output_height,
                "sha256": hashlib.sha256(dest.read_bytes()).hexdigest(),
            }
        )
    return records


def generate_responsive_variants() -> list[str]:
    media_dir = SITE / "assets" / "media"
    text_files = [
        p
        for p in SITE.rglob("*")
        if p.is_file() and p.suffix.lower() in {".html", ".css", ".js", ".json", ".xml"}
    ]
    references: set[str] = set()
    for path in text_files:
        references.update(re.findall(r"assets/media/([A-Za-z0-9_.-]+)", path.read_text("utf-8", errors="ignore")))
    variant_pattern = re.compile(r"^(?P<stem>[0-9a-f]{16})-(?P<width>640|960)\.webp$")
    generated: list[str] = []
    for ref in sorted(references):
        match = variant_pattern.match(ref)
        if not match:
            continue
        stem = match.group("stem")
        requested_width = int(match.group("width"))
        source_candidates = [
            p for p in media_dir.glob(f"{stem}.*") if not variant_pattern.match(p.name)
        ]
        if not source_candidates:
            raise RuntimeError(f"Missing source for responsive variant {ref}")
        source = source_candidates[0]
        dest = media_dir / ref
        with Image.open(source) as image:
            image = ImageOps.exif_transpose(image).convert("RGB")
            if image.width > requested_width:
                output_height = max(1, round(image.height * requested_width / image.width))
                image = image.resize((requested_width, output_height), Image.Resampling.LANCZOS)
            image.save(dest, "WEBP", quality=88, method=6)
        generated.append(ref)
    return generated


def patch_preview_metadata() -> None:
    index_path = SITE / "index.html"
    html = index_path.read_text("utf-8")
    html = re.sub(r'data-site-version="[^"]*"', f'data-site-version="{VERSION}"', html)
    if f'data-site-version="{VERSION}"' not in html:
        html = re.sub(r"<html\b", f'<html data-site-version="{VERSION}"', html, count=1)
    html = re.sub(r'data-site-build="[^"]*"', f'data-site-build="{BUILD}"', html)
    if f'data-site-build="{BUILD}"' not in html:
        html = re.sub(r"<html\b", f'<html data-site-build="{BUILD}"', html, count=1)
    robots_meta = '<meta name="robots" content="noindex,nofollow,noarchive,max-image-preview:large">'
    if re.search(r'<meta[^>]+name=["\']robots["\'][^>]*>', html, flags=re.I):
        html = re.sub(r'<meta[^>]+name=["\']robots["\'][^>]*>', robots_meta, html, count=1, flags=re.I)
    else:
        html = html.replace("</head>", f"  {robots_meta}\n</head>", 1)
    marker = '<meta name="x-magicoffice-preview" content="v2.0.7-preview-verification">'
    if "x-magicoffice-preview" not in html:
        html = html.replace("</head>", f"  {marker}\n</head>", 1)
    index_path.write_text(html, "utf-8")
    (SITE / "robots.txt").write_text("User-agent: *\nDisallow: /\n", "utf-8")

    vercel_path = SITE / "vercel.json"
    try:
        config = json.loads(vercel_path.read_text("utf-8"))
    except Exception:
        config = {}
    headers = config.setdefault("headers", [])
    preview_header = {
        "source": "/(.*)",
        "headers": [
            {"key": "X-Robots-Tag", "value": "noindex, nofollow, noarchive"},
            {"key": "X-MagicOffice-Preview", "value": VERSION},
        ],
    }
    headers.insert(0, preview_header)
    vercel_path.write_text(json.dumps(config, ensure_ascii=False, indent=2), "utf-8")


def create_og_card() -> None:
    source = SITE / "assets" / "media" / "eabca6a873f77362.jpg"
    if not source.exists():
        raise RuntimeError("Missing Open Graph source visual")
    destination = SITE / "assets" / "og-card.jpg"
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)


def check_local_references() -> list[dict[str, str]]:
    missing: list[dict[str, str]] = []
    patterns = [
        re.compile(r'(?:src|href)=["\'](?:/)?([^"\']+)["\']'),
        re.compile(r"url\(\s*[\"']?([^\"')]+)"),
    ]
    for path in [
        p for p in SITE.rglob("*") if p.is_file() and p.suffix.lower() in {".html", ".css", ".js"}
    ]:
        text = path.read_text("utf-8", errors="ignore")
        for pattern in patterns:
            for ref in pattern.findall(text):
                if ref.startswith(("http://", "https://", "mailto:", "tel:", "#", "data:", "javascript:")):
                    continue
                clean = ref.split("?", 1)[0].split("#", 1)[0]
                if not clean:
                    continue
                candidate = SITE / clean.lstrip("/")
                if not candidate.exists():
                    missing.append({"file": str(path.relative_to(SITE)), "reference": ref})
    return missing


def check_duplicate_ids() -> list[str]:
    html = (SITE / "index.html").read_text("utf-8")
    ids = re.findall(r"\bid=[\"']([^\"']+)", html)
    return sorted({value for value in ids if ids.count(value) > 1})


def inline_remote_preview() -> dict[str, object]:
    reset(REMOTE)
    html = (SITE / "index.html").read_text("utf-8")

    stylesheet_pattern = re.compile(
        r'<link\b[^>]*rel=["\'][^"\']*stylesheet[^"\']*["\'][^>]*href=["\']([^"\']+)["\'][^>]*>',
        flags=re.I,
    )
    for match in list(stylesheet_pattern.finditer(html)):
        href = match.group(1)
        if href.startswith(("http://", "https://", "//")):
            continue
        css_path = SITE / href.split("?", 1)[0].lstrip("/")
        css = css_path.read_text("utf-8")
        html = html.replace(match.group(0), f"<style data-inlined-from=\"{href}\">\n{css}\n</style>")

    local_scripts: list[str] = []
    script_pattern = re.compile(r'<script\b([^>]*)\bsrc=["\']([^"\']+)["\']([^>]*)>\s*</script>', flags=re.I)
    for match in list(script_pattern.finditer(html)):
        src = match.group(2)
        if src.startswith(("http://", "https://", "//")):
            continue
        script_path = SITE / src.split("?", 1)[0].lstrip("/")
        local_scripts.append(f"/* inlined from {src} */\n" + script_path.read_text("utf-8"))
        html = html.replace(match.group(0), "")
    if local_scripts:
        combined = "\n;\n".join(local_scripts)
        html = html.replace("</body>", f"<script data-magicoffice-inline-bundle>\n{combined}\n</script>\n</body>", 1)

    # Rewrite every local website asset reference, including strings inside the inlined CSS and JS.
    html = html.replace('"/assets/', f'"{RAW_BASE}assets/')
    html = html.replace("'/assets/", f"'{RAW_BASE}assets/")
    html = html.replace("url(/assets/", f"url({RAW_BASE}assets/")
    html = html.replace('url("/assets/', f'url("{RAW_BASE}assets/')
    html = html.replace("url('/assets/", f"url('{RAW_BASE}assets/")
    html = html.replace('"assets/', f'"{RAW_BASE}assets/')
    html = html.replace("'assets/", f"'{RAW_BASE}assets/")
    html = html.replace("url(assets/", f"url({RAW_BASE}assets/")
    html = html.replace('url("assets/', f'url("{RAW_BASE}assets/')
    html = html.replace("url('assets/", f"url('{RAW_BASE}assets/")
    html = html.replace('href="/site.webmanifest"', f'href="{RAW_BASE}site.webmanifest"')
    html = html.replace("href='/site.webmanifest'", f"href='{RAW_BASE}site.webmanifest'")
    html = html.replace('content="2.0.7-preview"', f'content="{VERSION}"')

    remote_index = REMOTE / "index.html"
    remote_index.write_text(html, "utf-8")
    info = {
        "version": VERSION,
        "bytes": remote_index.stat().st_size,
        "sha256": hashlib.sha256(remote_index.read_bytes()).hexdigest(),
        "raw_url": "https://raw.githubusercontent.com/sasta02001-hash/magicoffice-deploy/v2.0.7-preview-source/v207-remote-preview/index.html",
        "asset_base": RAW_BASE,
    }
    (REMOTE / "remote-preview.json").write_text(json.dumps(info, ensure_ascii=False, indent=2), "utf-8")
    return info


def main() -> None:
    reset(WORK)
    reset(SITE)
    archive, archive_sha = decode_code_archive()
    archive_path = WORK / "code.tar.gz"
    archive_path.write_bytes(archive)
    with tarfile.open(archive_path, "r:gz") as handle:
        handle.extractall(SITE, filter="data")

    targets = load_targets()
    asset_records = reconstruct_media(targets)
    variants = generate_responsive_variants()
    create_og_card()
    patch_preview_metadata()
    missing = check_local_references()
    duplicates = check_duplicate_ids()
    if missing:
        raise RuntimeError("Missing local references: " + json.dumps(missing[:30], ensure_ascii=False))
    if duplicates:
        raise RuntimeError(f"Duplicate HTML IDs: {duplicates}")

    fallback_assets = [record for record in asset_records if record["method"] == "generated-placeholder"]
    site_report = {
        "version": VERSION,
        "build": BUILD,
        "code_archive_sha256": archive_sha,
        "target_original_count": len(targets),
        "asset_records": asset_records,
        "fallback_assets": fallback_assets,
        "fallback_asset_count": len(fallback_assets),
        "generated_variant_count": len(variants),
        "generated_variants": variants,
        "local_reference_missing_count": 0,
        "duplicate_id_count": 0,
        "site_file_count": sum(1 for p in SITE.rglob("*") if p.is_file()),
        "site_bytes": sum(p.stat().st_size for p in SITE.rglob("*") if p.is_file()),
        "production_modified": False,
        "attendance_spreadsheet_modified": False,
        "production_release_allowed": len(fallback_assets) == 0,
    }
    (ROOT / "v207-analysis" / "v207-rc1-build-report.json").write_text(
        json.dumps(site_report, ensure_ascii=False, indent=2), "utf-8"
    )
    (SITE / "preview-build.json").write_text(
        json.dumps(
            {
                key: site_report[key]
                for key in [
                    "version",
                    "build",
                    "code_archive_sha256",
                    "target_original_count",
                    "fallback_asset_count",
                    "generated_variant_count",
                    "site_file_count",
                    "site_bytes",
                    "production_modified",
                    "attendance_spreadsheet_modified",
                    "production_release_allowed",
                ]
            },
            ensure_ascii=False,
            indent=2,
        ),
        "utf-8",
    )
    remote_info = inline_remote_preview()
    print(
        "MAGICOFFICE_V207_RC1_BUILD",
        json.dumps(
            {
                "site": {key: site_report[key] for key in ["version", "site_file_count", "site_bytes", "fallback_asset_count", "production_release_allowed"]},
                "remote_preview": remote_info,
            },
            ensure_ascii=False,
        ),
    )


if __name__ == "__main__":
    main()
