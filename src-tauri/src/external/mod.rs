use std::process::Command;

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

/// 경로를 외부 앱으로 연다. app이 에디터면 해당 CLI를, "finder"면 파일 매니저를 연다.
pub fn open_in_app(path: &str, app: &str) -> Result<(), String> {
    if let Some(bin) = editor_binary(app) {
        return Command::new(bin)
            .arg(path)
            .spawn()
            .map(|_| ())
            .map_err(|e| format!("{bin} 실행 실패(설치·PATH를 확인하세요): {e}"));
    }
    match app {
        "finder" => reveal_in_file_manager(path),
        other => Err(format!("알 수 없는 열기 대상: {other}")),
    }
}

/// 경로를 OS 파일 매니저에서 드러낸다(macOS Finder / Windows 탐색기 / Linux xdg-open).
fn reveal_in_file_manager(path: &str) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    let mut cmd = {
        let mut c = Command::new("open");
        c.args(["-R", path]);
        c
    };
    #[cfg(target_os = "windows")]
    let mut cmd = {
        let mut c = Command::new("explorer");
        c.arg(path);
        c
    };
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    let mut cmd = {
        let mut c = Command::new("xdg-open");
        c.arg(path);
        c
    };
    cmd.spawn()
        .map(|_| ())
        .map_err(|e| format!("파일 매니저 실행 실패: {e}"))
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
