from __future__ import annotations

from pathlib import Path
import hashlib
import json
import re

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "v207-site"
REMOTE = ROOT / "v207-remote-preview"
VERSION = "2.0.7-preview-verification"
ASSET_COMMIT = "8274f774e03ecab64030fd91d819294fdbf49da9"
CDN_ROOT = f"https://cdn.jsdelivr.net/gh/sasta02001-hash/magicoffice-deploy@{ASSET_COMMIT}/v207-site/"
CDN_ASSETS = CDN_ROOT + "assets/"
TOKEN = "__MAGICOFFICE_CDN_ASSETS__/"


def rewrite_assets(text: str) -> str:
    absolute_bases = [
        "https://magicoffice-magicoffice.vercel.app/assets/",
        "https://magicoffice-preview-v2.vercel.app/assets/",
        "https://raw.githubusercontent.com/sasta02001-hash/magicoffice-deploy/v2.0.7-preview-source/v207-site/assets/",
    ]
    for base in absolute_bases:
        text = text.replace(base, TOKEN)
    text = re.sub(r"(?<![A-Za-z0-9_:/.])/?assets/", TOKEN, text)
    return text.replace(TOKEN, CDN_ASSETS)


def inline_stylesheets(html: str) -> tuple[str, int]:
    count = 0
    for match in list(re.finditer(r"<link\b[^>]*>", html, flags=re.I)):
        tag = match.group(0)
        if not re.search(r"\brel=[\"'][^\"']*stylesheet[^\"']*[\"']", tag, flags=re.I):
            continue
        href_match = re.search(r"\bhref=[\"']([^\"']+)[\"']", tag, flags=re.I)
        if not href_match:
            continue
        href = href_match.group(1)
        if href.startswith(("http://", "https://", "//")):
            continue
        source = SITE / href.split("?", 1)[0].lstrip("/")
        css = rewrite_assets(source.read_text("utf-8"))
        replacement = f'<style data-inlined-from="{href}">\n{css}\n</style>'
        html = html.replace(tag, replacement, 1)
        count += 1
    return html, count


def inline_scripts(html: str) -> tuple[str, int]:
    count = 0
    bundles: list[str] = []
    pattern = re.compile(r"<script\b(?P<attrs>[^>]*)>\s*</script>", flags=re.I)
    for match in list(pattern.finditer(html)):
        tag = match.group(0)
        attrs = match.group("attrs")
        src_match = re.search(r"\bsrc=[\"']([^\"']+)[\"']", attrs, flags=re.I)
        if not src_match:
            continue
        src = src_match.group(1)
        if src.startswith(("http://", "https://", "//")):
            continue
        source = SITE / src.split("?", 1)[0].lstrip("/")
        script = rewrite_assets(source.read_text("utf-8"))
        bundles.append(f"/* inlined from {src} */\n{script}")
        html = html.replace(tag, "", 1)
        count += 1
    if bundles:
        payload = "\n;\n".join(bundles)
        html = html.replace("</body>", f'<script data-magicoffice-inline-bundle>\n{payload}\n</script>\n</body>', 1)
    return html, count


def main() -> None:
    REMOTE.mkdir(parents=True, exist_ok=True)
    html = (SITE / "index.html").read_text("utf-8")
    html, style_count = inline_stylesheets(html)
    html, script_count = inline_scripts(html)
    html = rewrite_assets(html)
    html = html.replace('href="/site.webmanifest"', f'href="{CDN_ROOT}site.webmanifest"')
    html = html.replace("href='/site.webmanifest'", f"href='{CDN_ROOT}site.webmanifest'")
    html = html.replace("<html ", '<html data-remote-preview="rc3" ', 1)

    remaining_stylesheets = re.findall(r"<link\b[^>]*rel=[\"'][^\"']*stylesheet", html, flags=re.I)
    remaining_local_assets = re.findall(r"(?<![A-Za-z0-9_:/.])/?assets/", html)
    if remaining_stylesheets:
        raise RuntimeError(f"Stylesheet links remain: {len(remaining_stylesheets)}")
    if remaining_local_assets:
        raise RuntimeError(f"Local asset references remain: {len(remaining_local_assets)}")
    if VERSION not in html or "魔幻姶仕社" not in html:
        raise RuntimeError("Preview version or brand marker missing")

    output = REMOTE / "index.html"
    output.write_text(html, "utf-8")
    report = {
        "version": VERSION,
        "remotePreviewRevision": "rc3",
        "bytes": output.stat().st_size,
        "sha256": hashlib.sha256(output.read_bytes()).hexdigest(),
        "stylesheetsInlined": style_count,
        "scriptsInlined": script_count,
        "assetCommit": ASSET_COMMIT,
        "assetBase": CDN_ASSETS,
        "rawUrl": "https://raw.githubusercontent.com/sasta02001-hash/magicoffice-deploy/v2.0.7-preview-source/v207-remote-preview/index.html",
        "productionModified": False,
        "attendanceSpreadsheetModified": False,
    }
    (REMOTE / "remote-preview.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), "utf-8")
    print("MAGICOFFICE_V207_REMOTE_RC3", json.dumps(report, ensure_ascii=False))


if __name__ == "__main__":
    main()
