# AI 分轨 CoreML MLProgram 加速基准

## 结论

Apple Silicon 原本已经使用 CoreML，但默认配置只让 178 个模型算子中的 151 个进入 CoreML，并拆成 28 个分区。改用 MLProgram 配置后，178/178 个算子全部进入同一个 CoreML 分区；4 分 40.58 秒完整歌曲的第二次分轨从 171.13 秒降到 37.34 秒，约提速 4.58 倍。

## 测试环境

- 机器：MacBook Pro（Mac15,6），Apple M3 Pro，11 核 CPU，18GB 内存，arm64。
- 系统：macOS Darwin 25.5.0。
- 分轨程序：`audio-separator[cpu]==0.44.3`。
- 推理运行时：ONNX Runtime 1.27.0。
- 模型：`UVR-MDX-NET-Inst_HQ_3.onnx`。
- 完整输入：280.58 秒、44.1kHz、双声道 PCM WAV。

`[cpu]` 名称只表示安装 ONNX Runtime 的 CPU 发行包；该 macOS arm64 包本身已经包含 `CoreMLExecutionProvider`。`audio-separator[gpu]` 会依赖没有 macOS arm64 安装包的 `onnxruntime-gpu`，因此没有采用。

## 速度结果

| 方案 | 完整歌曲耗时 | 相对基线 |
| --- | ---: | ---: |
| 默认 CoreML | 171.13 秒 | 1.00x |
| MLProgram 正式代码第一次 | 45.46 秒 | 3.76x |
| MLProgram 正式代码第二次 | 37.34 秒 | 4.58x |

第一次包含 CoreML 编译和缓存开销，正式基准按要求取第二次。第二次耗时约为歌曲时长的 13.3%，低于 60 秒目标。

固定 90 秒样本使用正式代码和 `debug` 日志再次运行，耗时 10.78 秒。日志显示：

```text
CoreMLExecutionProvider::GetCapability, number of partitions supported by CoreML: 1
number of nodes in the graph: 178
number of nodes supported by CoreML: 178
All nodes placed on [CoreMLExecutionProvider]
MINERADIO_AI_STEM_PROVIDER=coreml-mlprogram
```

这证明速度提升来自 CoreML 全图执行，不是静默回退 CPU。

## 音质对比

完整歌曲的默认 CoreML 输出与 MLProgram 输出均为 16-bit FLAC：

| 输出轨 | 默认 CoreML 对 MLProgram 的 SDR | 最大采样差异 | NaN / Inf |
| --- | ---: | ---: | ---: |
| 人声 | 114.97 / 115.16 dB（左右声道） | 150 / 32768 | 0 / 0 |
| 伴奏 | 122.92 / 123.52 dB（左右声道） | 134 / 32768 | 0 / 0 |

MLProgram 连续两次输出的两个 FLAC 文件 SHA-256 均完全一致，证明结果可重复。`scripts/test-realtime-stem-precision.js` 的实时模式回归也全部通过；本轮没有修改实时分离算法。

## 实现与回退

- 只在 `darwin/arm64` 请求 MLProgram，Intel Mac 和非 Mac 保持原路径。
- Provider 参数为 `ModelFormat=MLProgram`、`MLComputeUnits=ALL`、`RequireStaticInputShapes=0`、`SpecializationStrategy=FastPrediction`。
- MLProgram 会话建立失败时，自动回退默认 CoreML，并保留 `CPUExecutionProvider` 兜底。
- 实际 Provider 写入分轨缓存 manifest，缓存命中后仍可在界面看到 `CoreML` 或 `CPU`。
- 保留 `audio-separator[cpu]==0.44.3`，不传 0.44.3 不支持的 `--execution_provider` 参数。

## 已知非阻塞警告

任务结束时 CoreML 会输出一次 `E5RT ... input has unbounded dimension`。真实 90 秒和 280.58 秒任务都以状态 0 成功退出，两条音轨时长完整、连续运行结果一致，且无 NaN/Inf，因此本轮记录为非阻塞警告；如果未来升级 ONNX Runtime 或模型，需要重新验证。

## 验证

- `npm run check`：110 项全部通过。
- Electron 使用隔离用户资料和假媒体参数正常启动，没有调用真实摄像头或麦克风。
- `CSC_IDENTITY_AUTO_DISCOVERY=false npm run build:mac:dir`：未签名 arm64 目录包通过。
- `app.asar`：包含 MLProgram 配置和 CPU 安全回退；不包含 `[gpu]` 依赖或 `--execution_provider` 参数。

