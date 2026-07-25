use std::path::{Component, Path, PathBuf};

/// A filesystem identity used to reject paths that are replaced after validation.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PathIdentity {
    #[cfg(unix)]
    Unix { device: u64, inode: u64 },
    #[cfg(windows)]
    Windows {
        creation_time: u64,
        file_size: u64,
        file_attributes: u32,
    },
    #[cfg(not(any(unix, windows)))]
    CanonicalPath(PathBuf),
}

fn path_identity(path: &Path) -> Result<PathIdentity, String> {
    let metadata =
        std::fs::metadata(path).map_err(|error| format!("경로 메타데이터를 확인할 수 없습니다: {error}"))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::MetadataExt;

        Ok(PathIdentity::Unix {
            device: metadata.dev(),
            inode: metadata.ino(),
        })
    }

    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;

        Ok(PathIdentity::Windows {
            creation_time: metadata.creation_time(),
            file_size: metadata.file_size(),
            file_attributes: metadata.file_attributes(),
        })
    }

    #[cfg(not(any(unix, windows)))]
    {
        let _ = metadata;
        std::fs::canonicalize(path)
            .map(PathIdentity::CanonicalPath)
            .map_err(|error| format!("경로 메타데이터를 확인할 수 없습니다: {error}"))
    }
}

/// Captures the identity of an already-authorized filesystem path.
pub fn capture_path_identity(path: &Path) -> Result<PathIdentity, String> {
    path_identity(path)
}

/// Rejects a path whose object identity changed after it was authorized.
pub fn verify_path_identity(path: &Path, expected: &PathIdentity) -> Result<(), String> {
    if &path_identity(path)? != expected {
        return Err("검증된 경로가 변경되어 외부 열기를 거부했습니다.".into());
    }
    Ok(())
}

/// A filesystem target that has been canonicalized and verified to remain under its root.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResolvedPath {
    pub path: PathBuf,
    pub fallback_directory: PathBuf,
    pub exists: bool,
    root: PathBuf,
    root_identity: PathIdentity,
    path_identity: PathIdentity,
    fallback_directory_identity: PathIdentity,
}

impl ResolvedPath {
    /// Rechecks every filesystem object that will be handed to an external process.
    pub fn verify_unchanged(&self) -> Result<(), String> {
        verify_path_identity(&self.root, &self.root_identity)?;
        verify_path_identity(&self.path, &self.path_identity)?;
        verify_path_identity(
            &self.fallback_directory,
            &self.fallback_directory_identity,
        )
    }
}

/// Resolves an optional relative path beneath `root` without permitting traversal or symlink escape.
///
/// When the requested entry does not exist, the nearest existing, in-root parent is returned.
pub fn resolve_in_root(root: &Path, relative_path: Option<&str>) -> Result<ResolvedPath, String> {
    let root = std::fs::canonicalize(root)
        .map_err(|error| format!("등록 루트를 확인할 수 없습니다: {error}"))?;
    if !root.is_dir() {
        return Err("등록 루트가 디렉터리가 아닙니다.".into());
    }
    let root_identity = path_identity(&root)?;
    let relative_path = relative_path.unwrap_or("");
    let relative = Path::new(relative_path);

    if relative.is_absolute()
        || relative
            .components()
            .any(|component| !matches!(component, Component::Normal(_)))
    {
        return Err("상대 경로만 열 수 있습니다.".into());
    }

    let requested = root.join(relative);
    let mut candidate = requested.as_path();
    let mut exists = true;
    let resolved = loop {
        match std::fs::canonicalize(candidate) {
            Ok(path) => break path,
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => {
                exists = false;
                candidate = candidate
                    .parent()
                    .ok_or_else(|| "대상 경로를 확인할 수 없습니다.".to_string())?;
            }
            Err(error) => return Err(format!("대상 경로를 확인할 수 없습니다: {error}")),
        }
    };

    if !resolved.starts_with(&root) {
        return Err("등록 루트 밖의 경로 접근이 거부되었습니다.".into());
    }

    let fallback_directory = if resolved.is_dir() {
        resolved.clone()
    } else {
        resolved
            .parent()
            .filter(|parent| parent.starts_with(&root))
            .ok_or_else(|| "대상 경로의 디렉터리를 확인할 수 없습니다.".to_string())?
            .to_path_buf()
    };
    if !fallback_directory.is_dir() {
        return Err("대상 경로의 디렉터리를 확인할 수 없습니다.".into());
    }

    Ok(ResolvedPath {
        path_identity: path_identity(&resolved)?,
        fallback_directory_identity: path_identity(&fallback_directory)?,
        path: resolved,
        fallback_directory,
        exists,
        root,
        root_identity,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 없는_대상은_기존_부모로_해결한다() {
        let root = std::env::temp_dir().join(format!("path-policy-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(root.join("existing")).unwrap();

        let resolved = resolve_in_root(&root, Some("existing/missing/file")).unwrap();
        assert_eq!(
            resolved.path,
            std::fs::canonicalize(root.join("existing")).unwrap()
        );
        assert!(resolved.fallback_directory.is_dir());
        assert!(!resolved.exists);

        std::fs::remove_dir_all(root).unwrap();
    }
    #[test]
    fn 파일_대상의_fallback은_정규화된_디렉터리다() {
        let root = std::env::temp_dir().join(format!("path-policy-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(root.join("existing")).unwrap();
        std::fs::write(root.join("existing/file"), "").unwrap();

        let resolved = resolve_in_root(&root, Some("existing/file")).unwrap();
        assert!(resolved.exists);
        assert_eq!(
            resolved.fallback_directory,
            std::fs::canonicalize(root.join("existing")).unwrap()
        );
        assert!(resolved.fallback_directory.is_dir());

        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn 절대_및_상위_경로를_거부한다() {
        let root = std::env::temp_dir().join(format!("path-policy-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root).unwrap();

        assert!(resolve_in_root(&root, Some("../outside")).is_err());
        assert!(resolve_in_root(&root, Some("/outside")).is_err());

        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn 파일_아래_없는_경로의_오류를_전파한다() {
        let root = std::env::temp_dir().join(format!("path-policy-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root).unwrap();
        std::fs::write(root.join("file"), "").unwrap();

        let error = resolve_in_root(&root, Some("file/missing")).unwrap_err();
        assert!(error.contains("대상 경로를 확인할 수 없습니다"));

        std::fs::remove_dir_all(root).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn 심볼릭_링크_탈출을_거부한다() {
        use std::os::unix::fs::symlink;

        let base = std::env::temp_dir().join(format!("path-policy-{}", uuid::Uuid::new_v4()));
        let root = base.join("root");
        let outside = base.join("outside");
        std::fs::create_dir_all(&root).unwrap();
        std::fs::create_dir_all(&outside).unwrap();
        symlink(&outside, root.join("escape")).unwrap();

        assert!(resolve_in_root(&root, Some("escape")).is_err());

        std::fs::remove_dir_all(base).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn 검증후_경로_교체를_거부한다() {
        let root = std::env::temp_dir().join(format!("path-policy-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&root).unwrap();
        let resolved = resolve_in_root(&root, None).unwrap();
        std::fs::remove_dir(&root).unwrap();
        std::fs::create_dir(&root).unwrap();

        assert!(resolved.verify_unchanged().is_err());

        std::fs::remove_dir_all(root).unwrap();
    }
}
