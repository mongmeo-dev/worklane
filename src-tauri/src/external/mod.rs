use std::path::Path;
use std::process::Command;

use crate::path_policy::ResolvedPath;
#[cfg(target_os = "linux")]
use std::time::Duration;

/// 앱 식별자를 에디터 실행 바이너리로 매핑한다. 에디터가 아니면 None.
pub fn editor_binary(app: &str) -> Option<&'static str> {
    match app {
        "vscode" => Some("code"),
        "cursor" => Some("cursor"),
        "zed" => Some("zed"),
        "windsurf" => Some("windsurf"),
        "sublime" => Some("subl"),
        "intellij" => Some("idea"),
        _ => None,
    }
}

/// The file-manager operation to perform for a verified path.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ExternalIntent {
    OpenDirectory,
    RevealEntry,
}

impl ExternalIntent {
    pub fn parse(intent: &str) -> Result<Self, String> {
        match intent {
            "openDirectory" => Ok(Self::OpenDirectory),
            "revealEntry" => Ok(Self::RevealEntry),
            _ => Err(format!("알 수 없는 외부 열기 동작: {intent}")),
        }
    }
}

/// Opens a canonical, registered agent root in an editor, or a verified entry in the file manager.
pub fn open_in_app(
    resolved: &ResolvedPath,
    app: &str,
    intent: ExternalIntent,
) -> Result<(), String> {
    resolved.verify_unchanged()?;
    let path = &resolved.path;
    let fallback_directory = &resolved.fallback_directory;

    if let Some(bin) = editor_binary(app) {
        if intent != ExternalIntent::OpenDirectory {
            return Err("에디터에서는 디렉터리만 열 수 있습니다.".into());
        }
        return Command::new(bin)
            .arg(path)
            .spawn()
            .map(|_| ())
            .map_err(|e| format!("{bin} 실행 실패(설치·PATH를 확인하세요): {e}"));
    }
    match app {
        "finder" => open_in_file_manager(path, fallback_directory, intent, resolved.exists),
        other => Err(format!("알 수 없는 열기 대상: {other}")),
    }
}

/// Opens a directory or reveals an existing entry using only a canonical verified path.
fn open_in_file_manager(
    path: &Path,
    fallback_directory: &Path,
    intent: ExternalIntent,
    exists: bool,
) -> Result<(), String> {
    #[cfg(not(target_os = "linux"))]
    let _ = fallback_directory;
    #[cfg(target_os = "linux")]
    {
        return if intent == ExternalIntent::RevealEntry {
            if exists {
                reveal_entry_linux(path, fallback_directory)
            } else {
                open_directory_linux(fallback_directory)
            }
        } else {
            let directory = if exists && !path.is_dir() {
                path.parent().unwrap_or(path)
            } else {
                path
            };
            open_directory_linux(directory)
        };
    }

    #[cfg(not(target_os = "linux"))]
    {
        let directory = if exists && !path.is_dir() {
            path.parent().unwrap_or(path)
        } else {
            path
        };

        #[cfg(target_os = "macos")]
        let mut cmd = {
            let mut c = Command::new("open");
            if intent == ExternalIntent::RevealEntry && exists {
                c.arg("-R").arg(path);
            } else {
                c.arg(directory);
            }
            c
        };
        #[cfg(target_os = "windows")]
        let mut cmd = {
            let mut c = Command::new("explorer");
            if intent == ExternalIntent::RevealEntry && exists {
                c.arg("/select,").arg(path);
            } else {
                c.arg(directory);
            }
            c
        };
        #[cfg(not(any(target_os = "macos", target_os = "windows")))]
        let mut cmd = {
            let mut c = Command::new("xdg-open");
            c.arg(directory);
            c
        };
        cmd.spawn()
            .map(|_| ())
            .map_err(|e| format!("파일 매니저 실행 실패: {e}"))
    }
}

#[cfg(target_os = "linux")]
fn reveal_entry_linux(path: &Path, fallback_directory: &Path) -> Result<(), String> {
    let uri = file_uri(path)?;
    reveal_with_file_manager(
        || show_items_linux(&uri),
        || open_directory_linux(fallback_directory),
    )
}

#[cfg(target_os = "linux")]
fn file_uri(path: &Path) -> Result<String, String> {
    url::Url::from_file_path(path)
        .map(|uri| uri.to_string())
        .map_err(|_| format!("파일 URI로 변환할 수 없습니다: {}", path.display()))
}

#[cfg(target_os = "linux")]
fn show_items_linux(uri: &str) -> Result<(), String> {
    let connection = zbus::blocking::connection::Builder::session()
        .map_err(|error| format!("session bus 연결 실패: {error}"))?
        .method_timeout(Duration::from_secs(3))
        .build()
        .map_err(|error| format!("session bus 연결 실패: {error}"))?;
    let proxy = zbus::blocking::Proxy::new(
        &connection,
        "org.freedesktop.FileManager1",
        "/org/freedesktop/FileManager1",
        "org.freedesktop.FileManager1",
    )
    .map_err(|error| format!("FileManager1 proxy 생성 실패: {error}"))?;

    proxy
        .call::<_, _, ()>("ShowItems", &(vec![uri.to_owned()], String::new()))
        .map_err(|error| format!("FileManager1 ShowItems 실패: {error}"))
}

#[cfg(target_os = "linux")]
fn reveal_with_file_manager<ShowItems, Fallback>(
    show_items: ShowItems,
    fallback: Fallback,
) -> Result<(), String>
where
    ShowItems: FnOnce() -> Result<(), String>,
    Fallback: FnOnce() -> Result<(), String>,
{
    match show_items() {
        Ok(()) => Ok(()),
        Err(show_items_error) => fallback().map_err(|fallback_error| {
            format!(
                "FileManager1 ShowItems 실패: {show_items_error}; xdg-open fallback 실패: {fallback_error}"
            )
        }),
    }
}

#[cfg(target_os = "linux")]
fn open_directory_linux(directory: &Path) -> Result<(), String> {
    let status = Command::new("xdg-open")
        .arg(directory)
        .status()
        .map_err(|error| format!("파일 매니저 실행 실패: {error}"))?;
    if status.success() {
        Ok(())
    } else {
        Err(format!("파일 매니저 실행 실패: xdg-open 종료 상태 {status}"))
    }
}

#[cfg(all(test, target_os = "linux"))]
mod linux_tests {
    use super::*;
    use std::cell::Cell;

    #[test]
    fn 파일_uri는_공백을_percent_encode한다() {
        assert_eq!(
            file_uri(Path::new("/tmp/entry with space")),
            Ok("file:///tmp/entry%20with%20space".into())
        );
    }

    #[test]
    fn showitems_reply_success는_fallback을_호출하지_않는다() {
        let fallback_calls = Cell::new(0);

        reveal_with_file_manager(
            || Ok(()),
            || {
                fallback_calls.set(fallback_calls.get() + 1);
                Ok(())
            },
        )
        .unwrap();

        assert_eq!(fallback_calls.get(), 0);
    }

    #[test]
    fn showitems_timeout은_fallback을_한번_호출한다() {
        let fallback_calls = Cell::new(0);

        reveal_with_file_manager(
            || Err("timed out".into()),
            || {
                fallback_calls.set(fallback_calls.get() + 1);
                Ok(())
            },
        )
        .unwrap();

        assert_eq!(fallback_calls.get(), 1);
    }

    #[test]
    fn fallback_실패은_두_원인을_보존한다() {
        let error = reveal_with_file_manager(
            || Err("service unavailable".into()),
            || Err("xdg-open unavailable".into()),
        )
        .unwrap_err();

        assert!(error.contains("service unavailable"));
        assert!(error.contains("xdg-open unavailable"));
    }
}
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 에디터_바이너리를_매핑한다() {
        assert_eq!(editor_binary("vscode"), Some("code"));
        assert_eq!(editor_binary("cursor"), Some("cursor"));
        assert_eq!(editor_binary("zed"), Some("zed"));
    }

    #[test]
    fn 파인더와_알수없는_대상은_에디터가_아니다() {
        assert_eq!(editor_binary("finder"), None);
        assert_eq!(editor_binary("nope"), None);
    }
}
