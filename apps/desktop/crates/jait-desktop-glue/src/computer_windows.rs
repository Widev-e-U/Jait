//! Windows desktop effects. All callers must hold an approved host lease.
use base64::{engine::general_purpose::STANDARD, Engine as _};
use image::{DynamicImage, ImageBuffer, ImageFormat, Rgba};
use serde_json::{json, Value};
use std::{io::Cursor, mem::size_of, ptr};
use windows_sys::Win32::Foundation::GlobalFree;
use windows_sys::Win32::Graphics::Gdi::*;
use windows_sys::Win32::System::DataExchange::*;
use windows_sys::Win32::System::LibraryLoader::GetModuleHandleW;
use windows_sys::Win32::System::Memory::*;
use windows_sys::Win32::System::Ole::CF_UNICODETEXT;
use windows_sys::Win32::UI::Input::KeyboardAndMouse::*;
use windows_sys::Win32::UI::WindowsAndMessaging::*;

fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(Some(0)).collect()
}

pub(crate) fn confirm() -> bool {
    // This is a native host prompt: remote arguments cannot provide an approval.
    unsafe {
        MessageBoxW(ptr::null_mut(), wide("Allow this chat to control this computer and synchronize clipboard text for up to 30 minutes?\n\nPress Ctrl+Alt+Escape to revoke control at any time.").as_ptr(), wide("Jait computer control").as_ptr(), MB_YESNO | MB_ICONWARNING | MB_SETFOREGROUND | MB_TOPMOST) == IDYES
    }
}

pub(crate) fn abort_pressed() -> bool {
    unsafe {
        GetAsyncKeyState(VK_CONTROL as i32) < 0
            && GetAsyncKeyState(VK_MENU as i32) < 0
            && GetAsyncKeyState(VK_ESCAPE as i32) < 0
    }
}

#[derive(Clone, Copy)]
struct Bounds {
    x: i32,
    y: i32,
    width: i32,
    height: i32,
}
fn bounds() -> Result<Bounds, String> {
    let b = unsafe {
        Bounds {
            x: GetSystemMetrics(SM_XVIRTUALSCREEN),
            y: GetSystemMetrics(SM_YVIRTUALSCREEN),
            width: GetSystemMetrics(SM_CXVIRTUALSCREEN),
            height: GetSystemMetrics(SM_CYVIRTUALSCREEN),
        }
    };
    if b.width <= 0
        || b.height <= 0
        || b.width > 16_384
        || b.height > 16_384
        || i64::from(b.width) * i64::from(b.height) > 32_000_000
    {
        return Err("Desktop dimensions are unavailable or too large".into());
    }
    Ok(b)
}

pub(crate) fn geometry() -> Result<Value, String> {
    let b = bounds()?;
    Ok(
        json!({"originX": b.x, "originY": b.y, "width": b.width, "height": b.height,
        "monitorCount": unsafe { GetSystemMetrics(SM_CMONITORS) }}),
    )
}

pub(crate) fn ensure_geometry(params: &Value) -> Result<(), String> {
    let Some(expected) = params.get("expectedGeometry") else { return Ok(()) };
    let current = geometry()?;
    if current["monitorCount"] != 1 || current != *expected {
        return Err("The captured desktop geometry has changed".into());
    }
    Ok(())
}

pub(crate) fn observe() -> Result<Value, String> {
    let b = bounds()?;
    let pixels_len = (b.width as usize) * (b.height as usize) * 4;
    let mut pixels = vec![0u8; pixels_len];
    unsafe {
        let screen = GetDC(ptr::null_mut());
        if screen.is_null() {
            return Err("Could not acquire desktop".into());
        }
        let mem = CreateCompatibleDC(screen);
        if mem.is_null() {
            ReleaseDC(ptr::null_mut(), screen);
            return Err("Could not create capture context".into());
        }
        let bitmap = CreateCompatibleBitmap(screen, b.width, b.height);
        if bitmap.is_null() {
            DeleteDC(mem);
            ReleaseDC(ptr::null_mut(), screen);
            return Err("Could not create capture bitmap".into());
        }
        let previous = SelectObject(mem, bitmap as _);
        let copied = BitBlt(
            mem,
            0,
            0,
            b.width,
            b.height,
            screen,
            b.x,
            b.y,
            SRCCOPY | CAPTUREBLT,
        ) != 0;
        SelectObject(mem, previous);
        let mut info: BITMAPINFO = std::mem::zeroed();
        info.bmiHeader.biSize = size_of::<BITMAPINFOHEADER>() as u32;
        info.bmiHeader.biWidth = b.width;
        info.bmiHeader.biHeight = -b.height;
        info.bmiHeader.biPlanes = 1;
        info.bmiHeader.biBitCount = 32;
        info.bmiHeader.biCompression = BI_RGB;
        let lines = if copied {
            GetDIBits(
                mem,
                bitmap,
                0,
                b.height as u32,
                pixels.as_mut_ptr().cast(),
                &mut info,
                DIB_RGB_COLORS,
            )
        } else {
            0
        };
        DeleteObject(bitmap as _);
        DeleteDC(mem);
        ReleaseDC(ptr::null_mut(), screen);
        if lines != b.height {
            return Err("Desktop capture failed".into());
        }
    }
    for pixel in pixels.chunks_exact_mut(4) {
        pixel.swap(0, 2);
        pixel[3] = 255;
    }
    let image = ImageBuffer::<Rgba<u8>, _>::from_raw(b.width as u32, b.height as u32, pixels)
        .ok_or("Invalid screenshot dimensions")?;
    let mut encoded = Cursor::new(Vec::new());
    DynamicImage::ImageRgba8(image)
        .write_to(&mut encoded, ImageFormat::Png)
        .map_err(|e| format!("Could not encode screenshot: {e}"))?;
    Ok(
        json!({"pngBase64": STANDARD.encode(encoded.into_inner()), "width": b.width, "height": b.height, "originX": b.x, "originY": b.y}),
    )
}

fn send(inputs: &[INPUT]) -> Result<(), String> {
    let count = unsafe {
        SendInput(
            inputs.len() as u32,
            inputs.as_ptr(),
            size_of::<INPUT>() as i32,
        )
    };
    if count != inputs.len() as u32 {
        return Err("Windows rejected some input events".into());
    }
    Ok(())
}
fn mouse(flags: u32, data: u32) -> INPUT {
    INPUT {
        r#type: INPUT_MOUSE,
        Anonymous: INPUT_0 {
            mi: MOUSEINPUT {
                dwFlags: flags,
                mouseData: data,
                ..Default::default()
            },
        },
    }
}
fn key(vk: u16, scan: u16, flags: u32) -> INPUT {
    INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: vk,
                wScan: scan,
                dwFlags: flags,
                ..Default::default()
            },
        },
    }
}
fn virtual_key(name: &str) -> Option<u16> {
    let value = name.to_ascii_lowercase();
    match value.as_str() {
        "ctrl" | "control" => Some(VK_CONTROL),
        "alt" => Some(VK_MENU),
        "shift" => Some(VK_SHIFT),
        "win" | "meta" => Some(VK_LWIN),
        "enter" | "return" => Some(VK_RETURN),
        "tab" => Some(VK_TAB),
        "escape" | "esc" => Some(VK_ESCAPE),
        "space" => Some(VK_SPACE),
        "backspace" => Some(VK_BACK),
        "delete" => Some(VK_DELETE),
        "insert" => Some(VK_INSERT),
        "home" => Some(VK_HOME),
        "end" => Some(VK_END),
        "pageup" => Some(VK_PRIOR),
        "pagedown" => Some(VK_NEXT),
        "left" | "arrowleft" => Some(VK_LEFT),
        "right" | "arrowright" => Some(VK_RIGHT),
        "up" | "arrowup" => Some(VK_UP),
        "down" | "arrowdown" => Some(VK_DOWN),
        _ if value.len() == 1 && value.as_bytes()[0].is_ascii_alphanumeric() => {
            Some(value.as_bytes()[0].to_ascii_uppercase() as u16)
        }
        _ if value.starts_with('f') => value[1..]
            .parse::<u16>()
            .ok()
            .filter(|n| (1..=12).contains(n))
            .map(|n| VK_F1 + n - 1),
        _ => None,
    }
}

pub(crate) fn act(params: &Value) -> Result<(), String> {
    match params.get("action").and_then(Value::as_str).unwrap_or("") {
        "move" | "click" => {
            let b = bounds()?;
            let x = params
                .get("x")
                .and_then(Value::as_i64)
                .ok_or("x must be an integer")?;
            let y = params
                .get("y")
                .and_then(Value::as_i64)
                .ok_or("y must be an integer")?;
            if x < i64::from(b.x)
                || y < i64::from(b.y)
                || x >= i64::from(b.x) + i64::from(b.width)
                || y >= i64::from(b.y) + i64::from(b.height)
            {
                return Err("Coordinates are outside the desktop".into());
            }
            let click = if params["action"] == "click" {
                let (down, up) = match params
                    .get("button")
                    .and_then(Value::as_str)
                    .unwrap_or("left")
                {
                    "left" => (MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP),
                    "right" => (MOUSEEVENTF_RIGHTDOWN, MOUSEEVENTF_RIGHTUP),
                    "middle" => (MOUSEEVENTF_MIDDLEDOWN, MOUSEEVENTF_MIDDLEUP),
                    _ => return Err("Invalid mouse button".into()),
                };
                let clicks = params.get("clicks").and_then(Value::as_u64).unwrap_or(1);
                if !(1..=3).contains(&clicks) {
                    return Err("Invalid click count".into());
                }
                Some((down, up, clicks))
            } else {
                None
            };
            if unsafe { SetCursorPos(x as i32, y as i32) } == 0 {
                return Err("Windows rejected pointer movement".into());
            }
            if let Some((down, up, clicks)) = click {
                for _ in 0..clicks {
                    if let Err(error) = send(&[mouse(down, 0), mouse(up, 0)]) {
                        let _ = send(&[mouse(up, 0)]);
                        return Err(error);
                    }
                }
            }
            Ok(())
        }
        "key" => {
            let combo = params
                .get("combo")
                .and_then(Value::as_str)
                .ok_or("Key combo is required")?;
            let keys = combo
                .split('+')
                .map(|part| virtual_key(part.trim()).ok_or("Unsupported key in combo"))
                .collect::<Result<Vec<_>, _>>()?;
            if keys.is_empty()
                || keys.len() > 4
                || (keys.contains(&VK_CONTROL)
                    && keys.contains(&VK_MENU)
                    && keys.contains(&VK_ESCAPE))
            {
                return Err("Invalid or reserved key combo".into());
            }
            let mut inputs: Vec<_> = keys.iter().map(|&vk| key(vk, 0, 0)).collect();
            inputs.extend(keys.iter().rev().map(|&vk| key(vk, 0, KEYEVENTF_KEYUP)));
            if let Err(error) = send(&inputs) {
                let release: Vec<_> = keys
                    .iter()
                    .rev()
                    .map(|&vk| key(vk, 0, KEYEVENTF_KEYUP))
                    .collect();
                let _ = send(&release);
                return Err(error);
            }
            Ok(())
        }
        "type" => {
            let text = params
                .get("text")
                .and_then(Value::as_str)
                .ok_or("Text is required")?;
            if text.is_empty() || text.len() > 4_096 {
                return Err("Text must be between 1 and 4096 bytes".into());
            }
            for unit in text.encode_utf16() {
                send(&[
                    key(0, unit, KEYEVENTF_UNICODE),
                    key(0, unit, KEYEVENTF_UNICODE | KEYEVENTF_KEYUP),
                ])?;
            }
            Ok(())
        }
        "scroll" => {
            let amount = params.get("amount").and_then(Value::as_u64).unwrap_or(1);
            if !(1..=20).contains(&amount) {
                return Err("Invalid scroll amount".into());
            }
            let (flag, signed) = match params.get("direction").and_then(Value::as_str) {
                Some("up") => (MOUSEEVENTF_WHEEL, 120i32),
                Some("down") => (MOUSEEVENTF_WHEEL, -120i32),
                Some("right") => (MOUSEEVENTF_HWHEEL, 120i32),
                Some("left") => (MOUSEEVENTF_HWHEEL, -120i32),
                _ => return Err("Invalid scroll direction".into()),
            };
            send(&[mouse(flag, (signed * amount as i32) as u32)])
        }
        _ => Err("Unsupported computer action".into()),
    }
}

/// Clipboard text remains accessible only while the caller holds the host lease.
pub(crate) fn clipboard_read() -> Result<Value, String> {
    unsafe {
        if OpenClipboard(ptr::null_mut()) == 0 {
            return Err("Clipboard is busy".into());
        }
        let result = (|| {
            if IsClipboardFormatAvailable(u32::from(CF_UNICODETEXT)) == 0 {
                return Ok(json!({ "text": null }));
            }
            let handle = GetClipboardData(u32::from(CF_UNICODETEXT));
            if handle.is_null() {
                return Err("Clipboard text is unavailable".into());
            }
            let bytes = GlobalSize(handle);
            if bytes == 0 || bytes > 1_048_576 || bytes % 2 != 0 {
                return Err("Clipboard text is too large or malformed".into());
            }
            let data = GlobalLock(handle) as *const u16;
            if data.is_null() {
                return Err("Clipboard text is unavailable".into());
            }
            let units = std::slice::from_raw_parts(data, bytes / 2);
            let end = units.iter().position(|unit| *unit == 0);
            let text = end
                .ok_or_else(|| "Clipboard text is missing a terminator".to_string())
                .and_then(|end| {
                    String::from_utf16(&units[..end])
                        .map_err(|_| "Clipboard text is invalid UTF-16".to_string())
                });
            GlobalUnlock(handle);
            text.map(|text| json!({ "text": text }))
        })();
        CloseClipboard();
        result
    }
}

pub(crate) fn clipboard_write(text: &str) -> Result<Value, String> {
    if text.len() > 524_286 || text.contains('\0') {
        return Err("Clipboard text is too large or contains a null character".into());
    }
    let units: Vec<u16> = text.encode_utf16().chain(Some(0)).collect();
    unsafe {
        let memory = GlobalAlloc(GMEM_MOVEABLE, units.len() * 2);
        if memory.is_null() {
            return Err("Could not allocate clipboard text".into());
        }
        let data = GlobalLock(memory) as *mut u16;
        if data.is_null() {
            GlobalFree(memory);
            return Err("Could not access clipboard memory".into());
        }
        ptr::copy_nonoverlapping(units.as_ptr(), data, units.len());
        GlobalUnlock(memory);
        let owner = CreateWindowExW(
            0,
            wide("STATIC").as_ptr(),
            wide("").as_ptr(),
            WS_POPUP,
            0,
            0,
            0,
            0,
            ptr::null_mut(),
            ptr::null_mut(),
            GetModuleHandleW(ptr::null()) as _,
            ptr::null(),
        );
        if owner.is_null() {
            GlobalFree(memory);
            return Err("Could not create clipboard owner".into());
        }
        if OpenClipboard(owner) == 0 {
            DestroyWindow(owner);
            GlobalFree(memory);
            return Err("Clipboard is busy".into());
        }
        let ok =
            EmptyClipboard() != 0 && !SetClipboardData(u32::from(CF_UNICODETEXT), memory).is_null();
        CloseClipboard();
        DestroyWindow(owner);
        if !ok {
            GlobalFree(memory);
            return Err("Could not write clipboard text".into());
        }
    }
    Ok(json!({}))
}
