#!/usr/bin/env python3
from pathlib import Path
import build_site_v3 as builder

builder.RELEASE = "magicoffice-v4.3-clean-replacement-2026-09-03"


def patch_runtime() -> None:
    app_path = builder.SITE_ROOT / "assets/app.js"
    source = app_path.read_text(encoding="utf-8")
    if "try { await video.play(); } catch {}" in source:
        return
    candidates = [
        (
            """      } catch {\n        video.muted = true;\n        sound?.setAttribute('aria-pressed', 'false');\n        if (sound) sound.textContent = '開啟聲音';\n      }""",
            """      } catch {\n        video.muted = true;\n        sound?.setAttribute('aria-pressed', 'false');\n        if (sound) sound.textContent = '開啟聲音';\n        try { await video.play(); } catch {}\n      }""",
        ),
        (
            """      } catch {\n        video.muted = true;\n        video.defaultMuted = true;\n        sound.textContent = '開啟聲音';\n        sound.setAttribute('aria-pressed', 'false');\n      }""",
            """      } catch {\n        video.muted = true;\n        video.defaultMuted = true;\n        sound.textContent = '開啟聲音';\n        sound.setAttribute('aria-pressed', 'false');\n        try { await video.play(); } catch {}\n      }""",
        ),
    ]
    for old, new in candidates:
        if old in source:
            app_path.write_text(source.replace(old, new, 1), encoding="utf-8")
            return
    raise RuntimeError("No supported video fallback block found in assets/app.js")


builder.patch_runtime = patch_runtime

if __name__ == "__main__":
    builder.main()
