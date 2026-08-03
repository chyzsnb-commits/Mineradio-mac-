// Mineradio 手部姿态原生助手(v12)
// 从 stdin 读定长 RGBA 帧(256×192),用 Vision(VNDetectHumanHandPoseRequest,跑在 ANE 上,不碰 GPU)
// 检测最多 2 只手的 21 点关键点,映射成 MediaPipe 顺序 + 翻 Y,逐帧输出一行 JSON 到 stdout。
// 网页层负责采集(已有摄像头权限),本助手只做推理 —— 故无需任何摄像头权限。
import Foundation
import Vision
import CoreGraphics

let FRAME_W = 256, FRAME_H = 192
let FRAME_BYTES = FRAME_W * FRAME_H * 4

// MediaPipe 21 点顺序对应的 Vision 关节名
let JOINTS: [VNHumanHandPoseObservation.JointName] = [
  .wrist,
  .thumbCMC, .thumbMP, .thumbIP, .thumbTip,
  .indexMCP, .indexPIP, .indexDIP, .indexTip,
  .middleMCP, .middlePIP, .middleDIP, .middleTip,
  .ringMCP, .ringPIP, .ringDIP, .ringTip,
  .littleMCP, .littlePIP, .littleDIP, .littleTip,
]

let handReq = VNDetectHumanHandPoseRequest()
handReq.maximumHandCount = 2

let cs = CGColorSpaceCreateDeviceRGB()

// 从 fd 0 用 POSIX read 稳妥读满 n 字节(阻塞;只有真 EOF 返回 0 才 nil)
func readExactly(_ n: Int) -> Data? {
  var out = Data(count: n)
  var got = 0
  out.withUnsafeMutableBytes { (raw: UnsafeMutableRawBufferPointer) in
    let base = raw.baseAddress!
    while got < n {
      let r = read(0, base.advanced(by: got), n - got)
      if r <= 0 { break }   // 0=EOF, <0=错误
      got += r
    }
  }
  return got == n ? out : nil
}

func cgImage(from rgba: Data) -> CGImage? {
  return rgba.withUnsafeBytes { (raw: UnsafeRawBufferPointer) -> CGImage? in
    guard let base = raw.baseAddress else { return nil }
    guard let ctx = CGContext(data: UnsafeMutableRawPointer(mutating: base),
                              width: FRAME_W, height: FRAME_H, bitsPerComponent: 8,
                              bytesPerRow: FRAME_W * 4, space: cs,
                              bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return nil }
    return ctx.makeImage()
  }
}

func emit(_ s: String) { FileHandle.standardOutput.write((s + "\n").data(using: .utf8)!) }

// 4 字节大端长度前缀 + RGBA 帧
func readFrame() -> Data? {
  guard let lenD = readExactly(4) else { return nil }
  let len = lenD.withUnsafeBytes { $0.load(as: UInt32.self).bigEndian }
  return readExactly(Int(len))
}

emit("{\"ready\":true}")
while let frame = readFrame() {
  if frame.count != FRAME_BYTES { emit("{\"hands\":[]}"); continue }
  guard let img = cgImage(from: frame) else { emit("{\"hands\":[]}"); continue }
  let handler = VNImageRequestHandler(cgImage: img, options: [:])
  var handsJson: [String] = []
  do {
    try handler.perform([handReq])
    for obs in (handReq.results ?? []) {
      var pts: [String] = []
      let recognized = try? obs.recognizedPoints(.all)
      for j in JOINTS {
        if let p = recognized?[j], p.confidence > 0.05 {
          // Vision:原点左下、归一化;翻 Y 成上下原点(与 MediaPipe 一致);X 不动(下游会镜像)
          pts.append(String(format: "[%.4f,%.4f,%.2f]", p.location.x, 1.0 - p.location.y, p.confidence))
        } else {
          pts.append("[0,0,0]")
        }
      }
      handsJson.append("[" + pts.joined(separator: ",") + "]")
    }
  } catch { }
  emit("{\"hands\":[" + handsJson.joined(separator: ",") + "]}")
}
