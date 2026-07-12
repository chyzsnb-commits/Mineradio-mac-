# Mineradio Mac 定制移植指南

> 本文档面向接手 Mineradio Mac 版的开发者。说明：我们相对 Windows 版做了哪些 Mac 定制、每个定制改了什么、怎么移植到你的代码库、以及怎么跟随 Windows 主线更新而不丢失这些定制。

## 背景

Mineradio 原本是 Windows Electron 应用。我们把它迁移到 macOS（arm64 + x64），并做了若干 Mac 专属优化。这些定制**独立成块**，可以逐个移植，也可以整体应用。

**源仓库**：`chyzsnb-commits/mr`（私有）
**基线**：从 `Mineradio-1.1.3-arm64.dmg`（内部测试版）提取的源码
**Windows 主线**：`XxHuberrr/Mineradio`（公开，Windows 版更新源）

---

## Mac 定制清单（7 个，按依赖顺序）

每个定制对应 `patches/` 里的一个 `.patch` 文件，可独立应用。

| # | patch 文件 | 内容 | 改动文件 | 风险 |
|---|---|---|---|---|
| 1 | `01-telemetry-optin.patch` | 遥测改 opt-in（正式版不上报） | `desktop/telemetry.js`、`CHANGELOG.md` | 低 |
| 2 | `02-remove-auto-update.patch` | 移除自动更新（Mac 不需要） | `package.json`、`build-mac.yml`、`AGENTS.md` | 低 |
| 3 | `03-mac-skip-win-memory.patch` | Mac 跳过 Windows 内存死代码 + 补漏 qishui-api.js | `desktop/main.js`、`qishui-api.js`(新增) | 中 |
| 4 | `04-icon-slim.patch` | 图标无损瘦身（851KB→568KB） | `build/icon.icns`、`build/icon.png`、`CHANGELOG.md` | 低 |
| 5 | `05-mac-memory-panel-and-thermal.patch` | Mac 内存面板（vm_stat+purge）+ 失焦降帧 + 空闲降频 | `desktop/system-memory-mac.js`(新)、`desktop/main.js`、`public/js/modules/00-state/08-desktop-render-power.js`、`public/js/modules/11-main-loop.js` | 中 |
| 6 | `06-x64-build.patch` | 支持 x64（Intel）打包 + CI 双架构 | `package.json`、`.github/workflows/build-mac.yml` | 低 |
| 7 | `07-touchbar.patch` | Touch Bar 基础播放控制（老款 Intel MBP） | `desktop/touchbar.js`(新)、`desktop/main.js` | 低 |

---

## 怎么移植（给接手开发者）

### 方式 A：全部应用（推荐，最简单）

如果你要从 Windows 基线一次性应用所有 Mac 定制：

```bash
# 在你的 Mineradio 代码库根目录
cd /path/to/your/mineradio

# 按顺序应用所有 patch
for p in 01-telemetry-optin 02-remove-auto-update 03-mac-skip-win-memory 04-icon-slim 05-mac-memory-panel-and-thermal 06-x64-build 07-touchbar; do
  git apply --check mac-porting/patches/$p.patch && echo "$p 可应用" || echo "$p 有冲突，需手动处理"
done

# 确认无误后真正应用
for p in mac-porting/patches/*.patch; do
  git apply "$p" || echo "⚠ $p 冲突，手动解决后继续"
done
```

### 方式 B：逐个挑选（只要部分功能）

每个 patch 独立，按需应用。例如只要 Touch Bar：

```bash
git apply mac-porting/patches/07-touchbar.patch
```

### 方式 C：cherry-pick（如果你用同一个 git 仓库）

如果接手者的代码库和 `chyzsnb-commits/mr` 有共同 git 历史，可以直接 cherry-pick（挑选合并）对应 commit：

```bash
git cherry-pick 97c8ac3f  # telemetry opt-in
git cherry-pick 6371ee1c  # touchbar
# ... 等
```

commit sha 见上面的清单表。

---

## 怎么跟随 Windows 主线更新（关键）

Windows 版（`XxHuberrr/Mineradio`）会持续更新。你要把它的更新合并进来，**同时不丢失 Mac 定制**。策略：

### 推荐做法：Mac 定制放独立分支，定期 merge Windows 更新

```
main（你的 Mac 版）
  ↑ merge
mac-customizations（所有 Mac 定制在这，对应本指南的 7 个改动）
  ↑ merge / rebase
windows-upstream（跟踪 XxHuberrr/Mineradio 的更新）
```

**操作步骤**：

1. **Windows 发了新版**（比如 v1.2.0）：
   ```bash
   # 把 Windows 更新拉到 windows-upstream 分支
   git remote add upstream https://github.com/XxHuberrr/Mineradio.git
   git fetch upstream
   ```

2. **合并到你的 Mac 版**：
   ```bash
   git checkout main
   git merge upstream/main  # 或 upstream/master
   ```

3. **解冲突**：Mac 定制涉及的文件（见上表"改动文件"列）可能有冲突。冲突时**保留 Mac 定制的部分**，合并 Windows 的功能改动。常见冲突点：
   - `desktop/main.js`：Mac 改了 systemMemory 加载方式（#3）、Touch Bar 接入（#7）。Windows 更新可能也改 main.js，手动合并两边。
   - `package.json`：Mac 改了 build 配置（#2、#6）。Windows 更新可能改 dependencies/scripts，手动合并。
   - `public/js/modules/11-main-loop.js`：Mac 加了空闲降频（#5）。Windows 更新若重构主循环，需重新应用降频逻辑。

4. **冲突解完后，验证 Mac 定制还在**：
   ```bash
   # 确认 Mac 内存模块还在
   test -f desktop/system-memory-mac.js && echo "✓ 内存模块在"
   # 确认 Touch Bar 还在
   test -f desktop/touchbar.js && echo "✓ Touch Bar 在"
   # 确认 main.js 含 Mac 内存加载（不是 Windows 死代码）
   grep -q "system-memory-mac" desktop/main.js && echo "✓ Mac 内存加载在"
   # 确认失焦降帧还在
   grep -q "isVisibleBackgroundMode" public/js/modules/11-main-loop.js && echo "✓ 失焦降帧在"
   ```

### 冲突太多怎么办

如果 Windows 做了大重构（比如重写了 main.js），merge 冲突太多，可以：
1. 先把 Windows 更新合到一个干净分支
2. 重新应用 Mac 定制（用本指南的 patch 文件，`git apply`）
3. 这样等于"在新的 Windows 基线上重新打 Mac 补丁"

---

## 各定制的详细说明

### 1. telemetry opt-in（遥测改可选）
- **为什么**：1.1.3 默认每 5 分钟强制上报用量，Mac 正式版不需要
- **改了什么**：正式版（`internalBeta` 非 true）完全不启动；测试版首启弹窗询问
- **移植注意**：如果 Windows 版的 telemetry.js 改了，保留 Mac 的 `isInternalBeta()` 判断逻辑

### 2. 移除自动更新
- **为什么**：Mac 版从 Windows 迁移，不要 electron-updater 自动更新
- **改了什么**：删 `build.publish`；构建脚本删 `latest-mac.yml`；CI 不 publish
- **移植注意**：`mineradio.update.disabled` 保留 true（server.js 读它，删了会报错）

### 3. Mac 跳过 Windows 内存死代码 + 补漏 qishui-api
- **为什么**：`system-memory.js` 是 Windows 专用（PowerShell），Mac 加载是死代码
- **改了什么**：`main.js` 第 12-14 行，Mac 用 `system-memory-mac`（见 #5）替代真实模块
- **移植注意**：`qishui-api.js` 是补漏文件（95KB），移植时必须带上

### 4. 图标瘦身
- **为什么**：icon.icns 851KB 过大，无损重压到 568KB
- **移植注意**：直接替换 `build/icon.icns` 和 `build/icon.png` 即可，不改代码

### 5. Mac 内存面板 + 发烫优化（最重要）
三合一改动：
- **Mac 内存面板**：新增 `desktop/system-memory-mac.js`（vm_stat + purge，参考腾讯柠檬）。面板显示真实内存数据，支持一键 purge 清理
- **失焦降帧**：恢复 1.1.0 的 `isVisibleBackgroundMode()`——窗口没聚焦时降到 15 FPS（1.1.3 曾写死 `return false` 禁用，导致发烫）
- **空闲降频**：不播放+无交互时整个主循环降到 2 FPS
- **移植注意**：这是改动最大的一个。如果 Windows 版重构了主循环，降频逻辑要重新定位插入点

### 6. x64 打包
- **为什么**：支持 Intel Mac
- **改了什么**：`package.json` 加 `build:mac:x64` 脚本 + target arch 加 x64；CI 用 matrix（arm64→macos-14，x64→macos-13）
- **移植注意**：x64 必须在 Intel 机器/CI runner 上构建（原生模块兼容）

### 7. Touch Bar
- **为什么**：2016-2019 Intel MBP 有 Touch Bar
- **改了什么**：新增独立模块 `desktop/touchbar.js`，main.js 加一行接入
- **移植注意**：完全独立模块，移植最简单。无 Touch Bar 机器安全 no-op

---

## 移植后的验证清单

应用完 patch 后，依次验证：

```bash
# 1. 语法检查
npm run check

# 2. 启动测试（M 芯片 Mac）
./node_modules/.bin/electron .
# 应看到"粒子音乐可视化 v2"+ 登录态，无报错

# 3. 发烫验证：打开后不播放、切到别的软件，等 1 分钟
#    - 切走后应降到 15 FPS（活动监视器看 Mineradio 的 GPU 占用下降）
#    - 不动鼠标等几秒应降到 2 FPS

# 4. 内存面板：打开内存面板，应显示真实数据（非 0）
#    - 总内存约 18GB、已用 ~70%、可用 ~5GB
#    - 点"系统释放"应弹 Mac 管理员授权框

# 5. arm64 打包
CSC_IDENTITY_AUTO_DISCOVERY=false npm run build:mac:arm64
# 产出 dist/Mineradio-*-arm64.dmg

# 6. Touch Bar（需老款 Intel MBP 实测）
#    Touch Bar 应显示：歌曲名 | << | ▶/⏸ | >>
```

---

## 联系方式

- Mac 定制维护者：GLM（通过 `chyzsnb-commits/mr` 仓库协作）
- Windows 主线：`XxHuberrr/Mineradio`
- 协作规则：见仓库 `.github/AGENT_COLLABORATION.md`
- 项目状态：见 `AI_HANDOFF.md`
