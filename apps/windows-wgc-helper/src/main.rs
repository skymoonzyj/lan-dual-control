use std::env;
use std::io::{self, Write};
use std::sync::mpsc;
use std::thread;
use std::time::Duration;

use base64::Engine;
use chrono::{SecondsFormat, Utc};
use serde_json::json;
use windows::core::{factory, IInspectable, IUnknown, Interface, PWSTR};
use windows::Foundation::TypedEventHandler;
use windows::Graphics::Capture::{
    Direct3D11CaptureFrame, Direct3D11CaptureFramePool, GraphicsCaptureItem, GraphicsCaptureSession,
};
use windows::Graphics::DirectX::Direct3D11::IDirect3DDevice;
use windows::Graphics::DirectX::DirectXPixelFormat;
use windows::Graphics::SizeInt32;
use windows::Win32::Foundation::{HGLOBAL, HMODULE, POINT};
use windows::Win32::Graphics::Direct3D::{
    D3D_DRIVER_TYPE_HARDWARE, D3D_FEATURE_LEVEL, D3D_FEATURE_LEVEL_11_0, D3D_FEATURE_LEVEL_11_1,
};
use windows::Win32::Graphics::Direct3D11::{
    D3D11CreateDevice, ID3D11Device, ID3D11DeviceContext, ID3D11Resource, ID3D11Texture2D,
    D3D11_CPU_ACCESS_READ, D3D11_CREATE_DEVICE_BGRA_SUPPORT, D3D11_MAPPED_SUBRESOURCE,
    D3D11_MAP_READ, D3D11_SDK_VERSION, D3D11_TEXTURE2D_DESC, D3D11_USAGE_STAGING,
};
use windows::Win32::Graphics::Dxgi::Common::{DXGI_FORMAT_B8G8R8A8_UNORM, DXGI_SAMPLE_DESC};
use windows::Win32::Graphics::Dxgi::IDXGIDevice;
use windows::Win32::Graphics::Gdi::{MonitorFromPoint, MONITOR_DEFAULTTONEAREST};
use windows::Win32::Graphics::Imaging::{
    CLSID_WICImagingFactory, GUID_ContainerFormatJpeg, GUID_WICPixelFormat24bppBGR,
    IWICBitmapFrameEncode, IWICImagingFactory, WICBitmapEncoderNoCache,
};
use windows::Win32::System::Com::StructuredStorage::{
    CreateStreamOnHGlobal, GetHGlobalFromStream, IPropertyBag2, PROPBAG2,
};
use windows::Win32::System::Com::{CoCreateInstance, CLSCTX_INPROC_SERVER};
use windows::Win32::System::Memory::{GlobalLock, GlobalSize, GlobalUnlock};
use windows::Win32::System::Variant::{VARIANT, VT_R4};
use windows::Win32::System::WinRT::Direct3D11::{
    CreateDirect3D11DeviceFromDXGIDevice, IDirect3DDxgiInterfaceAccess,
};
use windows::Win32::System::WinRT::Graphics::Capture::IGraphicsCaptureItemInterop;
use windows::Win32::System::WinRT::{RoInitialize, RO_INIT_MULTITHREADED};

const ONE_PIXEL_JPEG: &str = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAqf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/AUf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/AUf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/Al//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IV//2gAMAwEAAgADAAAAEP/EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQMBAT8QUf/EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQIBAT8QUf/EABQQAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAT8QUf/Z";

#[derive(Debug, Clone)]
struct Args {
    help: bool,
    capture: bool,
    probe: bool,
    mock: bool,
    frames: u32,
    fps: u32,
    width: i32,
    height: i32,
    output_format: OutputFormat,
    helper_protocol: HelperProtocol,
    jpeg_quality: f32,
    display_x: i32,
    display_y: i32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum OutputFormat {
    Jpeg,
    Bgra,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum HelperProtocol {
    JsonLines,
    BinaryFrame,
}

impl OutputFormat {
    fn helper_codec(self) -> &'static str {
        match self {
            OutputFormat::Jpeg => "jpeg",
            OutputFormat::Bgra => "raw-bgra",
        }
    }

    fn pixel_format(self) -> &'static str {
        match self {
            OutputFormat::Jpeg => "bgr24",
            OutputFormat::Bgra => "bgra",
        }
    }
}

impl HelperProtocol {
    fn label(self) -> &'static str {
        match self {
            HelperProtocol::JsonLines => "json-lines-v1",
            HelperProtocol::BinaryFrame => "binary-frame-v1",
        }
    }

    fn frame_encoding(self) -> &'static str {
        match self {
            HelperProtocol::JsonLines => "base64",
            HelperProtocol::BinaryFrame => "binary",
        }
    }
}

impl Default for Args {
    fn default() -> Self {
        Self {
            help: false,
            capture: false,
            probe: false,
            mock: false,
            frames: 0,
            fps: env_number("LAN_DUAL_WGC_FPS", 30, 1, 240) as u32,
            width: env_number("LAN_DUAL_WGC_WIDTH", 1280, 1, 7680),
            height: env_number("LAN_DUAL_WGC_HEIGHT", 720, 1, 4320),
            output_format: env_output_format("LAN_DUAL_WGC_OUTPUT_FORMAT", OutputFormat::Jpeg),
            helper_protocol: env_helper_protocol(
                "LAN_DUAL_WGC_HELPER_PROTOCOL",
                HelperProtocol::JsonLines,
            ),
            jpeg_quality: env_jpeg_quality("LAN_DUAL_WGC_JPEG_QUALITY", 0.62),
            display_x: env_number("LAN_DUAL_WGC_DISPLAY_X", 0, -32768, 32767),
            display_y: env_number("LAN_DUAL_WGC_DISPLAY_Y", 0, -32768, 32767),
        }
    }
}

fn print_help() {
    println!(
        r#"Usage:
  lan-dual-wgc-helper [options]

Options:
  --capture           Start real WGC capture. This is also the default mode
  --probe             Initialize WGC/D3D objects and print one JSON status line
  --mock              Emit json-lines-v1 test JPEG frames for Node integration checks
  --frames <n>        Stop after n frames; 0 means run until killed
  --fps <n>           Frame pacing target. Default: LAN_DUAL_WGC_FPS or 30
  --width <px>        Requested width. Default: LAN_DUAL_WGC_WIDTH or 1280
  --height <px>       Requested height. Default: LAN_DUAL_WGC_HEIGHT or 720
  --outputFormat <f>  jpeg | bgra. Default: LAN_DUAL_WGC_OUTPUT_FORMAT or jpeg
  --protocol <p>      json-lines-v1 | binary-frame-v1. Default: LAN_DUAL_WGC_HELPER_PROTOCOL or json-lines-v1
  --jpegQuality <n>   JPEG quality as 0.01-1.0 or 1-100. Default: LAN_DUAL_WGC_JPEG_QUALITY or 0.62
  --displayX <px>     Monitor lookup point X. Default: LAN_DUAL_WGC_DISPLAY_X or 0
  --displayY <px>     Monitor lookup point Y. Default: LAN_DUAL_WGC_DISPLAY_Y or 0
  --help, -h          Show this help

Description:
  This helper is the native Windows side of LAN_DUAL_WINDOWS_WGC_HELPER.
  Default capture mode reads Direct3D11CaptureFrame surfaces, copies them to a
  CPU-readable D3D11 staging texture, and emits JPEG or raw BGRA frames over
  json-lines-v1 or binary-frame-v1 consumed by apps/windows-host.
"#
    );
}

fn parse_args() -> Result<Args, String> {
    let mut args = Args::default();
    let mut iter = env::args().skip(1);
    while let Some(token) = iter.next() {
        match token.as_str() {
            "--help" | "-h" => args.help = true,
            "--capture" => args.capture = true,
            "--probe" => args.probe = true,
            "--mock" => args.mock = true,
            "--frames" => args.frames = parse_next(&mut iter, "--frames")?,
            "--fps" => args.fps = parse_next::<u32>(&mut iter, "--fps")?.clamp(1, 240),
            "--width" => args.width = parse_next::<i32>(&mut iter, "--width")?.clamp(1, 7680),
            "--height" => args.height = parse_next::<i32>(&mut iter, "--height")?.clamp(1, 4320),
            "--outputFormat" => {
                let value = parse_next::<String>(&mut iter, "--outputFormat")?;
                args.output_format = parse_output_format(&value)?;
            }
            "--protocol" => {
                let value = parse_next::<String>(&mut iter, "--protocol")?;
                args.helper_protocol = parse_helper_protocol(&value)?;
            }
            "--jpegQuality" => {
                let value = parse_next::<f32>(&mut iter, "--jpegQuality")?;
                args.jpeg_quality = normalize_jpeg_quality(value);
            }
            "--displayX" => args.display_x = parse_next(&mut iter, "--displayX")?,
            "--displayY" => args.display_y = parse_next(&mut iter, "--displayY")?,
            _ => return Err(format!("Unknown argument: {token}")),
        }
    }
    Ok(args)
}

fn parse_next<T: std::str::FromStr>(
    iter: &mut impl Iterator<Item = String>,
    flag: &str,
) -> Result<T, String> {
    let value = iter
        .next()
        .ok_or_else(|| format!("{flag} requires a value"))?;
    value
        .parse::<T>()
        .map_err(|_| format!("Invalid value for {flag}: {value}"))
}

fn env_number(name: &str, fallback: i32, min: i32, max: i32) -> i32 {
    env::var(name)
        .ok()
        .and_then(|value| value.parse::<i32>().ok())
        .unwrap_or(fallback)
        .clamp(min, max)
}

fn env_jpeg_quality(name: &str, fallback: f32) -> f32 {
    env::var(name)
        .ok()
        .and_then(|value| value.parse::<f32>().ok())
        .map(normalize_jpeg_quality)
        .unwrap_or_else(|| normalize_jpeg_quality(fallback))
}

fn env_output_format(name: &str, fallback: OutputFormat) -> OutputFormat {
    env::var(name)
        .ok()
        .and_then(|value| parse_output_format(&value).ok())
        .unwrap_or(fallback)
}

fn env_helper_protocol(name: &str, fallback: HelperProtocol) -> HelperProtocol {
    env::var(name)
        .ok()
        .and_then(|value| parse_helper_protocol(&value).ok())
        .unwrap_or(fallback)
}

fn parse_output_format(value: &str) -> Result<OutputFormat, String> {
    match value.trim().to_ascii_lowercase().as_str() {
        "" | "jpeg" | "jpg" | "mjpeg" => Ok(OutputFormat::Jpeg),
        "bgra" | "raw-bgra" | "raw_bgra" | "raw" => Ok(OutputFormat::Bgra),
        other => Err(format!("Unsupported --outputFormat: {other}")),
    }
}

fn parse_helper_protocol(value: &str) -> Result<HelperProtocol, String> {
    match value.trim().to_ascii_lowercase().as_str() {
        "" | "json" | "json-lines" | "json-lines-v1" => Ok(HelperProtocol::JsonLines),
        "binary" | "binary-frame" | "binary-frame-v1" => Ok(HelperProtocol::BinaryFrame),
        other => Err(format!("Unsupported --protocol: {other}")),
    }
}

fn normalize_jpeg_quality(value: f32) -> f32 {
    let normalized = if value > 1.0 { value / 100.0 } else { value };
    normalized.clamp(0.01, 1.0)
}

fn now_iso_like() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

fn print_json_line(value: serde_json::Value) -> Result<(), String> {
    let mut stdout = io::stdout().lock();
    serde_json::to_writer(&mut stdout, &value).map_err(|error| error.to_string())?;
    stdout.write_all(b"\n").map_err(|error| error.to_string())?;
    stdout.flush().map_err(|error| error.to_string())
}

fn print_binary_frame(mut header: serde_json::Value, payload: &[u8]) -> Result<(), String> {
    header["encoding"] = json!("binary");
    header["binaryPayload"] = json!(true);
    header["payloadBytes"] = json!(payload.len());
    let mut stdout = io::stdout().lock();
    serde_json::to_writer(&mut stdout, &header).map_err(|error| error.to_string())?;
    stdout.write_all(b"\n").map_err(|error| error.to_string())?;
    stdout
        .write_all(payload)
        .map_err(|error| error.to_string())?;
    stdout.flush().map_err(|error| error.to_string())
}

fn run_mock(args: &Args) -> Result<(), String> {
    print_json_line(json!({
        "type": "hello",
        "backend": "rust-wgc-helper-contract",
        "codec": args.output_format.helper_codec(),
        "encoding": args.helper_protocol.frame_encoding(),
        "protocol": args.helper_protocol.label(),
        "width": args.width,
        "height": args.height,
        "pixelFormat": args.output_format.pixel_format(),
        "fps": args.fps,
        "jpegQuality": args.jpeg_quality,
    }))?;

    let raw_mock_frame = if args.output_format == OutputFormat::Bgra {
        Some(make_mock_bgra_frame(
            args.width.max(1) as u32,
            args.height.max(1) as u32,
        ))
    } else {
        None
    };
    let jpeg_mock_frame = base64::engine::general_purpose::STANDARD
        .decode(ONE_PIXEL_JPEG)
        .map_err(|error| format!("built-in mock JPEG base64 decode failed: {error}"))?;
    let payload = raw_mock_frame.as_deref().unwrap_or(&jpeg_mock_frame);
    let raw_mock_frame_base64 = raw_mock_frame
        .as_ref()
        .map(|bytes| base64::engine::general_purpose::STANDARD.encode(bytes));
    let payload_bytes = payload.len();
    let frame_delay = Duration::from_millis((1000 / args.fps.max(1) as u64).max(1));
    let mut frame_id = 0u32;
    loop {
        frame_id += 1;
        let mut frame = json!({
            "type": "frame",
            "frameId": frame_id,
            "timestamp": now_iso_like(),
            "width": args.width,
            "height": args.height,
            "sourceWidth": args.width,
            "sourceHeight": args.height,
            "codec": args.output_format.helper_codec(),
            "encoding": args.helper_protocol.frame_encoding(),
            "pixelFormat": args.output_format.pixel_format(),
            "jpegQuality": args.jpeg_quality,
            "scaled": false,
            "payloadBytes": payload_bytes,
        });
        if args.helper_protocol == HelperProtocol::BinaryFrame {
            print_binary_frame(frame, payload)?;
        } else {
            frame["dataBase64"] = json!(raw_mock_frame_base64.as_deref().unwrap_or(ONE_PIXEL_JPEG));
            print_json_line(frame)?;
        }
        if args.frames > 0 && frame_id >= args.frames {
            break;
        }
        thread::sleep(frame_delay);
    }
    Ok(())
}

fn make_mock_bgra_frame(width: u32, height: u32) -> Vec<u8> {
    let width = width.max(1);
    let height = height.max(1);
    let mut pixels = vec![0u8; width as usize * height as usize * 4];
    for y in 0..height {
        for x in 0..width {
            let index = ((y * width + x) * 4) as usize;
            pixels[index] = (x % 256) as u8;
            pixels[index + 1] = (y % 256) as u8;
            pixels[index + 2] = ((x + y) % 256) as u8;
            pixels[index + 3] = 255;
        }
    }
    pixels
}

fn run_probe(args: &Args) -> Result<(), String> {
    let probe = unsafe { probe_wgc(args) };
    match probe {
        Ok(summary) => print_json_line(summary),
        Err(error) => {
            let _ = print_json_line(json!({
                "type": "probe",
                "ok": false,
                "backend": "windows-graphics-capture",
                "error": error,
            }));
            Err(error)
        }
    }
}

fn run_capture(args: &Args) -> Result<(), String> {
    unsafe { capture_wgc(args) }
}

struct WgcObjects {
    d3d_device: ID3D11Device,
    d3d_context: ID3D11DeviceContext,
    direct3d_device: IDirect3DDevice,
    item: GraphicsCaptureItem,
    display_name: String,
    item_size: SizeInt32,
    d3d_feature_level: D3D_FEATURE_LEVEL,
}

struct CapturedFrame {
    width: u32,
    height: u32,
    source_width: u32,
    source_height: u32,
    bytes: Vec<u8>,
}

unsafe fn probe_wgc(args: &Args) -> Result<serde_json::Value, String> {
    let objects = create_wgc_objects(args)?;

    let pool = Direct3D11CaptureFramePool::CreateFreeThreaded(
        &objects.direct3d_device,
        DirectXPixelFormat::B8G8R8A8UIntNormalized,
        2,
        SizeInt32 {
            Width: objects.item_size.Width,
            Height: objects.item_size.Height,
        },
    )
    .map_err(|error| format!("CreateFreeThreaded failed: {error}"))?;
    let session = pool
        .CreateCaptureSession(&objects.item)
        .map_err(|error| format!("CreateCaptureSession failed: {error}"))?;
    let _ = session.SetIsCursorCaptureEnabled(false);
    let _ = session.SetIsBorderRequired(false);
    session
        .Close()
        .map_err(|error| format!("GraphicsCaptureSession.Close failed: {error}"))?;
    pool.Close()
        .map_err(|error| format!("Direct3D11CaptureFramePool.Close failed: {error}"))?;

    Ok(json!({
        "type": "probe",
        "ok": true,
        "backend": "windows-graphics-capture",
        "sessionSupported": true,
        "d3dFeatureLevel": format!("{:?}", objects.d3d_feature_level),
        "displayName": objects.display_name,
        "width": objects.item_size.Width,
        "height": objects.item_size.Height,
        "requestedWidth": args.width,
        "requestedHeight": args.height,
        "requestedFps": args.fps,
        "outputFormat": args.output_format.helper_codec(),
        "pixelFormat": args.output_format.pixel_format(),
        "requestedJpegQuality": args.jpeg_quality,
        "helperProtocol": args.helper_protocol.label(),
        "nextStep": "run helper without --probe/--mock to emit real capture frames",
    }))
}

unsafe fn capture_wgc(args: &Args) -> Result<(), String> {
    let objects = create_wgc_objects(args)?;
    let pool = Direct3D11CaptureFramePool::CreateFreeThreaded(
        &objects.direct3d_device,
        DirectXPixelFormat::B8G8R8A8UIntNormalized,
        2,
        SizeInt32 {
            Width: objects.item_size.Width,
            Height: objects.item_size.Height,
        },
    )
    .map_err(|error| format!("CreateFreeThreaded failed: {error}"))?;
    let session = pool
        .CreateCaptureSession(&objects.item)
        .map_err(|error| format!("CreateCaptureSession failed: {error}"))?;
    let _ = session.SetIsCursorCaptureEnabled(false);
    let _ = session.SetIsBorderRequired(false);
    let (output_width, output_height) = target_dimensions(
        objects.item_size.Width.max(1) as u32,
        objects.item_size.Height.max(1) as u32,
        args.width.max(1) as u32,
        args.height.max(1) as u32,
    );

    print_json_line(json!({
        "type": "hello",
        "backend": "windows-graphics-capture",
        "codec": args.output_format.helper_codec(),
        "encoding": args.helper_protocol.frame_encoding(),
        "protocol": args.helper_protocol.label(),
        "pixelFormat": args.output_format.pixel_format(),
        "displayName": objects.display_name,
        "width": output_width,
        "height": output_height,
        "sourceWidth": objects.item_size.Width,
        "sourceHeight": objects.item_size.Height,
        "requestedWidth": args.width,
        "requestedHeight": args.height,
        "fps": args.fps,
        "jpegQuality": args.jpeg_quality,
        "scaled": output_width != objects.item_size.Width.max(1) as u32 || output_height != objects.item_size.Height.max(1) as u32,
    }))?;

    let (tx, rx) = mpsc::channel::<()>();
    let handler = TypedEventHandler::<Direct3D11CaptureFramePool, IInspectable>::new(
        move |_sender, _args| {
            let _ = tx.send(());
            Ok(())
        },
    );
    let token = pool
        .FrameArrived(&handler)
        .map_err(|error| format!("FrameArrived subscription failed: {error}"))?;

    session
        .StartCapture()
        .map_err(|error| format!("StartCapture failed: {error}"))?;

    let frame_delay = Duration::from_millis((1000 / args.fps.max(1) as u64).max(1));
    let mut emitted = 0u32;
    loop {
        rx.recv_timeout(Duration::from_millis(8000))
            .map_err(|_| "Timed out waiting for a WGC frame".to_string())?;
        let frame = pool
            .TryGetNextFrame()
            .map_err(|error| format!("TryGetNextFrame failed: {error}"))?;
        let captured =
            capture_frame_to_output(&objects.d3d_device, &objects.d3d_context, &frame, args)?;
        frame
            .Close()
            .map_err(|error| format!("Direct3D11CaptureFrame.Close failed: {error}"))?;

        emitted += 1;
        let mut header = json!({
            "type": "frame",
            "frameId": emitted,
            "timestamp": now_iso_like(),
            "width": captured.width,
            "height": captured.height,
            "sourceWidth": captured.source_width,
            "sourceHeight": captured.source_height,
            "codec": args.output_format.helper_codec(),
            "encoding": args.helper_protocol.frame_encoding(),
            "pixelFormat": args.output_format.pixel_format(),
            "jpegQuality": args.jpeg_quality,
            "scaled": captured.width != captured.source_width || captured.height != captured.source_height,
            "payloadBytes": captured.bytes.len(),
        });
        if args.helper_protocol == HelperProtocol::BinaryFrame {
            print_binary_frame(header, &captured.bytes)?;
        } else {
            header["dataBase64"] =
                json!(base64::engine::general_purpose::STANDARD.encode(&captured.bytes));
            print_json_line(header)?;
        }

        if args.frames > 0 && emitted >= args.frames {
            break;
        }
        thread::sleep(frame_delay);
    }

    let _ = pool.RemoveFrameArrived(token);
    session
        .Close()
        .map_err(|error| format!("GraphicsCaptureSession.Close failed: {error}"))?;
    pool.Close()
        .map_err(|error| format!("Direct3D11CaptureFramePool.Close failed: {error}"))?;
    Ok(())
}

unsafe fn create_wgc_objects(args: &Args) -> Result<WgcObjects, String> {
    let _ = RoInitialize(RO_INIT_MULTITHREADED);
    let supported = GraphicsCaptureSession::IsSupported()
        .map_err(|error| format!("GraphicsCaptureSession.IsSupported failed: {error}"))?;
    if !supported {
        return Err("GraphicsCaptureSession.IsSupported returned false".to_string());
    }

    let (d3d_device, d3d_context, d3d_feature_level) = create_d3d11_device()?;
    let direct3d_device = create_winrt_direct3d_device(&d3d_device)?;
    let hmonitor = MonitorFromPoint(
        POINT {
            x: args.display_x,
            y: args.display_y,
        },
        MONITOR_DEFAULTTONEAREST,
    );
    if hmonitor.0.is_null() {
        return Err("MonitorFromPoint did not return a monitor".to_string());
    }

    let item = create_capture_item_for_monitor(hmonitor)?;
    let item_size = item
        .Size()
        .map_err(|error| format!("GraphicsCaptureItem.Size failed: {error}"))?;
    let display_name = item
        .DisplayName()
        .map(|value| value.to_string_lossy())
        .unwrap_or_default();

    Ok(WgcObjects {
        d3d_device,
        d3d_context,
        direct3d_device,
        item,
        display_name,
        item_size,
        d3d_feature_level,
    })
}

unsafe fn create_d3d11_device(
) -> Result<(ID3D11Device, ID3D11DeviceContext, D3D_FEATURE_LEVEL), String> {
    let feature_levels = [D3D_FEATURE_LEVEL_11_1, D3D_FEATURE_LEVEL_11_0];
    let mut device: Option<ID3D11Device> = None;
    let mut context: Option<ID3D11DeviceContext> = None;
    let mut selected = D3D_FEATURE_LEVEL_11_0;
    D3D11CreateDevice(
        None,
        D3D_DRIVER_TYPE_HARDWARE,
        HMODULE::default(),
        D3D11_CREATE_DEVICE_BGRA_SUPPORT,
        Some(&feature_levels),
        D3D11_SDK_VERSION,
        Some(&mut device),
        Some(&mut selected),
        Some(&mut context),
    )
    .map_err(|error| format!("D3D11CreateDevice failed: {error}"))?;
    let device = device.ok_or_else(|| "D3D11CreateDevice returned no device".to_string())?;
    let context =
        context.ok_or_else(|| "D3D11CreateDevice returned no immediate context".to_string())?;
    Ok((device, context, selected))
}

unsafe fn capture_frame_to_output(
    device: &ID3D11Device,
    context: &ID3D11DeviceContext,
    frame: &Direct3D11CaptureFrame,
    args: &Args,
) -> Result<CapturedFrame, String> {
    let surface = frame
        .Surface()
        .map_err(|error| format!("Direct3D11CaptureFrame.Surface failed: {error}"))?;
    let access: IDirect3DDxgiInterfaceAccess = surface.cast().map_err(|error| {
        format!("IDirect3DSurface cast to IDirect3DDxgiInterfaceAccess failed: {error}")
    })?;
    let texture: ID3D11Texture2D = access.GetInterface().map_err(|error| {
        format!("IDirect3DDxgiInterfaceAccess.GetInterface<ID3D11Texture2D> failed: {error}")
    })?;

    let mut desc = D3D11_TEXTURE2D_DESC::default();
    texture.GetDesc(&mut desc);
    if desc.Format != DXGI_FORMAT_B8G8R8A8_UNORM {
        return Err(format!("Unsupported WGC texture format: {:?}", desc.Format));
    }

    let content_size = frame
        .ContentSize()
        .map_err(|error| format!("Direct3D11CaptureFrame.ContentSize failed: {error}"))?;
    let source_width = (content_size.Width.max(1) as u32).min(desc.Width.max(1));
    let source_height = (content_size.Height.max(1) as u32).min(desc.Height.max(1));
    let (width, height) = target_dimensions(
        source_width,
        source_height,
        args.width.max(1) as u32,
        args.height.max(1) as u32,
    );

    let staging_desc = D3D11_TEXTURE2D_DESC {
        Width: desc.Width,
        Height: desc.Height,
        MipLevels: 1,
        ArraySize: 1,
        Format: desc.Format,
        SampleDesc: DXGI_SAMPLE_DESC {
            Count: 1,
            Quality: 0,
        },
        Usage: D3D11_USAGE_STAGING,
        BindFlags: 0,
        CPUAccessFlags: D3D11_CPU_ACCESS_READ.0 as u32,
        MiscFlags: 0,
    };
    let mut staging: Option<ID3D11Texture2D> = None;
    device
        .CreateTexture2D(&staging_desc, None, Some(&mut staging))
        .map_err(|error| format!("CreateTexture2D staging texture failed: {error}"))?;
    let staging =
        staging.ok_or_else(|| "CreateTexture2D returned no staging texture".to_string())?;

    let source_resource: ID3D11Resource = texture
        .cast()
        .map_err(|error| format!("ID3D11Texture2D cast to ID3D11Resource failed: {error}"))?;
    let staging_resource: ID3D11Resource = staging.cast().map_err(|error| {
        format!("staging ID3D11Texture2D cast to ID3D11Resource failed: {error}")
    })?;
    context.CopyResource(&staging_resource, &source_resource);

    let mut mapped = D3D11_MAPPED_SUBRESOURCE::default();
    context
        .Map(&staging_resource, 0, D3D11_MAP_READ, 0, Some(&mut mapped))
        .map_err(|error| format!("ID3D11DeviceContext.Map staging texture failed: {error}"))?;
    let bytes = match args.output_format {
        OutputFormat::Jpeg => {
            copy_mapped_bgra_to_bgr(&mapped, source_width, source_height, width, height).and_then(
                |bgr_pixels| {
                    encode_bgr_to_jpeg(width, height, &bgr_pixels, width * 3, args.jpeg_quality)
                },
            )
        }
        OutputFormat::Bgra => {
            copy_mapped_bgra_to_bgra(&mapped, source_width, source_height, width, height)
        }
    };
    context.Unmap(&staging_resource, 0);
    let bytes = bytes?;

    Ok(CapturedFrame {
        width,
        height,
        source_width,
        source_height,
        bytes,
    })
}

fn target_dimensions(
    source_width: u32,
    source_height: u32,
    requested_width: u32,
    requested_height: u32,
) -> (u32, u32) {
    let requested_width = requested_width.max(1);
    let requested_height = requested_height.max(1);
    if requested_width >= source_width && requested_height >= source_height {
        return (source_width.max(1), source_height.max(1));
    }
    let scale = (requested_width as f64 / source_width.max(1) as f64)
        .min(requested_height as f64 / source_height.max(1) as f64)
        .min(1.0)
        .max(0.001);
    let width = ((source_width as f64 * scale).round() as u32)
        .max(1)
        .min(source_width)
        .min(requested_width);
    let height = ((source_height as f64 * scale).round() as u32)
        .max(1)
        .min(source_height)
        .min(requested_height);
    (width, height)
}

unsafe fn copy_mapped_bgra_to_bgr(
    mapped: &D3D11_MAPPED_SUBRESOURCE,
    source_width: u32,
    source_height: u32,
    target_width: u32,
    target_height: u32,
) -> Result<Vec<u8>, String> {
    if mapped.pData.is_null() {
        return Err("Mapped WGC texture returned null data".to_string());
    }
    let row_pitch = mapped.RowPitch as usize;
    let source_width = source_width as usize;
    let source_height = source_height as usize;
    let target_width = target_width as usize;
    let target_height = target_height as usize;
    let source_row_bytes = source_width
        .checked_mul(4)
        .ok_or_else(|| "WGC frame width overflow".to_string())?;
    if row_pitch < source_row_bytes {
        return Err(format!(
            "Mapped WGC row pitch {row_pitch} is smaller than expected {source_row_bytes}"
        ));
    }
    let source_len = row_pitch
        .checked_mul(source_height)
        .ok_or_else(|| "WGC mapped source length overflow".to_string())?;
    let source = std::slice::from_raw_parts(mapped.pData as *const u8, source_len);
    let mut output = vec![0u8; target_width * target_height * 3];
    if target_width == source_width && target_height == source_height {
        for y in 0..target_height {
            let source_row = &source[y * row_pitch..y * row_pitch + source_row_bytes];
            let output_row = &mut output[y * target_width * 3..(y + 1) * target_width * 3];
            for x in 0..target_width {
                let source_index = x * 4;
                let output_index = x * 3;
                output_row[output_index] = source_row[source_index];
                output_row[output_index + 1] = source_row[source_index + 1];
                output_row[output_index + 2] = source_row[source_index + 2];
            }
        }
        return Ok(output);
    }

    let scale_x = source_width as f64 / target_width as f64;
    let scale_y = source_height as f64 / target_height as f64;
    for y in 0..target_height {
        let source_y = ((y as f64 + 0.5) * scale_y - 0.5).clamp(0.0, (source_height - 1) as f64);
        let y0 = source_y.floor() as usize;
        let y1 = (y0 + 1).min(source_height - 1);
        let wy = source_y - y0 as f64;
        for x in 0..target_width {
            let source_x = ((x as f64 + 0.5) * scale_x - 0.5).clamp(0.0, (source_width - 1) as f64);
            let x0 = source_x.floor() as usize;
            let x1 = (x0 + 1).min(source_width - 1);
            let wx = source_x - x0 as f64;
            let output_index = (y * target_width + x) * 3;
            for channel in 0..3 {
                let p00 = source[y0 * row_pitch + x0 * 4 + channel] as f64;
                let p10 = source[y0 * row_pitch + x1 * 4 + channel] as f64;
                let p01 = source[y1 * row_pitch + x0 * 4 + channel] as f64;
                let p11 = source[y1 * row_pitch + x1 * 4 + channel] as f64;
                let top = p00 + (p10 - p00) * wx;
                let bottom = p01 + (p11 - p01) * wx;
                output[output_index + channel] = (top + (bottom - top) * wy).round() as u8;
            }
        }
    }
    Ok(output)
}

unsafe fn copy_mapped_bgra_to_bgra(
    mapped: &D3D11_MAPPED_SUBRESOURCE,
    source_width: u32,
    source_height: u32,
    target_width: u32,
    target_height: u32,
) -> Result<Vec<u8>, String> {
    if mapped.pData.is_null() {
        return Err("Mapped WGC texture returned null data".to_string());
    }
    let row_pitch = mapped.RowPitch as usize;
    let source_width = source_width as usize;
    let source_height = source_height as usize;
    let target_width = target_width as usize;
    let target_height = target_height as usize;
    let source_row_bytes = source_width
        .checked_mul(4)
        .ok_or_else(|| "WGC frame width overflow".to_string())?;
    if row_pitch < source_row_bytes {
        return Err(format!(
            "Mapped WGC row pitch {row_pitch} is smaller than expected {source_row_bytes}"
        ));
    }
    let source_len = row_pitch
        .checked_mul(source_height)
        .ok_or_else(|| "WGC mapped source length overflow".to_string())?;
    let source = std::slice::from_raw_parts(mapped.pData as *const u8, source_len);
    let mut output = vec![0u8; target_width * target_height * 4];
    if target_width == source_width && target_height == source_height {
        for y in 0..target_height {
            let source_row = &source[y * row_pitch..y * row_pitch + source_row_bytes];
            let output_row = &mut output[y * target_width * 4..(y + 1) * target_width * 4];
            output_row.copy_from_slice(&source_row[..target_width * 4]);
        }
        return Ok(output);
    }

    let scale_x = source_width as f64 / target_width as f64;
    let scale_y = source_height as f64 / target_height as f64;
    for y in 0..target_height {
        let source_y = ((y as f64 + 0.5) * scale_y - 0.5).clamp(0.0, (source_height - 1) as f64);
        let y0 = source_y.floor() as usize;
        let y1 = (y0 + 1).min(source_height - 1);
        let wy = source_y - y0 as f64;
        for x in 0..target_width {
            let source_x = ((x as f64 + 0.5) * scale_x - 0.5).clamp(0.0, (source_width - 1) as f64);
            let x0 = source_x.floor() as usize;
            let x1 = (x0 + 1).min(source_width - 1);
            let wx = source_x - x0 as f64;
            let output_index = (y * target_width + x) * 4;
            for channel in 0..4 {
                let p00 = source[y0 * row_pitch + x0 * 4 + channel] as f64;
                let p10 = source[y0 * row_pitch + x1 * 4 + channel] as f64;
                let p01 = source[y1 * row_pitch + x0 * 4 + channel] as f64;
                let p11 = source[y1 * row_pitch + x1 * 4 + channel] as f64;
                let top = p00 + (p10 - p00) * wx;
                let bottom = p01 + (p11 - p01) * wx;
                output[output_index + channel] = (top + (bottom - top) * wy).round() as u8;
            }
        }
    }
    Ok(output)
}

unsafe fn encode_bgr_to_jpeg(
    width: u32,
    height: u32,
    pixels: &[u8],
    stride: u32,
    jpeg_quality: f32,
) -> Result<Vec<u8>, String> {
    let expected_len = stride as usize * height as usize;
    if pixels.len() < expected_len {
        return Err(format!(
            "BGR pixel buffer too small: {} < {expected_len}",
            pixels.len()
        ));
    }

    let factory: IWICImagingFactory = CoCreateInstance(
        &CLSID_WICImagingFactory,
        None::<&IUnknown>,
        CLSCTX_INPROC_SERVER,
    )
    .map_err(|error| format!("CoCreateInstance(WICImagingFactory) failed: {error}"))?;
    let stream = CreateStreamOnHGlobal(HGLOBAL::default(), true)
        .map_err(|error| format!("CreateStreamOnHGlobal failed: {error}"))?;
    let encoder = factory
        .CreateEncoder(&GUID_ContainerFormatJpeg, std::ptr::null())
        .map_err(|error| format!("CreateEncoder(JPEG) failed: {error}"))?;
    encoder
        .Initialize(&stream, WICBitmapEncoderNoCache)
        .map_err(|error| format!("JPEG encoder Initialize failed: {error}"))?;

    let mut frame: Option<IWICBitmapFrameEncode> = None;
    let mut options: Option<IPropertyBag2> = None;
    encoder
        .CreateNewFrame(&mut frame, &mut options)
        .map_err(|error| format!("JPEG encoder CreateNewFrame failed: {error}"))?;
    let frame = frame.ok_or_else(|| "JPEG encoder returned no frame".to_string())?;
    if let Some(options) = options.as_ref() {
        set_jpeg_quality(options, jpeg_quality)?;
    }
    frame
        .Initialize(options.as_ref())
        .map_err(|error| format!("JPEG frame Initialize failed: {error}"))?;
    frame
        .SetSize(width, height)
        .map_err(|error| format!("JPEG frame SetSize failed: {error}"))?;
    let mut pixel_format = GUID_WICPixelFormat24bppBGR;
    frame
        .SetPixelFormat(&mut pixel_format)
        .map_err(|error| format!("JPEG frame SetPixelFormat failed: {error}"))?;
    if pixel_format != GUID_WICPixelFormat24bppBGR {
        return Err(format!(
            "JPEG encoder changed pixel format from 24bppBGR to {:?}",
            pixel_format
        ));
    }
    frame
        .WritePixels(height, stride, &pixels[..expected_len])
        .map_err(|error| format!("JPEG frame WritePixels failed: {error}"))?;
    frame
        .Commit()
        .map_err(|error| format!("JPEG frame Commit failed: {error}"))?;
    encoder
        .Commit()
        .map_err(|error| format!("JPEG encoder Commit failed: {error}"))?;

    let hglobal = GetHGlobalFromStream(&stream)
        .map_err(|error| format!("GetHGlobalFromStream failed: {error}"))?;
    let size = GlobalSize(hglobal);
    if size == 0 {
        return Err("JPEG encoder produced an empty HGLOBAL".to_string());
    }
    let ptr = GlobalLock(hglobal);
    if ptr.is_null() {
        return Err("GlobalLock failed for JPEG HGLOBAL".to_string());
    }
    let bytes = std::slice::from_raw_parts(ptr as *const u8, size).to_vec();
    let _ = GlobalUnlock(hglobal);
    Ok(bytes)
}

unsafe fn set_jpeg_quality(options: &IPropertyBag2, jpeg_quality: f32) -> Result<(), String> {
    let mut name: Vec<u16> = "ImageQuality"
        .encode_utf16()
        .chain(std::iter::once(0))
        .collect();
    let prop = PROPBAG2 {
        vt: VT_R4,
        pstrName: PWSTR(name.as_mut_ptr()),
        ..Default::default()
    };
    let value = VARIANT::from(normalize_jpeg_quality(jpeg_quality));
    options
        .Write(1, &prop, &value)
        .map_err(|error| format!("JPEG encoder ImageQuality option failed: {error}"))
}

unsafe fn create_winrt_direct3d_device(device: &ID3D11Device) -> Result<IDirect3DDevice, String> {
    let dxgi_device: IDXGIDevice = device
        .cast()
        .map_err(|error| format!("ID3D11Device cast to IDXGIDevice failed: {error}"))?;
    let inspectable = CreateDirect3D11DeviceFromDXGIDevice(&dxgi_device)
        .map_err(|error| format!("CreateDirect3D11DeviceFromDXGIDevice failed: {error}"))?;
    inspectable
        .cast::<IDirect3DDevice>()
        .map_err(|error| format!("IInspectable cast to IDirect3DDevice failed: {error}"))
}

unsafe fn create_capture_item_for_monitor(
    monitor: windows::Win32::Graphics::Gdi::HMONITOR,
) -> Result<GraphicsCaptureItem, String> {
    let interop: IGraphicsCaptureItemInterop =
        factory::<GraphicsCaptureItem, IGraphicsCaptureItemInterop>()
            .map_err(|error| format!("IGraphicsCaptureItemInterop factory failed: {error}"))?;
    interop
        .CreateForMonitor::<GraphicsCaptureItem>(monitor)
        .map_err(|error| format!("CreateForMonitor failed: {error}"))
}

fn main() {
    let result = (|| -> Result<(), String> {
        let args = parse_args()?;
        if args.help {
            print_help();
            return Ok(());
        }
        if args.probe {
            return run_probe(&args);
        }
        if args.mock {
            return run_mock(&args);
        }
        run_capture(&args)
    })();

    if let Err(error) = result {
        eprintln!("[FAIL] {error}");
        std::process::exit(1);
    }
}
