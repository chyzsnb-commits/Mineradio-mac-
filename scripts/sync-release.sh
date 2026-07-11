#!/usr/bin/env bash
# scripts/sync-release.sh
# 正式版发布后，把本仓库（mr，私有）的最新 Release 资产同步到
# 公开发布仓库（Mineradio-mac-），供用户端 electron-updater 拉取自动更新。
#
# 前置条件：
#   - 配置仓库 secret RELEASE_SYNC_TOKEN（对 Mineradio-mac- 有写权限的 PAT）
#   - 在 CI 中由 build-mac.yml 的 stable 分支调用
#
# 本地也可手动跑：RELEASE_SYNC_TOKEN=xxx bash scripts/sync-release.sh <tag>
set -euo pipefail

SRC_REPO="chyzsnb-commits/mr"
DST_REPO="chyzsnb-commits/Mineradio-mac-"
TAG="${1:-}"

if [ -z "${RELEASE_SYNC_TOKEN:-}" ]; then
  echo "⚠ RELEASE_SYNC_TOKEN 未配置，跳过同步。" >&2
  echo "  配置方法：创建一个对 $DST_REPO 有 repo 权限的 PAT，加到 mr 仓库的 Settings → Secrets → RELEASE_SYNC_TOKEN" >&2
  exit 0
fi

export GH_TOKEN="$RELEASE_SYNC_TOKEN"

if [ -z "$TAG" ]; then
  TAG=$(gh release list -R "$SRC_REPO" -L 1 --json tagName -q '.[0].tagName')
  echo "未指定 tag，使用最新 release: $TAG"
fi

echo "=== 同步 $TAG 的资产: $SRC_REPO → $DST_REPO ==="

TMPDIR_SYNC=$(mktemp -d)
trap 'rm -rf "$TMPDIR_SYNC"' EXIT

# 下载源仓库的资产
gh release download "$TAG" -R "$SRC_REPO" -D "$TMPDIR_SYNC" --clobber

echo "下载的资产:"
ls -la "$TMPDIR_SYNC"

# 在目标仓库创建/更新同名 release 并上传
if gh release view "$TAG" -R "$DST_REPO" >/dev/null 2>&1; then
  echo "目标 release 已存在，更新资产"
  gh release upload "$TAG" -R "$DST_REPO" "$TMPDIR_SYNC"/* --clobber
else
  echo "创建目标 release"
  gh release create "$TAG" -R "$DST_REPO" "$TMPDIR_SYNC"/* --title "Mineradio $TAG" --generate-notes
fi

echo "✓ 同步完成。用户端将从 $DST_REPO 拉取自动更新。"
