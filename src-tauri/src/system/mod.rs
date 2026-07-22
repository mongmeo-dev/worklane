use serde::Serialize;
use sysinfo::System;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemResources {
    pub cpu_percent: f32,
    pub ram_used_gb: f32,
    pub ram_total_gb: f32,
}

/// 현재 CPU 전체 평균 사용률과 RAM 사용량을 읽는다.
pub fn read_resources() -> SystemResources {
    let mut system = System::new();
    system.refresh_cpu_usage();
    std::thread::sleep(sysinfo::MINIMUM_CPU_UPDATE_INTERVAL);
    system.refresh_cpu_usage();
    system.refresh_memory();

    let used_gb = system.used_memory() as f32 / 1_073_741_824.0;
    let total_gb = system.total_memory() as f32 / 1_073_741_824.0;

    SystemResources {
        cpu_percent: system.global_cpu_usage(),
        ram_used_gb: (used_gb * 10.0).round() / 10.0,
        ram_total_gb: total_gb.round(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 리소스는_유효_범위를_반환한다() {
        let resources = read_resources();

        assert!((0.0..=100.0).contains(&resources.cpu_percent));
        assert!(resources.ram_total_gb > 0.0);
        assert!(resources.ram_used_gb >= 0.0);
        assert!(resources.ram_used_gb <= resources.ram_total_gb + 1.0);
    }
}
