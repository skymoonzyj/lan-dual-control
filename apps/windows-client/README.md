# Windows 控制端原型

这是第一版 Windows 控制端壳，用于提前验证中文界面、连接状态、显示参数、声音开关、剪贴板开关和输入事件记录。

## 当前能力

- 手动输入 Mac 局域网 IP 和端口，也可以用“刷新设备”探测本机服务、连接历史和局域网里的 `/discovery` 接口；桌面版会调用本机扫描工具自动扫当前 IPv4 网段，浏览器预览版只轻量探测已知地址，避免网页预览时大量并发探测。刷新后若发现真实在线设备，会优先自动选中 macOS 被控端，填入地址和端口，并把 runtime/build 显示到诊断条。
- 连接密码框现在带明确提示：网页里手动连接时把 Mac 当前临时密码填在当前密码框；如果是 formal/browser runner 的终端隐藏输入提示，则只在黑色终端窗口输入。
- 支持本地模拟握手，也支持 WebSocket 协议连接。
- 支持 hello、auth_request、session_offer、display_settings、video_frame、input_event、clipboard_text 和 reverse_control_request 消息。
- 显示模拟远程桌面画面。
- 接收并渲染假 Mac 服务发送的模拟 `video_frame`。
- 捕获远程画面区域内的鼠标移动、点击、滚轮和键盘事件。
- 支持窗口化和全屏显示切换。
- 支持远控画面内右上角悬浮控制中心：收起时显示当前编码、实收 FPS/远端上限和码率摘要，展开后可快速切换显示屏、画质、分辨率、刷新率、码率、缩放、声音、音量、常用 macOS 快捷键、普通全屏、真全屏、窗口、复制诊断、立即重连和退出远控；全屏后会隐藏顶部工具栏，保留悬浮控制中心作为主要入口，并显示 `Esc` 退出全屏、连接/重连倒计时、当前视频链路、实收 FPS、协商/请求刷新率、远端最高刷新率、低于协商或请求刷新率提示、帧延迟或时钟偏差、回退原因、声音接收帧数/电平/播放计数/音量、文字/文件剪贴板能力、远端文件接收进度或系统剪贴板写入状态、输入模式和安全状态；“复制诊断”会在按钮上短暂显示已复制或复制失败，复制报告也会写入当前全屏浮层的连接、视频、声音、剪贴板、输入和安全状态，方便全屏现场确认；进入全屏时会短暂显示轻提示，提示 `Esc` 退出、当前画质、刷新率、码率和输入状态。真全屏会优先调用浏览器/桌面壳的系统 Fullscreen API，当前环境不支持时自动保留普通全屏并给出中文提示。
- 支持页面内“Mac 监看”小窗模式：顶部按钮或悬浮控制中心可把远控画面缩到右下角，默认只监看、不发送键鼠或快捷键，保留远端画面、连接/视频/输入状态和 Mac 提醒摘要；小窗可拖动、缩放，并提供恢复主窗口、复制诊断和断开。复制/导出诊断会标记当前为“监看小窗”，页面 `--diagnosticsOnly` 自检覆盖禁输入、拖动、恢复和复制诊断。
- 支持画质预设、分辨率、刷新率、码率、声音、剪贴板控制项。
  - 画质预设：流畅、自动、高清、原画、自定义；原画会请求 4K、50 Mbps，并切到原始比例，方便检查细节。
  - 分辨率：1080P、2K、4K。
  - 刷新率：30、60、120、144、240 Hz。
  - 码率：5 Mbps、10 Mbps、15 Mbps、20 Mbps、40 Mbps、50 Mbps。
  - 声音：开关、音量、模拟音频帧状态、真实 PCM 音频播放。
- 支持画面缩放模式：适应窗口、原始比例、拉伸填充。
- 窗口缩放坐标映射和 Windows 到 macOS 快捷键映射有独立回归脚本，覆盖适应窗口黑边、原始比例滚动、拉伸填充，以及 Ctrl+C/V/X/A/Z/Y 等常用快捷键到 Command 组合键的转换。
- 适应窗口时黑边区域会隐藏远端鼠标点并忽略鼠标/滚轮输入；如果从真实画面内拖拽到黑边再松开，会用最后一个有效坐标补发抬起事件，避免远端卡住按下状态。
- 支持多显示器选择骨架：被控端返回 `displays` 后可在控制端选择目标显示器，并通过 `display_settings.displayId` 下发。
- 支持远控 macOS 默认按键映射：Win -> Command、Alt -> Option、Ctrl -> Control，可手动调整并一键还原。
- 默认开启 Windows 常用快捷键兼容：Ctrl+C/V/X/A/Z/S/F/P/O/N/W/T/R 会按 macOS Command 快捷键发送，Ctrl+Y 会转为 Command+Shift+Z。
- 鼠标坐标按实际视频画面区域映射，黑边区域不会误发输入。
- 支持保存连接方式、地址、端口和画质设置。
- 支持最近连接列表。
- 支持连接状态机和中文错误提示；认证失败会显示剩余尝试次数。
- 支持假 Mac 联调错误模拟：密码错误、权限不足、输入被拒绝、视频中断、连接后断开。
- 支持认证门禁联调：未认证连接不能进入会话、输入、剪贴板或反控流程。
- 支持非手动断线后自动重连，最多重试 3 次；重连等待时会显示倒计时并提供“立即重连”按钮，遇到密码错误会停止重连，等待用户确认密码。
- 支持声音接收：处理 `audio_settings_ack`、模拟 `audio_frame` 和真实 `pcm-f32le-base64` PCM 帧，状态栏显示音频帧、音量、音频延迟和播放计数。
- 控制端针对真实体验 blocker 做了稳定性防护：底部状态栏固定单行省略，避免连接后声音/剪贴板/帧率状态文字换行导致远程画面上下抖动；PCM 播放调度加入 80ms 低水位预缓冲，队列超过 450ms 时只修剪尚未开始播放的未来音源，保留当前正在播放的片段，并用 120ms 重同步预缓冲接上最新帧；从后台/切出窗口恢复可见时，如果 WebAudio 队列或计划 source 已明显堆积，会清掉旧 source 并重新接到当前重同步缓冲；恢复后的短跟随窗口内如果队列再次堆到约 180ms，会用 `queue-overflow-snap-live` 丢旧并贴回实时附近；若随后又出现 underrun，会使用约 100ms 恢复缓冲并记录 `queue-underrun-recovery-prebuffer`，让刚从后台切回来的声音尽快贴近实时，同时记录重同步次数、可见恢复次数和最近原因；音频状态文字限频，降低突发音频帧造成的断续。页面自检会覆盖 `Audio buffer guards` 和 `Live status layout stability`。
- 复制/导出诊断新增现场视频和现场声音统计：快速摘要会输出实收 FPS、请求/协商 Hz、视频 live 健康标签、Windows 本地平均/最大帧间隔、远端媒体平均/最大间隔、视频帧数、解码队列、本机队列毫秒、解码延迟、本地过期丢帧、跳过 delta、需要关键帧、H.264 收到帧、关键帧、SPS/PPS/IDR 计数、最近 NAL 类型和最近原因；声音会输出当前 WebAudio 队列毫秒、80/70/450 ms 缓冲阈值、接收/播放/丢弃计数、Windows 本地平均/最大音频间隔、远端音频平均/最大间隔、重同步次数和最近原因。用户反馈“卡”“不像 60Hz”或“声音断续”时，先复制诊断即可看到关键现场数据，并能区分 Mac 产帧/发送节奏、Windows 本地接收/后台节流和系统时钟偏差。
- 支持真实 Mac 视频帧诊断：连接后可区分 `jpeg` 真实视频帧和 `mock-svg` 模拟帧，并记录图片解码失败。
- 支持实收 FPS 统计：刷新率卡片会区分“实收 FPS、协商 Hz、请求 Hz、远端上限 Hz”，普通诊断条和全屏浮层会在实收 FPS 明显低于协商或请求刷新率时提示“低于协商/低于请求”，当 Mac host `/discovery.capabilities.maxScreenFps` 低于用户选择值时直接提示“远端上限 30 Hz”，避免把控制端请求值误认为真实帧率。
- 支持视频帧延迟显示：顶部“帧延迟”卡片和诊断条会用 `video_frame.timestamp` 估算远端帧到达本机时的新鲜度；没有真实帧时间戳时显示等待，两端系统时钟明显不一致时显示“时钟偏差”，不再使用随机模拟延迟。
- 支持 H.264 流式解码入口：当前窗口环境支持 WebCodecs 时会优先请求 `h264`，收到 `annexb-base64` 帧后用 `VideoDecoder` 渲染到视频画布；桌面壳运行时还会把同一批 H.264 Annex B base64 payload 按到达顺序并行推给 W8 Rust 原生视频队列，原生侧会从 SPS/PPS 提取 `codecString`，只读探测 Media Foundation / D3D11 H.264 解码能力，在首个带 SPS/PPS 的帧到达时执行 MF H.264 decoder init preflight，并在首个带 SPS/PPS/IDR 的帧到达时执行 MF sample decode step preflight；原生侧还会维护 `decoderSession` 诊断摘要，累计提交帧、MF 输入接受帧、decoded frame、输出 subtype 和最近状态。真正长期持有 `IMFTransform` 的 runtime 已放进专用 `lan-dual-w8-mf-decoder` worker 线程，Tauri state 只保存可 Send 的通道/线程句柄和摘要；worker 还会返回 decoded frame handoff/latest-frame 摘要、D3D11 native surface target 摘要、decoded sample 写入 latest-frame texture 的 copy/present 摘要，以及 BGRA8 native present target 摘要。诊断/导出里会显示 `原生队列` 帧数、队列毫秒、丢旧帧、`原生解码配置 avc1...`、`原生解码器 ready|blocked`、`D3D11 11_x`、`原生解码初始化 ready|blocked`、`原生输出 ...`、`原生解码步进 ready|blocked`、`原生步进状态 ...`、`原生解码会话 active|blocked`、`原生会话输出 ...`、`原生会话输入 ...`、`原生会话解码 ...`、`原生会话状态 ...`、`原生解码线程 active|blocked`、`原生线程状态 ...`、`原生帧交接 active|blocked`、`原生最新帧 ...`、`原生帧状态 ...`、`原生表面 ready|blocked`、`原生表面目标 D3D11 ...`、`原生表面状态 ...`、`原生表面写入 ... bytes`、`原生表面呈现 ...`、`原生呈现目标 D3D11 ...`、`原生呈现状态 ...`、`原生呈现帧 ...`、最近原因和错误，作为后续把 BGRA8 present texture 接到真实 HWND swapchain/native renderer 的底座；普通浏览器预览版没有 Tauri invoke 时保持原 WebCodecs 路径。现有 WebCodecs 路径会依次探测显式 Annex B 和浏览器默认 H.264 配置，解析 Annex B/AVC NAL 类型识别 IDR/SPS/PPS 关键帧，重配置后会等待关键帧再喂给解码器；首个 decoded surface 画出前会给 1080p/60Hz 等真实 H.264 解码一个短暖机宽限，避免初始队列短暂超过 8 帧/450ms 就关 decoder 后长期等待关键帧；首帧渲染后，本机解码队列超过 8 帧或最旧帧超过 450ms 仍会清掉旧队列，delta 帧先按协商刷新率等待下一关键帧，超时也保持 H.264 并重启视频流，不再因关键帧等待把 Mac 拉到后台 JPEG；已出画面后的 live backlog 超过约 6 帧实时窗口、但未到硬重同步阈值时，会保持当前解码不断流并请求 H.264 关键帧，标记 `live-backlog-keyframe-request`，避免中等积压时提前关 decoder 进入等待关键帧；当控制页从后台/切出窗口恢复可见时，如果 H.264 处于等待关键帧、队列超阈值或刚经历 `queue-overflow-wait-keyframe`，会主动清本机旧队列并请求下一关键帧；恢复后如果低 FPS 下等待关键帧超过约 900ms 仍只收到 delta，会再次保持 H.264/annexb 重试关键帧请求，避免按 60Hz 等 180 个 delta 造成秒级积压；恢复请求后的短窗口内允许小幅本机队列赶上关键帧；一旦恢复请求后的关键帧已经到达但还没绘制，会在诊断里显示“恢复关键帧已收到”，并在短 decode/draw 宽限内避免 queue-overflow 再次 reset decoder 清掉这次进展；如果关键帧到达时旧解码队列已经过高，会标记 `recovery-keyframe-jump-live` 或 `live-backlog-keyframe-jump-live`，表示已丢旧队列并改用当前关键帧追实时；关键帧绘制完成后再清理恢复状态。这样不会因为约 500ms 队列年龄立刻再次关 decoder 形成 `queue-overflow-wait-keyframe` 循环，宽限过期或队列过大仍按低延迟策略丢旧；诊断显示 `visibility-return-h264-recovery`、`keyframe-wait-h264-recovery`、`live-backlog-keyframe-request` 和可见恢复次数；只有连续解码失败或显式兜底路径才请求 JPEG。
- 桌面版 W8 原生视频诊断现在会额外显示真实窗口交换链预检：`原生窗口交换链 ready|blocked`、`原生窗口交换链 D3D11 <width>x<height> BGRA8`、`原生窗口交换链状态 ...` 和 `原生窗口交换链参数 2 buffers / flip-discard`。这代表 Tauri 窗口 HWND 的 swapchain 入口已可探测；最终画面仍需后续 native renderer / NV12 shader 真正 Present。
- 支持 Mac 主机诊断状态条：显示主机模式、运行时 PID/启动时间/build、采集管线、视频来源、WebCodecs 解码状态、H.264 启动回退原因、丢帧、权限、输入模式和剪贴板通道。
- 顶部“输入事件”状态会直接区分安全日志、真实控制、已注入和被拒绝；Mac host 处于 `inputMode=log` 时会显示“安全日志，不会真正控制”，避免把安全记录模式误判为控制失效。
- 支持 `Ctrl+V` 粘贴前预同步本机剪贴板：文字走 `clipboard_text`，浏览器可读图片等剪贴板项走 `clipboard_file_*`；Windows 桌面版还会通过 Tauri 原生层读取资源管理器复制的普通文件/压缩包路径，并按现有文件通道分块发送。未连接或剪贴板同步关闭时，顶部状态和全屏/监看浮层会直接提示“请先连接被控端”或“已关闭”；文件夹暂不递归发送，避免误传整目录；如果系统剪贴板里只有文件夹、原生读取不可用或读取失败，也会直接显示中文原因，不只写事件日志。
- 支持文件剪贴板发送骨架：可手动选择文件、压缩包或图片，按 `clipboard_file_*` 消息分块发送；发送中会显示已发/总量、百分比、基于最近分块样本的速度和预计剩余时间，全屏/监看浮层剪贴板状态也同步显示；发送成功后会先显示等待对端确认，收到对端 `clipboard_file_result` 后会在顶部状态、全屏/监看浮层和事件日志里区分“已写入系统文件剪贴板”“已保存到临时目录”“暂存在远端托盘”或失败原因；如果等待确认期间持续收到当前 `transferId` 的 `clipboard_file_progress`，会刷新保活时间，不会在对端仍在接收大文件时误报确认超时；如果对端直接拒绝文件清单，也会立即显示对端失败原因并把按钮切换为“重新发送”；未连接、剪贴板同步关闭、未选择文件或文件超过当前大小上限时手动发送文件，顶部状态和全屏/监看浮层会直接显示“请先连接被控端”“已关闭”“未选择文件”或“文件过大”；手动选文件会等对端接受成功后再清空选择，对端返回失败或超过 45 秒没有返回确认结果时会保留文件并把按钮切换为“重新发送”；如果分块发送中途收到当前 transfer 的失败结果，也会立即停住、保留文件并切到“重新发送”；超时后已经重新发送时，旧 `transferId` 的迟到清单响应、结果和进度只写事件日志，不覆盖当前等待或发送中状态；本机发送失败时同样会保留当前文件选择，并在顶部状态、浮层和诊断里显示最近失败摘要，可直接重发保留文件；如果被控端已明确报告文件剪贴板不可用，Windows 控制端会在发送前本地拦截手动文件/压缩包发送，不再发出 `clipboard_file_offer`、分块或完成消息，并提示检查被控端文件剪贴板能力或临时使用远端文件托盘/临时目录；复制/导出诊断会额外输出“本机发送建议”，在确认超时、对端失败或本机失败时提示点击“重新发送”或让对端检查文件剪贴板能力、权限和磁盘空间；如果远端文字或文件剪贴板能力不可用，报告还会输出“剪贴板能力建议”，明确文件/压缩包是否不能直接复制粘贴以及该检查哪一端能力。
- 支持远端文件收件托盘：Mac 复制普通文件后，控制端可接收、查看、手动下载；接收中、分块进度、基于最近分块样本的实时速度、预计剩余时间、超限拒绝、解析失败、不完整完成和 45 秒无新分块/完成消息的传输超时都会直接显示在托盘状态条，不只依赖底部剪贴板文字或事件日志；接收端会拒绝未在清单中的 `fileIndex`、不连续 `offset`、重复/错位分块和超过声明大小的分块，避免坏包被误拼成成功文件；Windows 桌面版会把不超过 512MB 的远端文件按 1MB 原生分块写入系统文件剪贴板，原生层会校验分块边界并清理 7 天以上旧临时目录；系统剪贴板写入失败但文件已落盘时，本地事件日志和托盘状态会显示临时目录，可一键打开该目录或重试写入；复制/导出诊断会额外输出“远端文件建议”，在接收超时、中断、坏分块、拒收或系统文件剪贴板写入失败时提示让 Mac 重新复制、检查连接、重试写入或打开临时目录取文件；清空托盘会清掉内存暂存和状态提示，但不会删除系统剪贴板仍可能需要的临时目录；浏览器预览版保留内存暂存。
- 桌面版新增“本机被控”面板：可选择低风险/部署/深度三档体检 Windows host 环境，也可勾选“媒体基线”把 `check-windows-host-readiness --probeMedia` 纳入体检并显示 `media=ok|partial|failed`；面板还能预览防火墙放行命令、用隐藏密码启动/停止 Windows 被控端，并查看启动日志、`/discovery` 状态、runtime build、视频/音频/输入/剪贴板能力、反控策略、Agent Link Board 当前呼叫和体检帧新鲜度阈值；面板会消费 `start-windows-host --status --json --checkBoard` 的只读状态，active Mac -> Windows call 会显示为“Mac 正在请求 Windows 配合”，DONE call 不当作待办，浏览器预览版会保持该面板禁用。启动前可在面板选择反控策略：默认“需确认”不会自动同意 Mac 反控，只有可信局域网短测才切到“实验同意”；如果 Mac 已经发起过反控请求但被默认拒绝，host 在线状态会显示“反控：刚收到请求”并给出“临时允许后让对方重试”的提示；host 在线后可点“临时允许反控”打开约 30 秒一次性授权窗口，下一次 Mac 反控请求通过后自动关闭；同一面板的“Mac 提醒”区可查看、开启或停止 Windows 本机 Agent Link 浮窗 watcher，用于远控窗口最小化或等待 Mac 授权/权限/反控重试时接住提醒，状态 JSON 会读取 watcher 日志里的最近提醒并在面板短摘要显示，也会把 Mac 值守、Mac resume、Mac host readiness、Mac client/formal、formal smoke 和 formal E2E 摘要里的 `warnings=` / `warnings:`、`blockers=` / `blockers:` 短标签直接翻译成中文风险摘要，包括 `fps-limit`、`mac-host-max-fps` 和 `launch-agent-max-fps` 对应的刷新率上限提醒；若 warning/blocker 摘要同时带 `MacUnattendedStatus=` 或 `MacUnattendedFormal=` 安全命令，面板会提示“Mac 值守状态命令已提供”“Mac 值守正式检查命令已提供”；若 stale build / restart recommended 摘要同时带 `MacHostStop=`, 面板会提示“Mac host 停止旧进程命令已提供”；若 Mac readiness 同时带 `MacHostSafeStart=` 和非空 warning/blocker，面板会提示“Mac host 安全启动命令已提供”；若 FPS/LaunchAgent 上限摘要同时带 `MacMaxFpsSafeStart=`，面板会提示“Mac 60Hz 安全启动命令已提供”；若 Mac client/formal 摘要同时带 `MacClientFormalChecklist=`，面板会提示“Mac client 正式清单命令已提供”；若 Windows LAN/firewall 风险同时带 `WindowsFirewallStatus=` 或 `WindowsFirewallPreview=`，面板和复制/导出诊断会提示“Windows 防火墙只读检查命令已提供”“Windows 防火墙放行预览命令已提供”，其中预览仍是 dry-run，不会自动改系统；干净状态不会误弹。自动状态轮询会把 watcher 状态查询节流到约 15 秒一次，避免频繁启动 PowerShell；手动“刷新提醒”和开启/停止按钮仍会立即执行。
- Mac 提醒区和复制/导出诊断会识别 Mac 本机短验收摘要：`MacFormalLocalSmoke=` / `RerunFormalLocalSmoke=` 搭配失败、认证、密码或非空 warning/blocker 时，会显示“Mac 本机短验收需处理”和“Mac 本机短验收重跑命令已提供”，并保留脱敏后的原始重跑命令，方便最小化窗口时也能知道 Mac 侧下一步该先复跑哪条本机短验收。
- Mac 提醒区和复制/导出诊断会识别 Mac 控 Windows 前台密码真测入口：`MacClientPromptPasswordSmoke=` 搭配 Mac client/formal warning、认证、失败、blocker，或 `MacClientDiscoverWindows=` / `discover-windows-hosts` 已发现 Windows host 的摘要时，会显示“Mac client 前台密码真测命令已提供”，并保留原始 `run-mac-client-formal-smoke --promptPassword --boardSummary` 命令；干净命令清单不误弹，Windows 端不会自动运行 Mac 脚本、不会传递密码。
- Mac 提醒区和复制/导出诊断会识别 Mac client 本地 browser 自测入口：`MacClientBrowserSelfTest=` 搭配 Mac client formal smoke、browser self-test、`MacFormalE2E=readyToCall=false`、`MacUnattendedStatus=` / 值守 warning、失败或非空 warning/blocker 上下文时，会显示“Mac client 本地 browser 自测命令已提供”，并保留原始无密自测命令；干净 `warnings=none blockers=none` 命令清单不误弹，Windows 端不会自动运行 Mac 脚本。
- Mac 提醒区和复制/导出诊断会识别 Mac client 页面状态和 readiness 诊断入口：`MacClientPage=` / `MacClientDiagnostics=` 搭配 Mac client page/readiness 离线、不可达、失败、非空 warning/blocker、Windows host、认证、联络板、视频、build 或 repo 风险上下文时，会显示“Mac client 页面状态命令已提供”“Mac client 诊断命令已提供”；干净 `warnings=none blockers=none` 命令清单不误弹，Windows 端不会自动运行 Mac 脚本、不会认证或发送密码/input/inject。
- Mac 提醒区和复制/导出诊断会识别 Mac 脚本 help 安全自检入口：`MacScriptHelp=` 搭配 `MacFormalE2E=readyToCall=false`、失败、旧 build、stale 或非空 warning/blocker 上下文时，会显示“Mac 脚本 help 安全自检命令已提供”，并保留原始 `test-mac-script-help --boardSummary` 命令；干净 `warnings=none blockers=none` 命令清单不误弹，Windows 端不会自动运行 Mac 脚本。
- Mac 提醒区和复制/导出诊断会识别 Mac host readiness 体检入口：`MacHostReadiness=check-mac-host-readiness --checkBoard --boardSummary` 搭配 warning/blocker、Mac host 离线/不可达、旧 build、重启建议、`mac-host-max-fps` 或 `fps-limit` 等上下文时，会显示“Mac host 体检命令已提供”，并保留原始只读命令；干净 `warnings=none blockers=none` 命令清单不会误弹，Windows 端不会自动运行 Mac 脚本。
- Mac 提醒区和复制/导出诊断会识别 Mac 媒体基线入口：`MacHostMedia=check-mac-host-readiness --probeMedia --probeMediaResourceSample --promptPassword --boardSummary` 搭配 heartbeat/resume/unattended/formal 的旧 build、重启建议、H.264/PCM、刷新率或非空 warning/blocker 上下文时，会显示“Mac 媒体基线命令已提供”，并保留原始媒体基线命令；干净 `warnings=none blockers=none` 命令清单不会误弹，Windows 端不会自动运行 Mac 脚本、不会请求或发送密码。
- Mac 提醒区和复制/导出诊断会单独识别 Mac 通过证据：当联络板或 watcher 文本里出现 `MacHostMedia 通过 passed=... media=ok`、`MacFormalLocalSmoke 通过 H.264/PCM/input-log` 或 `MacFormalE2E=status=ok readyToCall=true checklist=passed` 等正向结果时，会显示“证据：Mac 媒体基线已通过 / Mac 本机短验收已通过 / Mac formal E2E 已就绪”或“值守证据 ...”；这些内容不会塞进“风险”摘要，也不会触发任何 Mac 脚本、认证、密码或 input/inject。
- Mac 提醒区和复制/导出诊断会识别 Mac 远端独占声音方案：看到 `MacRemoteAudioPlan=node scripts/mac/plan-mac-remote-audio.mjs --boardSummary` 或 `Mac remote audio plan: ... capture=system-pcm-does-not-mute-local` 时，会把“Mac 远端独占声音方案已提供 / 当前不会自动静音 Mac 本机 / 远端独占声音需用户明确同意 / 不自动改系统音量”写入证据和值守证据；这些内容不进入风险摘要，Windows 端不会运行 Mac 脚本、不会改 Mac 音量或输出设备、不会认证、不会发送密码或 input/inject。
- Mac 提醒区和复制/导出诊断会识别 Mac 真实输入安全方案：看到 `MacInputSafetyPlan=node scripts/mac/plan-mac-input-safety.mjs --boardSummary` 或 `Mac input safety plan: ... realInput=blocked-until-user-watching` 时，会把“Mac 真实输入安全方案已提供 / 默认输入模式保持安全日志 / 真实输入需用户正在看 Mac 屏幕 / 真实输入需 --confirmUserWatching / 先用 safe 输入事件集 / 不发送输入事件或执行注入”写入证据和值守证据；这些内容不进入风险摘要，Windows 端不会运行 Mac 脚本、不会认证、不会请求或发送密码、不会发送 input/inject。
- Mac 提醒区和复制/导出诊断会识别 Mac host 认证路径：看到 `MacHostAuthPath=prompt-password-required reason=launch-agent-ephemeral-password mode=ephemeral next=MacHostStop->MacMaxFpsSafeStart->MacHostMedia` 时，会把“Mac host 需要前台输入连接密码 / 当前 Mac host 是一次性密码模式 / Windows 控制页密码框填写同一个临时密码 / 先在 Mac 前台同密重启 60Hz host / 不要把密码发到通讯板”写入证据和值守证据；这只是把 Mac 值守摘要转成中文提示，Windows 端不会运行 Mac 脚本、不会认证、不会请求或发送密码、不会发送 input/inject。- Mac 提醒区和复制/导出诊断会识别 Mac client 密码输入位置：看到 `MacClientPasswordLocation=Mac client 页面连接 Windows 时，把 Windows 当前临时密码填页面“连接密码”框；formal/browser runner 的终端隐藏输入只用于脚本；不要把密码发通讯板` 时，会把“Mac client 密码输入位置已提示 / Mac client 页面密码框填写 Windows 临时密码 / 终端隐藏输入只用于 formal/browser runner / 不要把密码发到通讯板”写入证据和值守证据；这只是只读中文提示，不运行 Mac 脚本、不认证、不请求或发送密码、不发 input/inject。
- Mac 提醒区和复制/导出诊断会消费干净的通用正向 `Evidence=` / `evidence=` 字段，也会消费 Windows 恢复总览输出的稳定 `MacEvidence=` 字段，以及干净片段里的独立稳定短标签：例如 `Evidence=MacClientPageOnline,MacClientDiagnosticsOk,MacHostMediaOk`、`MacEvidence=MacHostMediaOk,MacFormalLocalSmokeOk,MacClientPageOnline` 或独立 `MacClientPageOnline MacClientDiagnosticsOk` 会显示“Mac client 页面在线 / Mac client 诊断已通过 / Mac 媒体基线已通过 / Mac 本机短验收已通过”。只有无 failed/stale/offline、无非空 warning/blocker 且不包含 Mac 脚本命令的片段才会被识别；`MacHeartbeat=blocked ... evidence=正在重新连接 5/5` 或 `MacClientDiagnosticsOk failed blockers=...` 这类风险证据不会误判为健康证据。
- Mac 提醒区和复制/导出诊断会消费 `PostPassNext=WindowsRecordPassAndTailError+MacManualUxStandby` 和 `ManualUxChecklist=`：Windows 控 Mac formal E2E 主体 PASS 后，会显示“已进入手工体验清单：连接/画面/声音/剪贴板/文件/窗口/全屏/原画/复制诊断”，作为值守证据进入快速摘要，不再把用户带回旧 formal E2E 复跑。
- Mac 提醒区和复制/导出诊断会消费稳定 `MacHeartbeatHealth=` 字段：`MacHeartbeatHealth=ok blockers=none warnings=none` 会显示“Mac 心跳正常”证据；`warning`、`blocked`、`failed`、`stale` 或 `unknown` 会按 `reason=`、status 和风险短标签进入风险摘要，例如 `reason=mac-host-build-stale` 显示“Mac host 运行版本偏旧”，`reason=mac-codex-stale` 显示“Mac Codex 长时间无新进展”。该字段表示健康状态，和 `MacHeartbeatFreshness=` 的“摘要是否新鲜”分开处理。
- Mac 提醒区和复制/导出诊断会消费稳定 `MacPowerHealth=` / `MacUnattendedHealth=` 字段：`system-sleep-enabled`、`display-sleep-enabled` 会显示为“系统睡眠未关闭 / 显示器睡眠未关闭”，`launch-agent-not-loaded` 会显示为“自启动未加载”；如果同段电源/睡眠 warning 里带 `MacPowerPlan=`，会额外显示“Mac 电源预案命令已提供”，如果带 `MacPowerApply=`，会额外显示“Mac 电源授权执行命令已提供”；`ok warnings=none blockers=none`、单独的 `MacPowerPlan=` 预览命令和单独的 `MacPowerApply=` 授权命令不会误弹风险。Windows 端只做本地中文提示和诊断导出，不运行 `pmset`、不加载 LaunchAgent、不运行 Mac 脚本、不执行 `apply-mac-power-settings`、不认证、不发送密码/input/inject。
- Mac 提醒区和复制/导出诊断会把新鲜、干净的 `MacHeartbeat=status=ok` 也显示为“Mac 心跳正常”值守证据：要求 `checkedAt` 未过期、`blockers=none`、`warnings=none` 且 heartbeat 自身不是 blocked/warning/failed；`stale metadata only` 且 `hostRuntimeChanges=0` 这类运行时元数据提示不会误判成“Mac 心跳过期”。
- Mac 提醒区和复制/导出诊断也会识别 Mac client 干净结果证据：`MacClientPage=status=online ... blockers=none warnings=none` 会显示“Mac client 页面在线”，`MacClientDiagnostics=status=ok ... blockers=none warnings=none` 会显示“Mac client 诊断已通过”；这些内容只进入“证据 / 值守证据”，不触发命令提示或风险摘要。
- Mac 提醒区和复制/导出诊断会识别 Mac LaunchAgent 人工切换链：`MacLaunchAgentPlan=` 搭配 warning/blocker、旧 build、重启建议、`fps-limit`、`launch-agent-max-fps` 或 `loaded=false` 等上下文时，会显示“Mac LaunchAgent 预案命令已提供”；`MacLaunchAgentLoad=` / `MacLaunchAgentPrint=` 搭配同类上下文时，会显示“Mac LaunchAgent 加载命令已提供”“Mac LaunchAgent 打印验证命令已提供”，并保留原始 `launchctl bootstrap` / `launchctl print` 命令；干净命令清单不会误弹，Windows 端不会自动执行这些 Mac 系统命令。
- Mac 提醒区和复制/导出诊断会识别 Mac 反控授权摘要：`WindowsReverseGrantStatus=` / `WindowsOpenOneTimeReverseGrant=` 及 Node fallback 搭配 `LAN008`、等待/重试、失败/阻塞或非空 warning/blocker 时，会显示“Windows 反控授权状态命令已提供”和“Windows 一次性反控授权命令已提供”；干净 `warnings=none blockers=none` 的命令清单不会误弹。
- Mac 提醒区和复制/导出诊断会识别 Windows 安全认证路径：`WindowsSecureAuthPath=` / `SecureAuthPath=` 搭配认证、密码、失败、阻塞或非空 warning/blocker 时，会显示“Windows 安全认证路径已提供”，用于提示现场在 Windows 本机用 `start-windows-host --promptPassword --requirePassword` 重启 host 并让两端本地输入同一个临时密码；控制端不会自动运行该命令、不会认证、不会发送密码或 input/inject。
- Mac 提醒区和复制/导出诊断会识别 Windows 防火墙安全排查入口：`WindowsFirewallStatus=` / `WindowsFirewallPreview=` 搭配 `WindowsLanRisk=`、`no-firewall-allow`、`public-profile`、`lan-probe-blocked` 等风险时，会显示“Windows 防火墙只读检查命令已提供”和“Windows 防火墙放行预览命令已提供”；预览命令必须保持 `--dryRunRule` 且不带 `--addRule`，控制端不会自动修改系统防火墙。
- Mac 提醒区和复制/导出诊断会识别 Windows 控制端诊断端口占用摘要：`WinClientPorts=occupied(...;stale-diagnostics)` 会显示“Windows 控制端诊断端口被占用”，同段 `WinClientPortsNext=` 或 `WinClientDiagnosticsAlt=` 会显示“Windows 控制端备用诊断命令已提供”，`WinClientPortsOwners=` 会显示“Windows 控制端端口占用进程已提供”；`WinClientPorts=free` / `WinClientPortsOwners=none` 不会误弹。
- Windows client diagnostics/discovery 模式现在可以安全跑全屏、真全屏和显示设置同步自检：如果页面里只有 discovery/诊断用的轻量 client，没有 `sendDisplaySettings` / `sendAudioSettings` 方法，控制端只更新本地 UI 和偏好，不会再抛 `state.client.sendDisplaySettings is not a function`。现场第二步复查时若默认 `9337` 调试端口被旧 Edge 占用，优先用 `--clientPort 5200 --debugPort 9340` 复跑 `test-windows-client-browser --diagnosticsOnly --boardSummary`。
- Mac 提醒区和复制/导出诊断会识别 Mac heartbeat 复查和 watcher 入口：`MacHeartbeatRerun=` / `MacHeartbeatOnce=` / `MacHeartbeatWatch=` / `MacHeartbeatStart=` / `MacHeartbeatStatus=` / `MacHeartbeatStop=` 搭配 stale、blocked、warning/failed、非空 warning/blocker、旧 build 或 Codex 重连风险时，会显示对应的心跳复查、单次心跳、前台持续 watcher、后台启动、状态查询和停止命令提示；Mac 提醒区提供“心跳一次 / 前台持续 / 后台启动 / 查状态 / 停止心跳”复制按钮，只复制可在 Mac 端执行的安全命令，不会在 Windows 端认证、发送密码或发送 input/inject；`MacHeartbeat=status=ok warnings=none blockers=none` 的干净命令清单不会误弹。
- Mac 提醒 watcher 会把 `checking` / `thinking` / `running` 等进行中状态纳入超时判断，并识别 Mac -> Windows currentCall 长时间未更新、`MacHeartbeat=stale` / `reason=mac-codex-stale` / watchdog 心跳过期、Mac host `/discovery` 不可达、502/Bad Gateway/API 网络错误等文本；Windows 控制端提醒区、快速摘要和复制/导出诊断会翻译成“Mac 心跳过期，可能卡住”“Mac Codex 长时间无新进展”“Mac host 不可达”“Mac/API 网络错误”等中文风险。控制端也会解析 Mac heartbeat 摘要里的 `checkedAt=`、Mac Codex `updatedAt=` / `ageMs=` 和 `boardUpdatedAt=`；若 `checkedAt` 已超过约 2 分钟，会直接显示“Mac 心跳摘要过旧”，导出诊断会写入“Mac 心跳新鲜度”，避免把联络板上遗留的旧 `Mac Heartbeat` 状态误当成当前状态。控制端现在还会优先消费 Windows 恢复总览输出的稳定 `MacHeartbeatFreshness=fresh|stale checked=<秒> codex=<秒> board=<秒>` 短字段；`fresh` 只表示心跳摘要足够新，不会单独显示为“Mac 心跳正常”，`stale` 会显示带相对时间的过旧风险，即使同段有 `MacHeartbeat=node scripts/mac/...` 复查命令，也不会把命令误判成“Mac Codex 刚刚”。健康证据仍来自干净 `MacHeartbeat=status=ok` 或明确的 `Evidence=` / `MacEvidence=` 正向标签。
- Mac 提醒 watcher 和控制端已识别精确 Codex 重连卡住信号：`reason=codex-reconnect-stuck`、`正在重新连接 5/5`、`stream disconnected before completion`，以及 `error sending request` + `/backend-api/codex/responses` 会触发 Windows 本机提醒；提醒区和复制诊断会显示“Mac Codex 可能卡在重新连接 5/5”“检测到 stream disconnected before completion”“请查看 Mac 窗口，可能需要手动重试/刷新”。
- 支持一键反控请求编号、方向状态显示、超时回滚和对端确认。
- 支持收到对端 `reverse_control_request` 时弹出确认。
- 本地事件日志，可一键导出或复制当前诊断报告；报告顶部有“快速摘要”，先汇总远端连接、Mac 主机、Mac 值守、重连、远端文件、远端文件建议、剪贴板、剪贴板能力建议、本机发送文件、本机发送建议、视频、声音、输入模式/ack、全屏浮层、本机协作和画质请求，下面再把远端连接、本机协作和显示能力分段展示。详细内容包含连接状态、Mac 主机模式/采集管线/runtime/权限/视频回退、Mac 值守可远程推断、画质参数、视频链路/实收 FPS/协商或请求刷新率/远端上限/低于协商或请求/帧延迟/回退原因、声音接收/播放/音量/电平/丢帧/错误、剪贴板开关/文字文件能力/能力下一步建议/远端文件接收进度/速度/预计剩余时间/系统剪贴板写入结果、远端文件下一步建议、本机文件发送等待确认/确认超时/可重发状态与文件名、本机发送下一步建议、输入事件与安全日志/真实注入/拒绝状态、全屏浮层连接/视频/声音/剪贴板/输入/安全状态、重连状态、重连等待原因、下次重连倒计时、远端文件状态/进行中接收/临时目录、本机 Mac 提醒 watcher 状态/最近提醒/最近检查时间/轮询间隔、本机被控 Windows host 状态/端口/反控策略/体检档位/最近输出脱敏摘要、最近收到的远端文件和事件记录。Mac 值守当前基于 Windows 侧连接、发现、重连和提醒 watcher 推断；如果 watcher 状态或诊断文本里带 `MacUnattendedStatus`、`MacResumeStatus`、Mac host readiness、Mac formal smoke、`warnings=` / `warnings:`、`blockers=` / `blockers:`，复制/导出诊断会把 `launch-agent-missing`、`launch-agent-max-fps`、`power-risk`、`video`、`build`、`auth`、`windows-host`、`repo`、`board`、`fps-limit`、`mac-host-max-fps`、`mac-host-discovery`、`agent-link-board-currentcall`、`MacUnattendedStatus=`、`MacUnattendedFormal=`、`MacHostReadiness=`、`MacHostMedia=`、`MacHostStop=`、`MacHostSafeStart=`、`MacMaxFpsSafeStart=`、`MacClientFormalChecklist=` 等短标签或命令提示翻译成“自启动未配置”“LaunchAgent 刷新率上限需调整”“电源设置可能导致睡眠断连”“视频链路需检查”“运行版本需检查”“认证/密码步骤待确认”“Windows 被控端未指定或未就绪”“仓库状态需检查”“联络板状态需检查”“Mac 刷新率上限需调整”“Mac host 刷新率上限需调整”“Mac host 发现需检查”“联络板当前呼叫需协调”“Mac 值守状态命令已提供”“Mac 值守正式检查命令已提供”“Mac host 体检命令已提供”“Mac 媒体基线命令已提供”“Mac host 停止旧进程命令已提供”“Mac host 安全启动命令已提供”“Mac 60Hz 安全启动命令已提供”“Mac client 正式清单命令已提供”等中文风险。更完整的 LaunchAgent、自启动、锁屏/睡眠可达性仍以 Mac status/readiness 上报为准。

## 运行方式

### 双击入口：根目录启动器

在仓库根目录双击：

```text
Start-Windows-Control-Mac.cmd
```

它会调用同一个安全入口，先只读读取 Agent Link Board 里的 Mac 目标候选并做 LAN `/discovery` 探测；候选必须真实返回 macOS host discovery 才会被选中，发现 Mac host 时预填最新 LAN 目标，发现失败才回退 `192.168.31.122:43770`。如果需要从终端运行，使用下面的命令。

### 命令入口：打开当前 Mac 控制页

```powershell
node E:\codex\lan-dual-control\scripts\windows\start-windows-control-mac.mjs
```

该入口会先只读读取 Agent Link Board `/api/state` 里的 Mac 目标候选，再对候选、显式 `--discoverHost` 和局域网 `/discovery` 做探测；只有真实返回 macOS host discovery 的地址才会被选中并标记 `targetSource=board-discovery` 或 `discovery`。发现 Mac host 时打开 `http://127.0.0.1:5200/` 并把目标预填为最新 LAN Mac；发现失败才回退 `192.168.31.122:43770`、`WebSocket 局域网`。页面会清空演示密码、聚焦连接密码框，并在密码框下提示“网页手动连接填当前密码框，终端隐藏输入只输黑色终端”；在页面里输入 Mac 端当前临时密码后点“连接”。入口不打印密码、不认证、不发送 input/inject；疑似 `password=...`、token/secret 或 `--password` 的通讯板文本不会进入候选。需要固定回退目标时加 `--noDiscover`，需要关闭通讯板候选时加 `--noBoardTarget`；只想把无密摘要发到通讯板时可运行：

```powershell
node E:\codex\lan-dual-control\scripts\windows\start-windows-control-mac.mjs --dryRun --boardSummary
```
### 方式一：直接打开静态页面

```text
E:\codex\lan-dual-control\apps\windows-client\index.html
```

默认选择“本地模拟”时，不需要启动任何服务。

坐标映射回归可单独运行：

```powershell
node E:\codex\lan-dual-control\scripts\windows\test-coordinate-mapping.mjs
```

需要先查看说明而不运行坐标断言时，可以运行：

```powershell
node E:\codex\lan-dual-control\scripts\windows\test-coordinate-mapping.mjs --help
```

真实 Mac 页面级自检可自动启动本地控制端页面、打开 Edge、连接 Mac，并确认诊断条和视频画面；加 `--requireH264` 可强制要求真实 H.264/WebCodecs 画布解码成功且本次连接 H.264 解码错误计数为 0，加 `--injectPcmAudio` 可额外注入一帧 planar PCM，验证控制端音频播放入口。连接/视频/H.264 和音频播放等待会默认每 10 秒输出一次当前页面快照，可用 `--progressIntervalMs <ms>` 调整，传 `0` 可关闭：
脚本会先回归画面内悬浮控制中心，确认悬浮层、摘要、画质/原画、分辨率、刷新率、码率、缩放、声音、音量、连接/重连状态、视频链路状态、普通诊断条和浮层的低于协商/请求刷新率提示与远端上限提示、声音接收/播放状态、剪贴板/远端文件状态、输入/安全状态条、快捷键发送、复制诊断、进入全屏轻提示、`Esc` 退出全屏、真全屏模拟路径、全屏、监看小窗、立即重连和窗口按钮能同步到原工具栏与页面布局；监看小窗回归会确认默认只监看不发送快捷键、可拖动、可恢复主窗口且复制诊断会标出“监看小窗”；随后会模拟适应窗口黑边输入，确认黑边移动、点击、滚轮不会发远控事件，画面内按下后移到黑边松开也能正常释放。连接成功后还会等待刷新率卡片显示数值型“实收 FPS”和“协商 Hz”，避免把请求刷新率误当成真实帧率。
只需要快速检查诊断条、悬浮控制中心和黑边输入防护时，可加 `--diagnosticsOnly`，不会连接被控端；该路径也会模拟 Mac host `runtime`，确认诊断条能显示 PID、运行时长和 build，并覆盖顶部输入状态的安全日志/真实控制/被拒绝提示、视频帧新鲜度显示、时钟偏差提示、H.264 Annex B/AVC 关键帧识别 helper，以及自动重连倒计时和“立即重连”按钮。Mac 提醒 watcher 或诊断文本里出现 `MacClientDiscoverWindows=` 与 `WindowsLanRisk=no-firewall-allow,public-profile` 等安全短标签时，复制诊断和快速摘要会把它们翻译成 Mac client Windows 发现命令、Windows 防火墙入站放行和 Public 网络风险，避免把 Mac 发现不到 Windows host 误判成 H.264 或页面卡住。Mac host 重启后，可再加 `--discover --expectDiscoveryRuntimeBuildId <build-id>`，脚本会先用 `discover-lan-hosts` 自动选中最佳 Mac host，再通过真实 `/discovery` 无密码验收设备列表、刷新后自动选中 WebSocket 设备、以及诊断条显示的 runtime。已知 IP 且不想扫整段局域网时，可组合 `--discover --discoverNoLocalSubnets --host <Mac IP> --port 43770`。需要把结果发到 Agent Link Board 时，加 `--boardSummary` 会让 stdout 只输出一行无密摘要，详细 `[OK]` 进度会转到 stderr；摘要会额外包含 `W2W3Retest=video=... audio=... h264=...`，直接带出页面“现场视频 / 现场声音”的实收 FPS、请求/协商 Hz、间隔、队列、丢帧、重同步和最近原因；`h264=` 会额外汇总 `status/decoded/skippedDelta/needsKeyframe/queue/queueMs/staleDrops/reason/recovery/pause/recv/key/sps/pps/idr/lastNal`，真实连接时还会带 surface 与 `h264Errors=<n>`。

正式 Mac E2E 长测仍走 `check-mac-formal-e2e.mjs --promptPassword`，密码只经环境变量传给子探针；正式运行会先明确打印正在执行 Plan 1/2 还是 Plan 2/2。Plan 1 在 H.264 首帧确认后还会继续做长视频观察，再做音频观察；Plan 2 才是 Windows client 浏览器 H.264 canvas 检查。视频/音频观察会先打印目标时长，并默认每 10 秒输出一次进度心跳，包含已收帧数、剩余时间、当前 FPS 和最大帧间隔，避免现场把长观察误判为第二步卡住。需要调试心跳频率时可加 `--progressIntervalMs <ms>`，传 `0` 可关闭。正式验收前先跑 discovery 或 formal preflight 的 `--boardSummary` 时，摘要会同时给出 `MacFormalLocalSmoke=check-mac-formal-local-smoke --promptPassword --boardSummary` 和 `MacUnattendedFormal=check-mac-unattended-status --requireLaunchAgentMaxFps --requireLaunchAgentLoaded --boardSummary`；前者用于先让 Mac 本机短验 H.264/PCM/input-log，后者用于把 LaunchAgent max FPS / loaded 当成正式门禁。如果预检发现远端上限只有 30Hz，还会把 `MacMaxFpsPlan=` 放在同一行，用于先规划 Mac LaunchAgent 的 60Hz 上限，再强校验 blocker 是否消失。

真实 60Hz/H.264 复测优先先跑 `check-windows-resume-status --checkBoard --boardSummary`，复制其中 `WinClientRetest=` 或 `WinClientRetestPs=`。这条命令会优先使用通讯板里的 `MAC_READY_FOR_REAL_TEST` / `MacManualUx target=`，在本机终端隐藏提示输入 Mac 临时密码，并强制 `--requireH264 --boardSummary`，复测结束后直接输出可发通讯板的 `W2W3Retest=video=... audio=...`；不要把密码写进命令行、通讯板或 GitHub。

如果第二步现场像是卡在 Windows client browser 检查，先跑 `check-windows-resume-status --checkBoard --boardSummary` 看 `WinClientPorts=`。当前现场曾出现 `WinClientPorts=occupied(9337;stale-diagnostics)`，推荐改用 `--clientPort 5200 --debugPort 9340`；本轮已用备用端口确认 `test-windows-client-browser --discover --discoverNoLocalSubnets --host 192.168.31.122 --port 43770 --clientPort 5200 --debugPort 9340 --diagnosticsOnly --boardSummary --expectDiscoveryRuntimeBuildId ed937a2` 通过，且没有请求密码、认证或发送 input/inject。

```powershell
node E:\codex\lan-dual-control\scripts\windows\discover-lan-hosts.mjs
node E:\codex\lan-dual-control\scripts\windows\discover-lan-hosts.mjs --boardSummary --requireMacHost
node E:\codex\lan-dual-control\scripts\windows\discover-lan-hosts.mjs --noLocalSubnets --host 192.168.31.122 --port 43770 --requireMacHost --boardSummary
node E:\codex\lan-dual-control\scripts\windows\discover-lan-hosts.mjs --subnet 192.168.31.0/24 --requireFound
node E:\codex\lan-dual-control\scripts\windows\test-windows-client-browser.mjs --diagnosticsOnly
node E:\codex\lan-dual-control\scripts\windows\test-windows-client-browser.mjs --diagnosticsOnly --boardSummary
node E:\codex\lan-dual-control\scripts\windows\test-windows-client-browser.mjs --discover --diagnosticsOnly --boardSummary --expectDiscoveryRuntimeBuildId d807536
node E:\codex\lan-dual-control\scripts\windows\test-windows-client-browser.mjs --discover --discoverNoLocalSubnets --host 192.168.31.122 --port 43770 --diagnosticsOnly --boardSummary --expectDiscoveryRuntimeBuildId d807536
node E:\codex\lan-dual-control\scripts\windows\test-windows-client-browser.mjs --diagnosticsOnly --host 192.168.31.122 --port 43770 --expectDiscoveryRuntimeBuildId edcde5e
node E:\codex\lan-dual-control\scripts\windows\test-windows-client-browser.mjs --discover --promptPassword --requirePassword --requireH264
node E:\codex\lan-dual-control\scripts\windows\test-windows-client-browser.mjs --host 192.168.31.122 --port 43770 --password demo-password
node E:\codex\lan-dual-control\scripts\windows\test-windows-client-browser.mjs --host 192.168.31.122 --port 43770 --password demo-password --requireH264
node E:\codex\lan-dual-control\scripts\windows\test-windows-client-browser.mjs --host 192.168.31.122 --port 43770 --password demo-password --injectPcmAudio
node E:\codex\lan-dual-control\scripts\windows\check-mac-formal-e2e.mjs --discover --promptPassword
```

该脚本会保留浏览器 GPU/视频合成能力，避免自检环境把 WebCodecs H.264 误判为不支持；真实 Mac 127.0.0.1:43770 / build `db48055` 已验证 `avc1.420029:annexb` 解码到 1920×1080 canvas，`H264Errors=0`。

该脚本也可在 macOS 开发机上用 Chrome/Edge 跑；找不到浏览器时可设置 `BROWSER_PATH`、`MSEDGE_PATH` 或 `CHROME_PATH`。

### 方式二：使用本地静态服务

```powershell
node E:\codex\lan-dual-control\apps\windows-client\server.mjs 5178
```

然后访问：

```text
http://127.0.0.1:5178/
```

### 方式三：联调 WebSocket 假 Mac

先启动假 Mac 服务：

```powershell
node E:\codex\lan-dual-control\apps\mock-mac-host\server.mjs 43770
```

再打开 Windows 控制端，选择：

- 连接方式：WebSocket 局域网
- 目标地址：127.0.0.1
- 端口：43770
- 连接密码：demo-password

连接成功后，分辨率、刷新率、码率、声音、剪贴板、鼠标键盘输入和一键反控按钮都会通过协议层发送消息。
假 Mac 服务还会持续发送模拟 `video_frame`，用于提前验证 Windows 端画面渲染流程。
如果假 Mac 断开连接，Windows 控制端会进入“重连中”状态并自动尝试恢复；等待期间可以点击“立即重连”马上尝试本次重连，点击“断开”会停止自动重连。
模拟场景中的“输入被拒绝”可用于回归 `input_ack` 失败提示；“反控已同意 / 反控超时 / 对方向我发起反控”可用于提前联调反控状态机。
点击左侧“刷新设备”后，如果假 Mac 服务或真实 Mac host 正在运行，会显示为在线设备；刷新结果里有真实在线设备时会自动填入地址、端口和 WebSocket 连接方式，也可以手动点击列表切换目标。

## 后续对接

等 Mac 端被控服务完成后，优先复用 `protocol-client.js` 的消息格式，对接真实被控服务：

- hello
- auth_request
- session_offer
- display_settings
- video_frame
- audio_frame
- input_event
- clipboard_text
- clipboard_file_offer
- clipboard_file_chunk
- clipboard_file_complete

### W2 H.264 live backlog 诊断

当远端媒体间隔正常但 Windows 本地 H.264 队列开始滞后时，控制端会先保持当前解码不断流并请求新的 H.264 关键帧；诊断里会显示 `追实时请求 <n> 次` 与 `live-backlog-keyframe-request`。如果关键帧到达时本机队列仍超过实时窗口，会清旧队列并从该关键帧追实时，原因标记 `live-backlog-keyframe-jump-live`。
