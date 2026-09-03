from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parents[1]
RELEASE = "magicoffice-v4.3.11-audible-autoplay-2026-09-03"
VERSION = "production-v4.3.11-audible-autoplay"
DISPLAY_TITLE = "MagiCofficec魔幻世界人物誌"
TECHNICAL_FILENAME = "MagicOffice_FINAL_LARGE_SLOW_SUBTITLES_720p48_UNDER300MB.mp4"


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one match, found {count}")
    return text.replace(old, new)


def replace_regex_once(text: str, pattern: str, replacement: str, label: str) -> str:
    result, count = re.subn(pattern, lambda _match: replacement, text, count=1, flags=re.S)
    if count != 1:
        raise RuntimeError(f"{label}: expected exactly one match, found {count}")
    return result


# HTML template
index_path = ROOT / "src/index.template.html"
html = index_path.read_text(encoding="utf-8")
html = re.sub(r'magicoffice-v4\.3\.\d+[^\"]*-2026-09-03', RELEASE, html, count=1)
html = replace_once(
    html,
    '<link href="assets/css/video-v4.3.5.css?v={{BUILD_VERSION}}" rel="stylesheet"/>',
    '<link href="assets/css/video-title-v4.3.7.css?v={{BUILD_VERSION}}" rel="stylesheet"/>\n'
    '<link href="assets/css/video-autoplay-v4.3.8.css?v={{BUILD_VERSION}}" rel="stylesheet"/>\n'
    '<link href="assets/css/video-caption-center-v4.3.10.css?v={{BUILD_VERSION}}" rel="stylesheet"/>\n'
    '<link href="assets/css/video-audio-v4.3.11.css?v={{BUILD_VERSION}}" rel="stylesheet"/>',
    "video stylesheet links",
)
html = replace_once(
    html,
    '<div aria-label="MagicOffice 完整有聲影片" class="mo-cinema" data-state="idle" data-video-ready="false" data-audio-state="muted">',
    '<div aria-label="{{HERO_DISPLAY_TITLE}} 有聲影片" class="mo-cinema" data-state="idle" data-video-ready="false" data-audio-state="audible" data-autoplay="true" data-loop="false">',
    "cinema state",
)
html = replace_once(
    html,
    '<video autoplay="" controls="" controlslist="nodownload noplaybackrate" disablepictureinpicture="" loop="" muted="" playsinline="" poster="assets/images/hero/hero-poster.webp" preload="metadata" src="{{HERO_VIDEO}}" data-source-filename="{{HERO_FILENAME}}" webkit-playsinline=""></video>',
    '<video autoplay="" controls="" controlslist="nodownload noplaybackrate" data-default-audio="audible" disablepictureinpicture="" playsinline="" poster="assets/images/hero/hero-poster.webp" preload="metadata" src="{{HERO_VIDEO}}" data-source-filename="{{HERO_FILENAME}}" webkit-playsinline=""></video>',
    "video element",
)
html = replace_once(
    html,
    '<div class="mo-cinema-start"><button type="button" data-video-start><span aria-hidden="true">▶</span><b>播放影片</b><small>點擊後可開啟聲音</small></button></div>\n'
    '<button type="button" class="mo-video-sound-overlay" data-video-sound aria-label="開啟影片聲音"><span aria-hidden="true">🔇</span><b>開啟聲音</b></button>\n',
    "",
    "custom video overlays",
)
html = replace_once(
    html,
    '<p class="mo-cinema-caption" data-video-caption aria-label="影片內容標註">{{HERO_FILENAME}}</p><span class="mo-sr-only" data-video-status role="status" aria-live="polite"></span>',
    '<p class="mo-cinema-caption" data-video-display-name aria-label="影片內容：{{HERO_DISPLAY_TITLE}}">\n'
    '<span class="mo-cinema-caption-label" aria-hidden="true">影片內容</span>\n'
    '<strong class="mo-cinema-caption-title">{{HERO_DISPLAY_TITLE}}</strong>\n'
    '</p><span class="mo-sr-only" data-video-status role="status" aria-live="polite"></span>',
    "Drive display title caption",
)
index_path.write_text(html, encoding="utf-8")


# Build mapping
build_path = ROOT / "scripts/build.mjs"
build = build_path.read_text(encoding="utf-8")
build = replace_once(
    build,
    "const heroFilename = String(site.hero?.filename || path.basename(heroVideo));\n"
    "if (!heroVideo || !heroFilename) throw new Error('content/site.json hero.video and hero.filename are required');\n"
    "html = html.replaceAll('{{HERO_VIDEO}}', esc(heroVideo)).replaceAll('{{HERO_FILENAME}}', esc(heroFilename));",
    "const heroFilename = String(site.hero?.filename || path.basename(heroVideo));\n"
    "const heroDisplayTitle = String(site.hero?.displayTitle || site.hero?.driveDisplayName || heroFilename.replace(/\\.[^./\\\\]+$/, '')).trim();\n"
    "if (!heroVideo || !heroFilename || !heroDisplayTitle) throw new Error('content/site.json hero.video, hero.filename and hero.displayTitle are required');\n"
    "html = html.replaceAll('{{HERO_VIDEO}}', esc(heroVideo)).replaceAll('{{HERO_FILENAME}}', esc(heroFilename)).replaceAll('{{HERO_DISPLAY_TITLE}}', esc(heroDisplayTitle));",
    "hero display title build mapping",
)
build_path.write_text(build, encoding="utf-8")


# Browser playback behavior
app_path = ROOT / "assets/js/app.js"
app = app_path.read_text(encoding="utf-8")
app = replace_regex_once(
    app,
    r"    const caption = \$\('\[data-video-caption\]'\);\n"
    r"    if \(!video\) return;\n\n"
    r"    const syncFilenameCaption = \(\) => \{.*?\n"
    r"    \};\n"
    r"    syncFilenameCaption\(\);",
    """    const caption = $('[data-video-display-name]', cinema);
    const captionTitle = caption ? $('.mo-cinema-caption-title', caption) : null;
    if (!video) return;

    const syncFilenameCaption = () => {
      const displayTitle = String(site?.hero?.displayTitle || site?.hero?.driveDisplayName || site?.hero?.caption || '')
        .replace(/\\.[^./\\\\]+$/, '').trim();
      if (captionTitle && displayTitle) captionTitle.textContent = displayTitle;
      if (caption && displayTitle) caption.setAttribute('aria-label', `影片內容：${displayTitle}`);
    };
    syncFilenameCaption();""",
    "caption JavaScript",
)
app = replace_once(
    app,
    "const safePlay = async ({ audible = false } = {}) => {",
    "const safePlay = async ({ audible = true } = {}) => {",
    "safePlay default",
)
app = replace_once(
    app,
    "        setState(hasPlayed ? 'paused' : 'idle', '瀏覽器阻擋自動播放，請按「播放影片」。');",
    "        setState(hasPlayed ? 'paused' : 'idle', '瀏覽器阻擋有聲自動播放；封面會保留，使用影片原生控制列即可有聲播放。');",
    "autoplay blocked status",
)
app = replace_once(
    app,
    "    video.defaultMuted = true;\n    video.muted = true;\n    video.loop = true;",
    "    video.defaultMuted = false;\n    video.muted = false;\n    video.loop = false;",
    "default audio state",
)
app = app.replace(
    "setState(hasPlayed ? cinema.dataset.state : 'ready', '影片已就緒，可直接播放並開啟聲音。');",
    "setState(hasPlayed ? cinema.dataset.state : 'ready', '影片已就緒，將優先以有聲模式播放。');",
)
app = app.replace(
    "if (!hasPlayed && cinema.dataset.state === 'loading') setState('ready', '影片已就緒，可直接播放並開啟聲音。');",
    "if (!hasPlayed && cinema.dataset.state === 'loading') setState('ready', '影片已就緒，將優先以有聲模式播放。');",
)
app = replace_once(
    app,
    "    setState('idle', '載入前顯示正式封面；播放失敗時不會出現黑框。');",
    "    setState('idle', '將嘗試有聲自動播放；若瀏覽器阻擋，會保留正式封面。');",
    "initial video status",
)
app = replace_once(
    app,
    "requestAnimationFrame(() => safePlay());",
    "requestAnimationFrame(() => safePlay({ audible: true }));",
    "initial audible autoplay",
)
app = replace_once(
    app,
    "document.addEventListener('visibilitychange', () => { if (!document.hidden && !hasPlayed && !loadFailed) safePlay(); });",
    "document.addEventListener('visibilitychange', () => { if (!document.hidden && !hasPlayed && !loadFailed) safePlay({ audible: true }); });",
    "audible retry",
)
app_path.write_text(app, encoding="utf-8")


# Site configuration
site_path = ROOT / "content/site.json"
site = json.loads(site_path.read_text(encoding="utf-8"))
site["version"] = VERSION
site["release"] = RELEASE
site["updatedAt"] = "2026-09-03"
hero = site.setdefault("hero", {})
hero.update(
    {
        "filename": TECHNICAL_FILENAME,
        "sourceFileName": TECHNICAL_FILENAME,
        "driveFileId": "1LDyVVsaMrjK1U7eu5PBf1mVLrCgg0YrF",
        "driveFileName": f"{DISPLAY_TITLE}.mp4",
        "driveDisplayName": DISPLAY_TITLE,
        "displayTitle": DISPLAY_TITLE,
        "caption": DISPLAY_TITLE,
        "captionPolicy": "google-drive-display-title",
        "autoplay": True,
        "mutedAutoplay": False,
        "defaultAudioState": "audible",
        "defaultVolume": 0.7,
        "loop": False,
        "fallbackPoster": True,
        "playbackPolicy": "進站後先嘗試有聲自動播放；若瀏覽器政策阻擋，不改成靜音播放，保留正式封面與原生控制列，使用者按下播放時聲音預設開啟。",
        "captionPlacement": "label-and-video-title-centered-directly-below-video",
        "displayTitleUpdateRule": "每次置換影片時先讀取指定 Google Drive 檔案的顯示名稱；官網不顯示副檔名，名稱置中於影片正下方。",
    }
)
site["contentManagement"]["hero"] = "content/site.json + Google Drive 顯示名稱 + 分段影音來源；優先有聲自動播放，受阻時保留封面且不靜音降級"
site_path.write_text(json.dumps(site, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

manifest_path = ROOT / "content/hero-video-source.json"
manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
manifest["sourceLabel"] = "Google Drive technical source filename; visitor-facing title comes from content/site.json hero.displayTitle without the extension"
manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

package_path = ROOT / "package.json"
package = json.loads(package_path.read_text(encoding="utf-8"))
package["version"] = "4.3.11"
package_path.write_text(json.dumps(package, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


# Static validation rules
validate_path = ROOT / "scripts/validate.mjs"
validate = validate_path.read_text(encoding="utf-8")
validate = replace_once(
    validate,
    "  site.hero.video, 'MAGICOFFICE', 'application/ld+json', 'data-video-sound', 'data-video-start',",
    "  site.hero.video, 'MAGICOFFICE', 'application/ld+json', 'data-video-display-name', 'data-default-audio=\"audible\"',",
    "validation required tokens",
)
validate = replace_once(
    validate,
    "assert(html.includes('data-video-caption') && html.includes(`>${expectedHeroFilename}</p>`), '影片下方標註必須與 Google Drive 檔名完全相同');",
    "const expectedHeroDisplayTitle = site.hero?.displayTitle;\n"
    "assert(expectedHeroDisplayTitle && html.includes('data-video-display-name') && html.includes(`<strong class=\"mo-cinema-caption-title\">${expectedHeroDisplayTitle}</strong>`), '影片下方必須顯示 Google Drive 顯示名稱且不含副檔名');\n"
    "const heroVideoTag = html.match(/<video[^>]*data-default-audio=\"audible\"[^>]*>/)?.[0] || '';\n"
    "assert(heroVideoTag.includes('autoplay') && !/\\smuted(?:=|\\s|>)/.test(heroVideoTag) && !/\\sloop(?:=|\\s|>)/.test(heroVideoTag), '首頁影片必須優先有聲自動播放，且不得靜音或循環');\n"
    "assert(!html.includes('data-video-start') && !html.includes('mo-video-sound-overlay'), '不得重新加入擋住影片的自製播放或聲音按鈕');",
    "caption and autoplay validation",
)
validate_path.write_text(validate, encoding="utf-8")


# Styles already approved in v4.3.10, plus explicit audible-first policy.
css = ROOT / "assets/css"
css.mkdir(parents=True, exist_ok=True)
(css / "video-title-v4.3.7.css").write_text(
    '.mo-cinema-caption[data-video-display-name]{display:grid;justify-items:center;gap:7px;width:min(100%,780px);margin:15px auto 0;padding:9px 18px 2px;text-align:center;color:#f5e7e4}.mo-cinema-caption-label{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;color:#d9ae7a;font-size:.72rem;font-weight:700;line-height:1;letter-spacing:.22em}.mo-cinema-caption-label::before,.mo-cinema-caption-label::after{content:"";flex:0 1 76px;height:1px;background:linear-gradient(90deg,transparent,rgba(232,193,139,.86))}.mo-cinema-caption-label::after{transform:scaleX(-1)}.mo-cinema-caption-title{display:block;max-width:100%;color:#f4ddd6;font-family:var(--font-serif);font-size:clamp(1.02rem,1.38vw,1.3rem);font-weight:650;line-height:1.48;letter-spacing:.035em;overflow-wrap:anywhere;text-wrap:balance;text-shadow:0 2px 16px rgba(0,0,0,.58),0 0 18px rgba(218,151,128,.16)}@media(max-width:960px){.mo-cinema-caption[data-video-display-name]{margin-top:11px;padding-inline:8px}.mo-cinema-caption-title{font-size:clamp(.94rem,3.8vw,1.12rem);line-height:1.5;letter-spacing:.02em}}@media(max-width:420px){.mo-cinema-caption-label{font-size:.66rem;letter-spacing:.18em}.mo-cinema-caption-title{font-size:.91rem;line-height:1.48}}\n',
    encoding="utf-8",
)
(css / "video-autoplay-v4.3.8.css").write_text(
    '.mo-cinema-start,.mo-video-sound-overlay{display:none!important}.mo-cinema video{z-index:4;opacity:1;transition:opacity .26s ease}.mo-cinema .mo-poster,.mo-cinema .mo-poster-wordmark{opacity:0!important;visibility:hidden!important;pointer-events:none!important}.mo-cinema[data-state="error"] video{opacity:0}.mo-cinema[data-state="error"] .mo-poster,.mo-cinema[data-state="error"] .mo-poster-wordmark{opacity:1!important;visibility:visible!important}.mo-cinema-caption[data-video-display-name]{margin-top:17px;gap:9px}.mo-cinema-caption-label{font-size:.76rem;letter-spacing:.24em}.mo-cinema-caption-title{color:#f8e3d5;font-size:clamp(1.26rem,1.85vw,1.72rem);font-weight:700;line-height:1.36;letter-spacing:.055em;text-shadow:0 3px 20px rgba(0,0,0,.62),0 0 22px rgba(228,169,132,.22)}@media(max-width:960px){.mo-cinema-caption[data-video-display-name]{margin-top:13px;gap:7px}.mo-cinema-caption-title{font-size:clamp(1.08rem,4.8vw,1.32rem);line-height:1.42;letter-spacing:.035em}}@media(max-width:420px){.mo-cinema-caption-label{font-size:.68rem;letter-spacing:.2em}.mo-cinema-caption-title{font-size:1.08rem;line-height:1.42}}\n',
    encoding="utf-8",
)
(css / "video-caption-center-v4.3.10.css").write_text(
    '.mo-cinema-wrap{width:100%;display:flex;flex-direction:column;align-items:stretch}.mo-cinema-caption[data-video-display-name]{box-sizing:border-box!important;display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:center!important;justify-items:center!important;align-self:stretch!important;width:100%!important;max-width:100%!important;margin:14px 0 0!important;padding:10px 12px 2px!important;text-align:center!important}.mo-cinema-caption[data-video-display-name]>.mo-cinema-caption-label,.mo-cinema-caption[data-video-display-name]>.mo-cinema-caption-title{box-sizing:border-box!important;display:block!important;width:100%!important;max-width:100%!important;margin-left:auto!important;margin-right:auto!important;padding-left:0!important;padding-right:0!important;align-self:center!important;justify-self:stretch!important;text-align:center!important}.mo-cinema-caption[data-video-display-name]>.mo-cinema-caption-label{display:flex!important;justify-content:center!important;align-items:center!important}@media(max-width:960px){.mo-cinema-caption[data-video-display-name]{margin-top:11px!important;padding-inline:8px!important}}\n',
    encoding="utf-8",
)
(css / "video-audio-v4.3.11.css").write_text(
    '/* Audible-first policy: native controls remain unobstructed; no custom overlay is rendered. */\n.mo-cinema video{display:block;width:100%}\n.mo-cinema-start,.mo-video-sound-overlay{display:none!important}\n',
    encoding="utf-8",
)


# Vercel configuration and source upload exclusions
vercel_path = ROOT / "vercel.json"
vercel = json.loads(vercel_path.read_text(encoding="utf-8"))
vercel["buildCommand"] = "npm run build:offline"
for rule in vercel.get("headers", []):
    if rule.get("source") == "/(.*)":
        headers = [item for item in rule.get("headers", []) if item.get("key", "").lower() != "x-magicoffice-release"]
        headers.append({"key": "X-MagicOffice-Release", "value": RELEASE})
        rule["headers"] = headers
if not any(rule.get("source") == "/" for rule in vercel.get("headers", [])):
    vercel["headers"].insert(-1, {"source": "/", "headers": [{"key": "Cache-Control", "value": "no-cache, no-store, must-revalidate"}]})
vercel_path.write_text(json.dumps(vercel, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
(ROOT / ".vercelignore").write_text("assets/video/*.mp4\ndist/\nverification/\nnode_modules/\n.vercel/\n", encoding="utf-8")

readme_path = ROOT / "README.md"
readme = readme_path.read_text(encoding="utf-8")
if "## v4.3.11 audible-first playback" not in readme:
    readme_path.write_text(
        readme.rstrip()
        + "\n\n## v4.3.11 audible-first playback\n\n"
        + "The hero video attempts autoplay with sound at volume 0.7. Do not add the HTML `muted` attribute and do not retry in muted mode. Browsers may block audible autoplay; in that case the official poster remains visible and the native controls start playback with sound after a user gesture.\n",
        encoding="utf-8",
    )

print(json.dumps({"release": RELEASE, "version": VERSION, "displayTitle": DISPLAY_TITLE, "defaultAudioState": "audible"}, ensure_ascii=False))
