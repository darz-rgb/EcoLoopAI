"""Підготуйте випуск командою py build.py перед завантаженням на GitHub."""
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent

def normalized(name):
    text = (ROOT / name).read_text(encoding="utf-8")
    if name == "index.html":
        text = re.sub(r'(name="app-version" content=")[^"]+', r'\g<1>BUILD', text)
        text = re.sub(r'\?v=[^"\s]+', '?v=BUILD', text)
    if name == "sw.js":
        text = re.sub(r'const RELEASE = "[^"]+";', 'const RELEASE = "BUILD";', text)
    return text

sources = ["index.html", "style.css", "store.js", "app.js", "sw.js", "update.html", "manifest.webmanifest"]
digest = hashlib.sha256()
for name in sources:
    digest.update(name.encode() + b"\0" + normalized(name).encode("utf-8"))
for icon in sorted((ROOT / "icons").glob("*.png")):
    digest.update(icon.name.encode() + b"\0" + icon.read_bytes())
release = digest.hexdigest()[:12]
index = normalized("index.html").replace('content="BUILD"', f'content="{release}"').replace("?v=BUILD", f"?v={release}")
worker = normalized("sw.js").replace('const RELEASE = "BUILD";', f'const RELEASE = "{release}";')
(ROOT / "index.html").write_text(index, encoding="utf-8")
(ROOT / "sw.js").write_text(worker, encoding="utf-8")
(ROOT / "version.json").write_text(json.dumps({"version": release, "label": "2.0"}, indent=2) + "\n", encoding="utf-8")
print(f"EcoLoop 2.0: {release}. Завантажте вміст папки на GitHub одним commit.")
