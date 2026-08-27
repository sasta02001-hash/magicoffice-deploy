from __future__ import annotations

from html.parser import HTMLParser
from pathlib import Path
import importlib.util


def load_builder():
    script = Path(__file__).with_name("build_preview.py")
    spec = importlib.util.spec_from_file_location("magicoffice_v207_builder", script)
    if spec is None or spec.loader is None:
        raise RuntimeError("Unable to load MagicOffice v2.0.7 builder")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class IdCollector(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.ids: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        for key, value in attrs:
            if key.lower() == "id" and value:
                self.ids.append(value)

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.handle_starttag(tag, attrs)


def main() -> None:
    builder = load_builder()

    def check_actual_duplicate_ids() -> list[str]:
        parser = IdCollector()
        parser.feed((builder.SITE / "index.html").read_text("utf-8"))
        return sorted({value for value in parser.ids if parser.ids.count(value) > 1})

    builder.check_duplicate_ids = check_actual_duplicate_ids
    builder.main()


if __name__ == "__main__":
    main()
