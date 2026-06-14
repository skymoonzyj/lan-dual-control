use std::env;
use std::io::{self, Write};
use std::thread;
use std::time::Duration;

use base64::Engine;
use chrono::{SecondsFormat, Utc};
use serde_json::json;
use windows::core::{factory, Interface};
use windows::Graphics::Capture::{
    Direct3D11CaptureFramePool, GraphicsCaptureItem, GraphicsCaptureSession,
};
use windows::Graphics::DirectX::Direct3D11::IDirect3DDevice;
use windows::Graphics::DirectX::DirectXPixelFormat;
use windows::Graphics::SizeInt32;
use windows::Win32::Foundation::{HMODULE, POINT};
use windows::Win32::Graphics::Direct3D::{
    D3D_DRIVER_TYPE_HARDWARE, D3D_FEATURE_LEVEL, D3D_FEATURE_LEVEL_11_0, D3D_FEATURE_LEVEL_11_1,
};
use windows::Win32::Graphics::Direct3D11::{
    D3D11CreateDevice, ID3D11Device, ID3D11DeviceContext, D3D11_CREATE_DEVICE_BGRA_SUPPORT,
    D3D11_SDK_VERSION,
};
use windows::Win32::Graphics::Dxgi::IDXGIDevice;
use windows::Win32::Graphics::Gdi::{MonitorFromPoint, MONITOR_DEFAULTTONEAREST};
use windows::Win32::System::WinRT::Direct3D11::CreateDirect3D11DeviceFromDXGIDevice;
use windows::Win32::System::WinRT::Graphics::Capture::IGraphicsCaptureItemInterop;
use windows::Win32::System::WinRT::{RoInitialize, RO_INIT_MULTITHREADED};

const ONE_PIXEL_JPEG: &str = "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAX/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAH/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAEFAqf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/AUf/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/AUf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAY/Al//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/IV//2gAMAwEAAgADAAAAEP/EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQMBAT8QUf/EABQRAQAAAAAAAAAAAAAAAAAAABD/2gAIAQIBAT8QUf/EABQQAQAAAAAAAAAAAAAAAAAAABD/2gAIAQEAAT8QUf/Z";

#[derive(Debug, Clone)]
struct Args {
    help: bool,
    probe: bool,
    mock: bool,
    frames: u32,
    fps: u32,
    width: i32,
    height: i32,
    display_x: i32,
    display_y: i32,
}

impl Default for Args {
    fn default() -> Self {
        Self {
            help: false,
            probe: false,
            mock: false,
            frames: 0,
            fps: env_number("LAN_DUAL_WGC_FPS", 30, 1, 240) as u32,
            width: env_number("LAN_DUAL_WGC_WIDTH", 1280, 1, 7680),
            height: env_number("LAN_DUAL_WGC_HEIGHT", 720, 1, 4320),
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
  --probe             Initialize WGC/D3D objects and print one JSON status line
  --mock              Emit json-lines-v1 test JPEG frames for Node integration checks
  --frames <n>        Stop after n mock frames; 0 means run until killed
  --fps <n>           Mock frame rate or requested capture FPS. Default: LAN_DUAL_WGC_FPS or 30
  --width <px>        Requested width. Default: LAN_DUAL_WGC_WIDTH or 1280
  --height <px>       Requested height. Default: LAN_DUAL_WGC_HEIGHT or 720
  --displayX <px>     Monitor lookup point X. Default: LAN_DUAL_WGC_DISPLAY_X or 0
  --displayY <px>     Monitor lookup point Y. Default: LAN_DUAL_WGC_DISPLAY_Y or 0
  --help, -h          Show this help

Description:
  This helper is the native Windows side of LAN_DUAL_WINDOWS_WGC_HELPER.
  The current build verifies WGC initialization and the json-lines-v1 frame
  contract. Real frame readback/JPEG encoding is the next implementation step.
"#
    );
}

fn parse_args() -> Result<Args, String> {
    let mut args = Args::default();
    let mut iter = env::args().skip(1);
    while let Some(token) = iter.next() {
        match token.as_str() {
            "--help" | "-h" => args.help = true,
            "--probe" => args.probe = true,
            "--mock" => args.mock = true,
            "--frames" => args.frames = parse_next(&mut iter, "--frames")?,
            "--fps" => args.fps = parse_next::<u32>(&mut iter, "--fps")?.clamp(1, 240),
            "--width" => args.width = parse_next::<i32>(&mut iter, "--width")?.clamp(1, 7680),
            "--height" => args.height = parse_next::<i32>(&mut iter, "--height")?.clamp(1, 4320),
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

fn now_iso_like() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

fn print_json_line(value: serde_json::Value) -> Result<(), String> {
    let mut stdout = io::stdout().lock();
    serde_json::to_writer(&mut stdout, &value).map_err(|error| error.to_string())?;
    stdout.write_all(b"\n").map_err(|error| error.to_string())?;
    stdout.flush().map_err(|error| error.to_string())
}

fn run_mock(args: &Args) -> Result<(), String> {
    print_json_line(json!({
        "type": "hello",
        "backend": "rust-wgc-helper-contract",
        "codec": "jpeg",
        "encoding": "base64",
        "protocol": "json-lines-v1",
        "width": args.width,
        "height": args.height,
        "fps": args.fps,
    }))?;

    let payload_bytes = base64::engine::general_purpose::STANDARD
        .decode(ONE_PIXEL_JPEG)
        .map(|bytes| bytes.len())
        .unwrap_or(0);
    let frame_delay = Duration::from_millis((1000 / args.fps.max(1) as u64).max(1));
    let mut frame_id = 0u32;
    loop {
        frame_id += 1;
        print_json_line(json!({
            "type": "frame",
            "frameId": frame_id,
            "timestamp": now_iso_like(),
            "width": args.width,
            "height": args.height,
            "sourceWidth": args.width,
            "sourceHeight": args.height,
            "dataBase64": ONE_PIXEL_JPEG,
            "payloadBytes": payload_bytes,
        }))?;
        if args.frames > 0 && frame_id >= args.frames {
            break;
        }
        thread::sleep(frame_delay);
    }
    Ok(())
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

unsafe fn probe_wgc(args: &Args) -> Result<serde_json::Value, String> {
    let _ = RoInitialize(RO_INIT_MULTITHREADED);
    let supported = GraphicsCaptureSession::IsSupported()
        .map_err(|error| format!("GraphicsCaptureSession.IsSupported failed: {error}"))?;
    if !supported {
        return Err("GraphicsCaptureSession.IsSupported returned false".to_string());
    }

    let (d3d_device, d3d_feature_level) = create_d3d11_device()?;
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

    let pool = Direct3D11CaptureFramePool::CreateFreeThreaded(
        &direct3d_device,
        DirectXPixelFormat::B8G8R8A8UIntNormalized,
        2,
        SizeInt32 {
            Width: item_size.Width,
            Height: item_size.Height,
        },
    )
    .map_err(|error| format!("CreateFreeThreaded failed: {error}"))?;
    let session = pool
        .CreateCaptureSession(&item)
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
        "sessionSupported": supported,
        "d3dFeatureLevel": format!("{:?}", d3d_feature_level),
        "displayName": display_name,
        "width": item_size.Width,
        "height": item_size.Height,
        "requestedWidth": args.width,
        "requestedHeight": args.height,
        "requestedFps": args.fps,
        "helperProtocol": "json-lines-v1",
        "nextStep": "read Direct3D11CaptureFrame surfaces and encode JPEG frames",
    }))
}

unsafe fn create_d3d11_device() -> Result<(ID3D11Device, D3D_FEATURE_LEVEL), String> {
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
    Ok((device, selected))
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
        Err(
            "Choose --probe to verify WGC initialization or --mock to emit contract frames."
                .to_string(),
        )
    })();

    if let Err(error) = result {
        eprintln!("[FAIL] {error}");
        std::process::exit(1);
    }
}
