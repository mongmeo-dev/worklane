use std::sync::Mutex;
use std::time::Instant;

use serde::Serialize;
use sysinfo::System;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemResources {
    pub cpu_percent: f32,
    pub ram_used_gb: f32,
    pub ram_total_gb: f32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandPreflight {
    pub executable: String,
    pub available: bool,
}

/// PTY와 같은 로그인·인터랙티브 셸 환경에서 실행 파일을 찾는다.
#[cfg(unix)]
pub fn preflight_command(executable: String) -> CommandPreflight {
    let shell = std::env::var("SHELL")
        .ok()
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "/bin/zsh".to_string());
    let available = std::process::Command::new(shell)
        .args([
            "-l",
            "-i",
            "-c",
            "command -v \"$WORKLANE_EXECUTABLE\" >/dev/null 2>&1",
        ])
        .env("WORKLANE_EXECUTABLE", &executable)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map(|status| status.success())
        .unwrap_or(false);
    CommandPreflight {
        executable,
        available,
    }
}

#[cfg(windows)]
pub fn preflight_command(executable: String) -> CommandPreflight {
    let available = std::process::Command::new("where.exe")
        .arg(&executable)
        .status()
        .map(|status| status.success())
        .unwrap_or(false);
    CommandPreflight {
        executable,
        available,
    }
}

struct MonitorInner {
    system: System,
    last_refresh: Instant,
}

/// CPU 사용률은 두 refresh 사이의 델타로 계산되므로, System 인스턴스를
/// 유지해 실제 폴링 간격(수 초) 전체에 대한 평균을 내야 값이 튀지 않는다.
/// 매 호출마다 새 System을 만들면 200ms짜리 순간 스냅샷이 되어 값이 요동친다.
pub struct ResourceMonitor {
    inner: Mutex<MonitorInner>,
}

impl ResourceMonitor {
    pub fn new() -> Self {
        let mut system = System::new();
        // CPU 델타 계산을 위한 최초 기준선 확보.
        system.refresh_cpu_usage();
        Self {
            inner: Mutex::new(MonitorInner {
                system,
                last_refresh: Instant::now(),
            }),
        }
    }

    /// 현재 CPU 전체 평균 사용률과 RAM 사용량을 읽는다.
    /// CPU 값은 직전 호출 이후 경과 구간에 대한 평균이다.
    pub fn read(&self) -> SystemResources {
        let mut inner = self.inner.lock().unwrap_or_else(|e| e.into_inner());

        // 직전 refresh 이후 최소 간격이 지나지 않았다면(최초/연속 호출) 잠깐
        // 대기해 유효한 CPU 델타를 확보한다. 정상 폴링(수 초 간격)에서는
        // 이미 간격이 지나 있어 대기 없이 즉시 반환된다.
        let elapsed = inner.last_refresh.elapsed();
        if elapsed < sysinfo::MINIMUM_CPU_UPDATE_INTERVAL {
            std::thread::sleep(sysinfo::MINIMUM_CPU_UPDATE_INTERVAL - elapsed);
        }

        inner.system.refresh_cpu_usage();
        inner.system.refresh_memory();
        inner.last_refresh = Instant::now();

        let used_gb = inner.system.used_memory() as f32 / 1_073_741_824.0;
        let total_gb = inner.system.total_memory() as f32 / 1_073_741_824.0;

        SystemResources {
            cpu_percent: inner.system.global_cpu_usage(),
            ram_used_gb: (used_gb * 10.0).round() / 10.0,
            ram_total_gb: total_gb.round(),
        }
    }
}

impl Default for ResourceMonitor {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 리소스는_유효_범위를_반환한다() {
        let monitor = ResourceMonitor::new();
        let resources = monitor.read();

        assert!((0.0..=100.0).contains(&resources.cpu_percent));
        assert!(resources.ram_total_gb > 0.0);
        assert!(resources.ram_used_gb >= 0.0);
        assert!(resources.ram_used_gb <= resources.ram_total_gb + 1.0);
    }

    #[test]
    fn 반복_호출도_유효_범위를_유지한다() {
        let monitor = ResourceMonitor::new();
        for _ in 0..3 {
            let resources = monitor.read();
            assert!((0.0..=100.0).contains(&resources.cpu_percent));
            assert!(resources.ram_used_gb <= resources.ram_total_gb + 1.0);
        }
    }

    #[cfg(unix)]
    #[test]
    fn 명령_프리플라이트는_설치_여부를_구분한다() {
        assert!(preflight_command("sh".into()).available);
        assert!(!preflight_command("worklane-command-that-does-not-exist".into()).available);
    }
}
