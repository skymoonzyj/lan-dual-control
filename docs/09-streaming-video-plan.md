# 流式视频编码计划

目标：把当前“后台截图 + JPEG 帧”的调试链路升级为真正的低延迟视频流。

## 目标体验

第一阶段目标：

- 1080P。
- 30 FPS。
- H.264。
- 局域网低延迟。
- Windows 控制端显示实收 FPS、协商帧率、丢帧和解码状态。

第二阶段再推进：

- 2K / 60 FPS。
- 4K / 60 FPS。
- HEVC 可选。
- 动态码率。
- 硬件编码参数优化。

## 当前 JPEG 链路定位

当前链路：

```text
CGDisplayCreateImage -> JPEG -> dataUrl -> WebSocket -> img 渲染
```

它继续保留，作为：

- 权限验证。
- 兜底画面。
- 协议调试。
- H.264 失败后的回退模式。

它不再作为长期性能目标。

## H.264 第一版链路

```text
ScreenCaptureKit SCStream
-> CVPixelBuffer
-> VideoToolbox VTCompressionSession
-> H.264 Annex B
-> WebSocket 二进制帧或 JSON + base64 过渡
-> Windows 控制端解码渲染
```

第一版优先使用 H.264：

- Windows 解码路径更成熟。
- WebView、浏览器、Media Foundation 都更容易支持。
- 局域网 1080P/30FPS 足够先验证远控体验。

## 协议字段

`session_offer` 里控制端优先请求：

```json
{
  "preferredVideoCodec": "h264",
  "preferredVideoEncoding": "annexb",
  "maxFps": 30,
  "maxBandwidthKbps": 20000
}
```

`session_answer` 返回实际协商结果：

```json
{
  "videoCodec": "h264",
  "videoEncoding": "annexb",
  "fps": 30,
  "requestedFps": 60,
  "capturePipeline": "screencapturekit-h264",
  "hardwareEncoder": true
}
```

H.264 帧第一版仍沿用 `video_frame`：

```json
{
  "type": "video_frame",
  "frameId": 1,
  "timestamp": "2026-06-12T12:00:00.000Z",
  "width": 1920,
  "height": 1080,
  "codec": "h264",
  "codecString": "avc1.42E01F",
  "encoding": "annexb-base64",
  "keyFrame": true,
  "timestampUs": 0,
  "durationUs": 33333,
  "capturePipeline": "screencapturekit-h264",
  "payload": "AAAA..."
}
```

后续性能不足时，把 `payload` 从 base64 迁移到 WebSocket 二进制帧。

## Mac 端任务

1. 新增 `SCStream` 连续采集管线。
2. 新增 `VTCompressionSession` H.264 编码器。
3. 支持关键帧请求和固定 GOP。
4. 根据 `maxBandwidthKbps` 设置平均码率。
5. 输出 `video_frame codec=h264`。
6. 保留 JPEG 回退。

当前实现进度：
- Mac 端已新增 `SCStream` + `VTCompressionSession` 的 H.264 输出入口。
- Mac 真机已通过本机强校验：`probe-mac-host.mjs --requireH264 --expectInputMode log` 返回 `h264` / `annexb-base64` / `screencapturekit-h264`。
- Windows 端已新增 WebCodecs `VideoDecoder` 渲染入口。
- 过渡期仍通过 JSON `video_frame.payload` 传输 base64，后续再迁移到二进制 WebSocket 帧。

## Windows 端任务

1. 检测 WebView2 是否支持 WebCodecs。
2. 若 WebCodecs 可用，优先用 `VideoDecoder` 解码 H.264。
3. 若不可用，准备 Tauri 原生层接 Media Foundation。
4. 显示实收 FPS、解码延迟、丢帧数量。
5. 解码失败时回退到 JPEG 模式并提示。

## 验收

- 1080P/30FPS 下，实收 FPS 稳定接近 30。
- 鼠标移动时画面延迟明显低于 JPEG 链路。
- CPU 占用可接受。
- 断开连接后编码器和采集流释放干净。
- 无权限时仍能回退到模拟帧或给出中文错误。
