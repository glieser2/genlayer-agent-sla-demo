"""Fetch official SDK data. Adapt renamed release asset; do not modify SDK code."""
import hashlib
import json
from pathlib import Path
import shutil
import urllib.request
from gltest.direct import sdk_loader

ROOT = Path(__file__).resolve().parent
CACHE = ROOT / ".sdk-cache"
VERSION = "v0.3.0-rc7"
ARCHIVE = CACHE / f"genvm-runners-all-{VERSION}.tar.xz"


def configure_sdk():
    sdk_loader.CACHE_DIR = CACHE
    # genlayer-test 0.29.2 still requests genvm-universal.tar.xz (404).
    # Reuse its extractor with the exact official replacement asset.
    def cached_archive(version):
        if version != VERSION or not ARCHIVE.exists():
            raise RuntimeError("Run prepare_sdk.py first; tests never download SDKs")
        return ARCHIVE
    sdk_loader.download_artifacts = cached_archive


if __name__ == "__main__":
    CACHE.mkdir(parents=True, exist_ok=True)
    release_url = f"https://api.github.com/repos/genlayerlabs/genvm/releases/tags/{VERSION}"
    with urllib.request.urlopen(release_url, timeout=30) as response:
        release = json.load(response)
    asset = next(a for a in release["assets"] if a["name"] == "genvm-runners-all.tar.xz")
    if not ARCHIVE.exists():
        print(f"Downloading official {asset['name']} ({asset['size']} bytes)", flush=True)
        with urllib.request.urlopen(asset["browser_download_url"], timeout=60) as source:
            with ARCHIVE.open("wb") as target:
                shutil.copyfileobj(source, target)
    if ARCHIVE.stat().st_size != asset["size"]:
        raise RuntimeError("SDK archive size mismatch; do not use")
    digest = hashlib.file_digest(ARCHIVE.open("rb"), "sha256").hexdigest()
    metadata = {"release": VERSION, "asset_url": asset["browser_download_url"],
                "bytes": asset["size"], "sha256": digest,
                "verification": "official HTTPS source and size; hash recorded locally, not independently authenticated"}
    (ROOT / "sdk-artifact.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    configure_sdk()
    paths = sdk_loader.setup_sdk_paths(ROOT / "contracts" / "agent_sla.py", VERSION)
    print("Official SDK prepared:")
    for path in paths:
        print(path)
