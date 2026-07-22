use std::path::{Component, Path};

use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileContent {
    pub content: String,
    pub is_binary: bool,
}

/// worktree 내부에서만 사용할 수 있는 상대 경로인지 확인한다.
pub fn validate_relative_path(relative: &str) -> Result<(), String> {
    let path = Path::new(relative);
    let unsafe_component = path.components().any(|component| {
        matches!(
            component,
            Component::ParentDir | Component::RootDir | Component::Prefix(_)
        )
    });
    if relative.trim().is_empty() || path.is_absolute() || unsafe_component {
        return Err("worktree 밖 경로 접근 거부".into());
    }
    Ok(())
}

/// worktree 밖 접근을 막고 파일 내용을 읽는다. 바이너리는 빈 content를 반환한다.
pub fn read_file(worktree: &str, relative: &str) -> Result<FileContent, String> {
    validate_relative_path(relative)?;
    let base = std::fs::canonicalize(worktree).map_err(|error| error.to_string())?;
    let target = std::fs::canonicalize(base.join(relative)).map_err(|error| error.to_string())?;
    if !target.starts_with(&base) {
        return Err("worktree 밖 경로 접근 거부".into());
    }

    let bytes = std::fs::read(target).map_err(|error| error.to_string())?;
    if bytes.iter().take(8000).any(|byte| *byte == 0) {
        return Ok(FileContent {
            content: String::new(),
            is_binary: true,
        });
    }

    Ok(FileContent {
        content: String::from_utf8_lossy(&bytes).into_owned(),
        is_binary: false,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_dir() -> std::path::PathBuf {
        let path = std::env::temp_dir().join(format!("files-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&path).unwrap();
        path
    }

    #[test]
    fn 상대_경로의_텍스트_파일을_읽는다() {
        let base = temp_dir();
        std::fs::create_dir_all(base.join("src")).unwrap();
        std::fs::write(base.join("src/main.rs"), "fn main() {}\n").unwrap();

        let file = read_file(base.to_str().unwrap(), "src/main.rs").unwrap();

        assert_eq!(file.content, "fn main() {}\n");
        assert!(!file.is_binary);
        std::fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn nul_바이트가_있는_파일은_바이너리로_표시한다() {
        let base = temp_dir();
        std::fs::write(base.join("image.bin"), [1, 0, 2]).unwrap();

        let file = read_file(base.to_str().unwrap(), "image.bin").unwrap();

        assert!(file.content.is_empty());
        assert!(file.is_binary);
        std::fs::remove_dir_all(base).unwrap();
    }

    #[test]
    fn worktree_밖_경로는_거부한다() {
        let base = temp_dir();
        let outside = temp_dir();
        std::fs::write(outside.join("secret.txt"), "비밀").unwrap();
        let relative = format!(
            "../{}/secret.txt",
            outside.file_name().unwrap().to_string_lossy()
        );

        let error = read_file(base.to_str().unwrap(), &relative).unwrap_err();

        assert_eq!(error, "worktree 밖 경로 접근 거부");
        std::fs::remove_dir_all(base).unwrap();
        std::fs::remove_dir_all(outside).unwrap();
    }

    #[test]
    fn 상위와_절대_경로를_안전하지_않은_경로로_판정한다() {
        assert!(validate_relative_path("src/main.rs").is_ok());
        assert!(validate_relative_path("../secret.txt").is_err());
        assert!(validate_relative_path("/tmp/secret.txt").is_err());
    }
}
