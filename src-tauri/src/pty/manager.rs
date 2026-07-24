use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::atomic::AtomicU64;
use std::sync::{Arc, Mutex};

use dashmap::DashMap;
use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use serde::Serialize;
use tauri::ipc::Channel;

use crate::pty::session::{now_ms, Session};

/// 세션 ID → 세션 맵. Tauri State로 관리된다.
pub struct PtyState(pub Arc<DashMap<String, Arc<Session>>>);

impl Default for PtyState {
    fn default() -> Self {
        PtyState(Arc::new(DashMap::new()))
    }
}

/// 프론트로 스트리밍되는 출력 페이로드.
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PtyOutput {
    pub session_id: String,
    pub bytes: Vec<u8>,
}

/// 실행할 셸/명령을 구성한다.
///
/// GUI(.app)로 실행하면 프로세스 PATH가 최소값(`/usr/bin:/bin` 등)이라
/// `claude`·`codex` 같은 사용자 설치 CLI를 찾지 못한다. Unix에서는 사용자의
/// 로그인(-l)+인터랙티브(-i) 셸로 감싸 프로파일(`.zprofile`/`.zshrc` 등)을 로드해
/// PATH와 환경변수를 확보한 뒤 명령을 실행한다.
#[cfg(unix)]
fn build_command(cmd: &str) -> CommandBuilder {
    let shell = std::env::var("SHELL")
        .ok()
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "/bin/zsh".to_string());
    let mut builder = CommandBuilder::new(&shell);
    // 로그인으로 .zprofile 등을, 인터랙티브로 .zshrc 등을 모두 로드한다.
    builder.arg("-l");
    builder.arg("-i");
    if !cmd.trim().is_empty() {
        builder.arg("-c");
        builder.arg(cmd);
    }
    builder
}

/// Windows는 레지스트리 기반 사용자 PATH를 상속하므로 명령을 직접 실행한다.
#[cfg(windows)]
fn build_command(cmd: &str) -> CommandBuilder {
    CommandBuilder::new(cmd)
}

/// PTY 세션을 생성하고 출력 펌프 스레드를 시작한다.
#[allow(clippy::too_many_arguments)]
pub fn create(
    state: &PtyState,
    session_id: String,
    cmd: String,
    cwd: String,
    rows: u16,
    cols: u16,
    hook_dir: PathBuf,
    on_output: Channel<PtyOutput>,
) -> Result<(), String> {
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
        .map_err(|e| e.to_string())?;

    let mut builder = build_command(&cmd);
    builder.cwd(cwd);
    builder.env("TERM", "xterm-256color");

    let child = pair.slave.spawn_command(builder).map_err(|e| e.to_string())?;
    let reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = pair.master.take_writer().map_err(|e| e.to_string())?;

    let session = Arc::new(Session {
        writer: Mutex::new(writer),
        master: Mutex::new(pair.master),
        child: Mutex::new(child),
        last_output_ms: AtomicU64::new(now_ms()),
        last_input_ms: AtomicU64::new(0),
        hook_dir,
    });
    state.0.insert(session_id.clone(), session.clone());

    // 출력 펌프: 블로킹 read를 전용 스레드에서 돌린다.
    let sid = session_id.clone();
    let pump_session = session.clone();
    std::thread::spawn(move || {
        let mut reader = reader;
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break, // EOF/에러 = 프로세스 종료
                Ok(n) => {
                    pump_session.mark_output(now_ms()); // ② 활동 시각 갱신(입력 에코 제외)
                    let payload = PtyOutput {
                        session_id: sid.clone(),
                        bytes: buf[..n].to_vec(), // 바이트 그대로
                    };
                    if on_output.send(payload).is_err() {
                        break;
                    }
                }
            }
        }
    });

    Ok(())
}

/// 세션에 입력 바이트를 쓴다.
pub fn write(state: &PtyState, session_id: &str, data: Vec<u8>) -> Result<(), String> {
    if let Some(s) = state.0.get(session_id) {
        // ② 입력 시각을 먼저 기록해, 뒤따르는 에코 출력을 활동에서 제외한다.
        s.mark_input(now_ms());
        s.writer
            .lock()
            .map_err(|_| "writer lock 실패".to_string())?
            .write_all(&data)
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// 세션 PTY를 리사이즈한다.
pub fn resize(state: &PtyState, session_id: &str, rows: u16, cols: u16) -> Result<(), String> {
    if let Some(s) = state.0.get(session_id) {
        s.master
            .lock()
            .map_err(|_| "master lock 실패".to_string())?
            .resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// 세션을 종료하고 맵에서 제거한다.
pub fn close(state: &PtyState, session_id: &str) -> Result<(), String> {
    if let Some((_, s)) = state.0.remove(session_id) {
        if let Ok(mut child) = s.child.lock() {
            let _ = child.kill();
            for _ in 0..40 {
                match child.try_wait() {
                    Ok(Some(_)) => break,
                    Ok(None) => std::thread::sleep(std::time::Duration::from_millis(25)),
                    Err(_) => break,
                }
            }
        }
    }
    Ok(())
}
