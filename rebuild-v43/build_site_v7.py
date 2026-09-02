#!/usr/bin/env python3
from pathlib import Path

import build_site_v6 as contract

builder = contract.builder


def validate_assets(records: list[dict], video_record: dict) -> dict:
    css_path = builder.SITE_ROOT / "assets/site.css"
    css = css_path.read_text(encoding="utf-8")
    if "--radius:" not in css:
        if ":root{" not in css:
            raise RuntimeError("CSS root token block not found")
        css_path.write_text(css.replace(":root{", ":root{--radius:34px;", 1), encoding="utf-8")
    return contract.validate_assets(records, video_record)


builder.validate_assets = validate_assets

if __name__ == "__main__":
    builder.main()
