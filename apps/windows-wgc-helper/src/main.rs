use std::env;
use std::io::{self, Write};
use std::sync::mpsc;
use std::thread;
use std::time::Duration;

use base64::Engine;
use chrono::{SecondsFormat, Utc};
use serde_json::json;
use windows::core::{factory, IInspectable, IUnknown, Interface};
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
    CreateStreamOnHGlobal, GetHGlobalFromStream, IPropertyBag2,
};
use windows::Win32::System::Com::{CoCreateInstance, CLSCTX_INPROC_SERVER};
use windows::Win32::System::Memory::{GlobalLock, GlobalSize, GlobalUnlock};
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
    display_x: i32,
    display_y: i32,
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
  --displayX <px>     Monitor lookup point X. Default: LAN_DUAL_WGC_DISPLAY_X or 0
  --displayY <px>     Monitor lookup point Y. Default: LAN_DUAL_WGC_DISPLAY_Y or 0
  --help, -h          Show this help

Description:
  This helper is the native Windows side of LAN_DUAL_WINDOWS_WGC_HELPER.
  Default capture mode reads Direct3D11CaptureFrame surfaces, copies them to a
  CPU-readable D3D11 staging texture, encodes JPEG with WIC, and emits frames
  over the json-lines-v1 contract consumed by apps/windows-host.
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

struct CapturedJpeg {
    width: u32,
    height: u32,
    source_width: u32,
    source_height: u32,
    jpeg: Vec<u8>,
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
        "helperProtocol": "json-lines-v1",
        "nextStep": "run helper without --probe/--mock to emit real JPEG frames",
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

    print_json_line(json!({
        "type": "hello",
        "backend": "windows-graphics-capture",
        "codec": "jpeg",
        "encoding": "base64",
        "protocol": "json-lines-v1",
        "displayName": objects.display_name,
        "width": objects.item_size.Width,
        "height": objects.item_size.Height,
        "sourceWidth": objects.item_size.Width,
        "sourceHeight": objects.item_size.Height,
        "requestedWidth": args.width,
        "requestedHeight": args.height,
        "fps": args.fps,
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
        let captured = capture_frame_to_jpeg(&objects.d3d_device, &objects.d3d_context, &frame)?;
        frame
            .Close()
            .map_err(|error| format!("Direct3D11CaptureFrame.Close failed: {error}"))?;

        emitted += 1;
        print_json_line(json!({
            "type": "frame",
            "frameId": emitted,
            "timestamp": now_iso_like(),
            "width": captured.width,
            "height": captured.height,
            "sourceWidth": captured.source_width,
            "sourceHeight": captured.source_height,
            "dataBase64": base64::engine::general_purpose::STANDARD.encode(&captured.jpeg),
            "payloadBytes": captured.jpeg.len(),
        }))?;

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

unsafe fn capture_frame_to_jpeg(
    device: &ID3D11Device,
    context: &ID3D11DeviceContext,
    frame: &Direct3D11CaptureFrame,
) -> Result<CapturedJpeg, String> {
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
    let width = (content_size.Width.max(1) as u32).min(desc.Width.max(1));
    let height = (content_size.Height.max(1) as u32).min(desc.Height.max(1));

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
    let bgr_pixels = copy_mapped_bgra_to_bgr(&mapped, width, height);
    context.Unmap(&staging_resource, 0);
    let bgr_pixels = bgr_pixels?;
    let jpeg = encode_bgr_to_jpeg(width, height, &bgr_pixels, width * 3)?;

    Ok(CapturedJpeg {
        width,
        height,
        source_width: desc.Width,
        source_height: desc.Height,
        jpeg,
    })
}

unsafe fn copy_mapped_bgra_to_bgr(
    mapped: &D3D11_MAPPED_SUBRESOURCE,
    width: u32,
    height: u32,
) -> Result<Vec<u8>, String> {
    if mapped.pData.is_null() {
        return Err("Mapped WGC texture returned null data".to_string());
    }
    let row_pitch = mapped.RowPitch as usize;
    let width = width as usize;
    let height = height as usize;
    let source_row_bytes = width
        .checked_mul(4)
        .ok_or_else(|| "WGC frame width overflow".to_string())?;
    if row_pitch < source_row_bytes {
        return Err(format!(
            "Mapped WGC row pitch {row_pitch} is smaller than expected {source_row_bytes}"
        ));
    }
    let source_len = row_pitch
        .checked_mul(height)
        .ok_or_else(|| "WGC mapped source length overflow".to_string())?;
    let source = std::slice::from_raw_parts(mapped.pData as *const u8, source_len);
    let mut output = vec![0u8; width * height * 3];
    for y in 0..height {
        let source_row = &source[y * row_pitch..y * row_pitch + source_row_bytes];
        let output_row = &mut output[y * width * 3..(y + 1) * width * 3];
        for x in 0..width {
            let source_index = x * 4;
            let output_index = x * 3;
            output_row[output_index] = source_row[source_index];
            output_row[output_index + 1] = source_row[source_index + 1];
            output_row[output_index + 2] = source_row[source_index + 2];
        }
    }
    Ok(output)
}

unsafe fn encode_bgr_to_jpeg(
    width: u32,
    height: u32,
    pixels: &[u8],
    stride: u32,
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
