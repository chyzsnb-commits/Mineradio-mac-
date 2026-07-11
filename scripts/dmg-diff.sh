#!/usr/bin/env bash
# scripts/dmg-diff.sh
# 对比两个 Mineradio .dmg 包体，产出 markdown 差异报告。
# 用法: ./scripts/dmg-diff.sh <old.dmg> <new.dmg> [output.md]
#
# 对比维度（复现 1.1.0 vs 1.1.3 那种分析）:
#   - DMG 体积、文件系统
#   - .app 体积、Info.plist（版本/appId/签名标识）
#   - 代码签名状态
#   - Resources/app 模块清单、server.js/main.js 行数
#   - package.json 的 mineradio 自定义字段（internalBeta/update 等）
#   - DMG 视觉包装（背景图/卷图标）
set -euo pipefail

OLD="${1:-}"
NEW="${2:-}"
OUT="${3:-/dev/stdout}"

if [ -z "$OLD" ] || [ -z "$NEW" ]; then
  echo "用法: $0 <old.dmg> <new.dmg> [output.md]" >&2
  exit 1
fi

for f in "$OLD" "$NEW"; do
  [ -f "$f" ] || { echo "文件不存在: $f" >&2; exit 1; }
done

OLD_NAME=$(basename "$OLD" | sed 's/\.dmg$//')
NEW_NAME=$(basename "$NEW" | sed 's/\.dmg$//')
OLD_MNT=$(mktemp -d -t mrdiff_old)
NEW_MNT=$(mktemp -d -t mrdiff_new)
cleanup() {
  hdiutil detach "$OLD_MNT" -quiet 2>/dev/null || true
  hdiutil detach "$NEW_MNT" -quiet 2>/dev/null || true
  rmdir "$OLD_MNT" "$NEW_MNT" 2>/dev/null || true
}
trap cleanup EXIT

echo "挂载 $OLD_NAME ..." >&2
hdiutil attach "$OLD" -nobrowse -readonly -mountpoint "$OLD_MNT" -quiet >&2
echo "挂载 $NEW_NAME ..." >&2
hdiutil attach "$NEW" -nobrowse -readonly -mountpoint "$NEW_MNT" -quiet >&2

OLD_APP=$(find "$OLD_MNT" -maxdepth 2 -name "*.app" | head -1)
NEW_APP=$(find "$NEW_MNT" -maxdepth 2 -name "*.app" | head -1)
[ -z "$OLD_APP" ] && { echo "OLD 中找不到 .app" >&2; exit 1; }
[ -z "$NEW_APP" ] && { echo "NEW 中找不到 .app" >&2; exit 1; }

OLD_APP_REL="Mineradio.app"
NEW_APP_REL="Mineradio.app"

# ---- 辅助函数 ----
dmg_size_mb() { du -m "$1" 2>/dev/null | cut -f1; }
app_size_mb() { du -sm "$1" 2>/dev/null | cut -f1; }
plist_get() { /usr/libexec/PlistBuddy -c "Print :$2" "$1/Contents/Info.plist" 2>/dev/null || echo "(无)"; }
line_count() { [ -f "$1" ] && wc -l < "$1" | tr -d ' ' || echo "0"; }

OLD_DMG_MB=$(dmg_size_mb "$OLD")
NEW_DMG_MB=$(dmg_size_mb "$NEW")
OLD_APP_MB=$(app_size_mb "$OLD_APP")
NEW_APP_MB=$(app_size_mb "$NEW_APP")

OLD_VER=$(plist_get "$OLD_APP" CFBundleShortVersionString)
NEW_VER=$(plist_get "$NEW_APP" CFBundleShortVersionString)
OLD_BUNDLE_VER=$(plist_get "$OLD_APP" CFBundleVersion)
NEW_BUNDLE_VER=$(plist_get "$NEW_APP" CFBundleVersion)
OLD_BUNDLE_ID=$(plist_get "$OLD_APP" CFBundleIdentifier)
NEW_BUNDLE_ID=$(plist_get "$NEW_APP" CFBundleIdentifier)
OLD_ELECTRON=$(/usr/libexec/PlistBuddy -c "Print :CFBundleVersion" "$OLD_APP/Contents/Frameworks/Electron Framework.framework/Versions/A/Resources/Info.plist" 2>/dev/null || echo "?")
NEW_ELECTRON=$(/usr/libexec/PlistBuddy -c "Print :CFBundleVersion" "$NEW_APP/Contents/Frameworks/Electron Framework.framework/Versions/A/Resources/Info.plist" 2>/dev/null || echo "?")

# 签名
OLD_SIG=$(codesign -dv --verbose=2 "$OLD_APP" 2>&1 | grep -E "^Identifier=|^Signature=" | tr '\n' ' ')
NEW_SIG=$(codesign -dv --verbose=2 "$NEW_APP" 2>&1 | grep -E "^Identifier=|^Signature=" | tr '\n' ' ')

# 代码规模
OLD_SERVER=$(line_count "$OLD_APP/Contents/Resources/app/server.js")
NEW_SERVER=$(line_count "$NEW_APP/Contents/Resources/app/server.js")
OLD_MAIN=$(line_count "$OLD_APP/Contents/Resources/app/desktop/main.js")
NEW_MAIN=$(line_count "$NEW_APP/Contents/Resources/app/desktop/main.js")

# 模块清单（Resources/app 顶层）
OLD_MODULES=$(ls "$OLD_APP/Contents/Resources/app/" 2>/dev/null | grep -E '\.js$' | sort | tr '\n' ' ')
NEW_MODULES=$(ls "$NEW_APP/Contents/Resources/app/desktop/" 2>/dev/null | grep -E '\.js$' | sort | tr '\n' ' ')

# package.json 关键字段
mr_field() {
  local app="$1" field="$2"
  python3 -c "
import json,sys
try:
  d=json.load(open('$app/Contents/Resources/app/package.json'))
  m=d.get('mineradio',{})
  u=m.get('update',{})
  print('update.provider=' + str(u.get('provider','?')) + ' | internalBeta=' + str(m.get('internalBeta',False)) + ' | name=' + str(d.get('name','?')))
except Exception as e:
  print('读取失败:', e)
" 2>/dev/null || echo "(读取失败)"
}

# DMG 视觉包装
OLD_VISUAL=""
[ -f "$OLD_MNT/.background.tiff" ] && OLD_VISUAL="$OLD_VISUAL 背景图"
[ -f "$OLD_MNT/.VolumeIcon.icns" ] && OLD_VISUAL="$OLD_VISUAL 卷图标"
NEW_VISUAL=""
[ -f "$NEW_MNT/.background.tiff" ] && NEW_VISUAL="$NEW_VISUAL 背景图"
[ -f "$NEW_MNT/.VolumeIcon.icns" ] && NEW_VISUAL="$NEW_VISUAL 卷图标"
OLD_VISUAL=${OLD_VISUAL:-无}
NEW_VISUAL=${NEW_VISUAL:-无}

# ---- 输出报告 ----
{
echo "# Mineradio 包体对比: $OLD_VER vs $NEW_VER"
echo ""
echo "| 维度 | $OLD_VER | $NEW_VER |"
echo "|---|---|---|"
echo "| DMG 体积 | ${OLD_DMG_MB} MB | ${NEW_DMG_MB} MB |"
echo "| .app 体积 | ${OLD_APP_MB} MB | ${NEW_APP_MB} MB |"
echo "| 版本号 | $OLD_VER (bundle $OLD_BUNDLE_VER) | $NEW_VER (bundle $NEW_BUNDLE_VER) |"
echo "| Bundle ID | \`$OLD_BUNDLE_ID\` | \`$NEW_BUNDLE_ID\` |"
echo "| Electron | $OLD_ELECTRON | $NEW_ELECTRON |"
echo "| 签名 | $OLD_SIG | $NEW_SIG |"
echo "| server.js 行数 | $OLD_SERVER | $NEW_SERVER |"
echo "| main.js 行数 | $OLD_MAIN | $NEW_MAIN |"
echo "| DMG 视觉包装 | $OLD_VISUAL | $NEW_VISUAL |"
echo ""
echo "## package.json 关键字段"
echo ""
echo "- **$OLD_VER**: $(mr_field "$OLD_APP" x)"
echo "- **$NEW_VER**: $(mr_field "$NEW_APP" x)"
echo ""
echo "## desktop/ 模块清单"
echo ""
echo "- **$OLD_VER**: \`$OLD_MODULES\`"
echo "- **$NEW_VER**: \`$NEW_MODULES\`"
echo ""
echo "---"
echo "_由 \`scripts/dmg-diff.sh\` 自动生成 · $(date '+%Y-%m-%d %H:%M')_"
} > "$OUT"

# 默认输出到 stdout 时，上面重定向已直接写到 stdout；指定文件时不重复打印
if [ "$OUT" != "/dev/stdout" ]; then
  cat "$OUT"
fi

echo "" >&2
echo "对比完成，报告已输出。" >&2
