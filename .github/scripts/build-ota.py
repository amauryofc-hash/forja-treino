"""Monta o pacote Android de conteúdo a partir do site público do Forja."""

import hashlib
import json
import sys
import tempfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IGNORED_DIRS = {".git", ".github", "bundles"}
IGNORED_FILES = {"ota-manifest.json", "README.md", ".nojekyll", "icon-192.png", "manifest.webmanifest"}
FORBIDDEN_FILES = {"finance-seed.json", "diet-plan-seed.json"}
FORBIDDEN_BYTES = (b"sk-proj-", b"88774978", b"finance-position-2026-", b"meu-cardapio-forja")
RAW = "https://raw.githubusercontent.com/amauryofc-hash/forja-treino/main/bundles/"


def web_files():
    files = {}
    for path in ROOT.rglob("*"):
        if not path.is_file():
            continue
        relative = path.relative_to(ROOT)
        if any(part in IGNORED_DIRS for part in relative.parts) or relative.name in IGNORED_FILES:
            continue
        if relative.parts[:2] == ("assets", "gym-gifs") and path.suffix.lower() == ".gif" and path.with_suffix(".webp").exists():
            continue
        if relative.name in FORBIDDEN_FILES or "private" in relative.parts:
            raise ValueError(f"Arquivo pessoal no repositório: {relative}")
        data = path.read_bytes()
        if path.suffix.lower() in {".js", ".json", ".html", ".css", ".txt"}:
            if any(secret.lower() in data.lower() for secret in FORBIDDEN_BYTES):
                raise ValueError(f"Possível dado pessoal em {relative}")
        files[relative.as_posix()] = data
    html = files.get("index.html", b"").decode("utf-8")
    marker = '<body data-forja-variant="shared">'
    if html.count(marker) != 1 or "ota-update.js" not in files:
        raise ValueError("Site público sem marcador de variante ou atualizador")
    files["index.html"] = html.replace(marker, '<body data-forja-variant="personal">').encode("utf-8")
    if not any(name.startswith("assets/gym-gifs/") for name in files):
        raise ValueError("Demonstrações de exercícios ausentes")
    return files


def build(output):
    old = json.loads((ROOT / "ota-manifest.json").read_text(encoding="utf-8"))
    major, minor, patch = map(int, old["version"].split("."))
    version = f"{major}.{minor}.{patch + 1}"
    output.mkdir(parents=True, exist_ok=True)
    bundle = output / f"{version}.zip"
    files = web_files()
    html = files["index.html"].decode("utf-8")
    if html.count('<script src="ota-update.js"></script>') != 1:
        raise ValueError("Referência ao atualizador inesperada")
    files["index.html"] = html.replace('<script src="ota-update.js"></script>', f'<script src="ota-update.js?v={version}"></script>').encode("utf-8")
    with zipfile.ZipFile(bundle, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for name, data in sorted(files.items()):
            archive.writestr(name, data)
    manifest = {
        "variant": "personal",
        "version": version,
        "minNative": old["minNative"],
        "checksum": hashlib.sha256(bundle.read_bytes()).hexdigest(),
        "url": RAW + bundle.name,
    }
    (output / "ota-manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return manifest, bundle


if __name__ == "__main__":
    if sys.argv[1:] == ["--check"]:
        with tempfile.TemporaryDirectory() as folder:
            manifest, bundle = build(Path(folder))
            print(f"Verificado: {manifest['version']} · {len(web_files())} arquivos · {bundle.stat().st_size} bytes")
    elif not sys.argv[1:]:
        manifest, bundle = build(ROOT / "bundles")
        (ROOT / "bundles" / "ota-manifest.json").replace(ROOT / "ota-manifest.json")
        print(f"Pacote {manifest['version']} gerado: {bundle}")
    else:
        raise SystemExit("Uso: python .github/scripts/build-ota.py [--check]")
