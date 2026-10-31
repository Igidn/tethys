#!/usr/bin/env python3
"""Publish the agent runtime and the tunnel pointer to GitHub releases.

Two tags:

  live            mutable pointer: server.json, runtime.json, install.lua
  agent-vX.Y.Z    immutable code assets plus the runtime.json for that version

Rollback is a pointer rewrite: `--pointer-only --version 1.3.9` copies the
manifest from the immutable tag back onto `live`.
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
AGENTS = ROOT / "agents"
STAGE = ROOT / ".publish"

sys.path.insert(0, str(ROOT / "server"))
from app.config import config  # noqa: E402
from app.tunnel import ensure as ensure_tunnel  # noqa: E402

SKIP_DIRS = {"tests", "__pycache__"}
SKIP_FILES = {"VERSION", "install.lua"}


def now_ms() -> int:
    return int(time.time() * 1000)


def fnv1a(data: bytes) -> str:
    value = 0x811C9DC5
    for byte in data:
        value ^= byte
        value = (value * 0x01000193) & 0xFFFFFFFF
    return f"{value:08x}"


def walk(root: Path) -> list[Path]:
    files: list[Path] = []
    for path in sorted(root.rglob("*")):
        if not path.is_file():
            continue
        rel = path.relative_to(root)
        if any(part.startswith(".") for part in rel.parts):
            continue
        if any(part in SKIP_DIRS for part in rel.parts):
            continue
        if rel.name in SKIP_FILES or rel.suffix == ".md":
            continue
        files.append(rel)
    return files


def asset_name(rel: Path) -> str:
    return str(rel).replace("/", "__")


def build_manifest(version: str, channel: str) -> dict:
    files = []
    seen: dict[str, str] = {}
    for rel in walk(AGENTS):
        asset = asset_name(rel)
        if asset in seen:
            raise SystemExit(f"asset name collision: {rel} and {seen[asset]} both map to {asset}")
        seen[asset] = str(rel)
        data = (AGENTS / rel).read_bytes()
        files.append(
            {
                "path": str(rel),
                "asset": asset,
                "size": len(data),
                "fnv": fnv1a(data),
            }
        )

    manifest = {
        "version": version,
        "tag": f"agent-v{version}",
        "generatedAt": now_ms(),
        "files": files,
    }
    if channel != "stable":
        manifest["channel"] = channel
    return manifest


def server_json(url: str) -> dict:
    return {"url": url.rstrip("/"), "protocol": 1, "updatedAt": now_ms()}


def gh(args: list[str], dry_run: bool) -> str:
    command = ["gh", *args]
    if dry_run:
        print("  + " + " ".join(command))
        return ""
    try:
        done = subprocess.run(command, capture_output=True, text=True, timeout=300)
    except (subprocess.TimeoutExpired, OSError) as error:
        raise SystemExit(f"gh failed: {error}")
    if done.returncode != 0:
        raise SystemExit(f"gh failed: {' '.join(command)}\n{done.stdout}{done.stderr}")
    return done.stdout.strip()


def release_exists(repo: str, tag: str, dry_run: bool) -> bool:
    if dry_run:
        return False
    done = subprocess.run(
        ["gh", "release", "view", tag, "--repo", repo],
        capture_output=True,
        text=True,
        timeout=120,
    )
    return done.returncode == 0


def create_release(repo: str, tag: str, title: str, notes: str, dry_run: bool) -> None:
    gh(
        ["release", "create", tag, "--repo", repo, "--title", title, "--notes", notes],
        dry_run,
    )


def upload(repo: str, tag: str, files: list[Path], dry_run: bool) -> None:
    existing = [str(path) for path in files if path.exists()]
    if len(existing) != len(files):
        missing = [str(path) for path in files if not path.exists()]
        raise SystemExit(f"missing files: {', '.join(missing)}")
    gh(["release", "upload", tag, *existing, "--repo", repo, "--clobber"], dry_run)


def stage_assets(manifest: dict) -> list[Path]:
    """Copy runtime files to flat release asset names.

    GitHub names an uploaded asset after the file's basename, so lib/link.lua
    would land as link.lua. The manifest addresses lib__link.lua, which also
    keeps same-named files in different directories from colliding.
    """
    out_dir = STAGE / "assets"
    if out_dir.exists():
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True)

    staged: list[Path] = []
    for entry in manifest["files"]:
        target = out_dir / entry["asset"]
        shutil.copyfile(AGENTS / entry["path"], target)
        staged.append(target)
    return staged


def resolve_url(explicit: str) -> str:
    if explicit:
        return explicit.rstrip("/")
    if config.public_url:
        return config.public_url.rstrip("/")
    tunnel = ensure_tunnel(config.port, "")
    if not tunnel.url:
        raise SystemExit(f"no public URL: set PUBLIC_URL in server/.env or pass --url ({tunnel.detail})")
    return tunnel.url


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--version", help="agent version; must match agents/VERSION")
    parser.add_argument("--repo", default=config.github_repo)
    parser.add_argument("--url", help="public URL for server.json")
    parser.add_argument("--channel", default="stable", choices=["stable", "canary"])
    parser.add_argument("--pointer-only", action="store_true", help="only move live/runtime.json to an existing version")
    parser.add_argument("--with-installer", action="store_true", help="also publish agents/install.lua")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    if not shutil.which("gh") and not args.dry_run:
        raise SystemExit("gh is not on PATH")

    STAGE.mkdir(exist_ok=True)
    url = resolve_url(args.url)
    print(f"repo    {args.repo}")
    print(f"url     {url}")

    server_file = STAGE / "server.json"
    server_file.write_text(json.dumps(server_json(url), indent=2) + "\n")
    print(f"wrote   {server_file.relative_to(ROOT)}")

    runtime_file = STAGE / "runtime.json"

    if args.pointer_only:
        if not args.version:
            raise SystemExit("--pointer-only requires --version")
        tag = f"agent-v{args.version}"
        print(f"pointer {tag} -> {config.live_tag}")
        gh(
            [
                "release",
                "download",
                tag,
                "--repo",
                args.repo,
                "--pattern",
                "runtime.json",
                "--output",
                str(runtime_file),
                "--clobber",
            ],
            args.dry_run,
        )
        if not args.dry_run:
            print(f"wrote   {runtime_file.relative_to(ROOT)}")
            upload(args.repo, config.live_tag, [runtime_file, server_file], args.dry_run)
        return 0

    version = args.version or (AGENTS / "VERSION").read_text().strip()
    local_version = (AGENTS / "VERSION").read_text().strip()
    if version != local_version:
        raise SystemExit(f"--version {version} does not match agents/VERSION {local_version}")

    manifest = build_manifest(version, args.channel)
    runtime_file.write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"version {version} ({len(manifest['files'])} files)")

    for entry in manifest["files"]:
        print(f"  {entry['path']:<32} {entry['size']:>7}  {entry['fnv']}")

    if not release_exists(args.repo, config.live_tag, args.dry_run):
        create_release(
            args.repo,
            config.live_tag,
            "live",
            "Mutable pointer: tunnel address, agent manifest, installer.",
            args.dry_run,
        )

    if manifest["files"]:
        tag = manifest["tag"]
        if release_exists(args.repo, tag, args.dry_run):
            raise SystemExit(
                f"{tag} already exists; immutable tags are never re-uploaded. Bump agents/VERSION."
            )
        create_release(
            args.repo,
            tag,
            f"agent {version}",
            f"Agent runtime {version}.",
            args.dry_run,
        )
        assets = stage_assets(manifest) + [runtime_file]
        upload(args.repo, tag, assets, args.dry_run)
    else:
        print("no agent files yet; skipping the immutable runtime tag")

    files = [server_file]
    if manifest["files"]:
        files.append(runtime_file)
    if args.with_installer:
        installer = AGENTS / "install.lua"
        if not installer.is_file():
            raise SystemExit("--with-installer given but agents/install.lua does not exist")
        files.append(installer)
    upload(args.repo, config.live_tag, files, args.dry_run)

    base = f"https://github.com/{args.repo}/releases/download/{config.live_tag}"
    print(f"\npublished {base}/server.json")
    if manifest["files"]:
        print(f"pointer   {base}/runtime.json")
    return 0


if __name__ == "__main__":
    sys.exit(main())
