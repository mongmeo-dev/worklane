## Task B1: 시스템 리소스 (CPU/RAM)

**Files:**
- Modify: `src-tauri/Cargo.toml` (sysinfo 추가)
- Create: `src-tauri/src/system/mod.rs`
- Modify: `src-tauri/src/lib.rs` (mod system; 명령 등록)
- Modify: `src-tauri/src/commands.rs` (read_system_resources)
- Create: `src/lib/ipc/system.ts`

**Interfaces:**
- Produces (IPC): `read_system_resources() -> { cpuPercent, ramUsedGb, ramTotalGb }`.

- [ ] **Step 1: sysinfo 의존성 추가**

`src-tauri/Cargo.toml`의 `[dependencies]`에 추가:

```toml
sysinfo = "0.32"
```

Run: `cd src-tauri && cargo build`
Expected: sysinfo 컴파일 성공.

- [ ] **Step 2: 시스템 모듈 + 테스트 작성**

`src-tauri/src/system/mod.rs` 생성:

```rust
use serde::Serialize;
use sysinfo::System;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemResources {
    pub cpu_percent: f32,
    pub ram_used_gb: f32,
    pub ram_total_gb: f32,
}

/// 현재 CPU 사용률(전체 평균 %)과 RAM 사용/총량(GB)을 읽는다.
/// CPU는 두 번 refresh 사이 간격이 필요하므로 짧게 대기 후 측정한다.
pub fn read_resources() -> SystemResources {
    let mut sys = System::new();
    sys.refresh_cpu_usage();
    std::thread::sleep(sysinfo::MINIMUM_CPU_UPDATE_INTERVAL);
    sys.refresh_cpu_usage();
    sys.refresh_memory();

    let cpu_percent = sys.global_cpu_usage();
    let used = sys.used_memory() as f32 / 1_073_741_824.0; // bytes → GiB
    let total = sys.total_memory() as f32 / 1_073_741_824.0;
    SystemResources {
        cpu_percent,
        ram_used_gb: (used * 10.0).round() / 10.0,
        ram_total_gb: (total).round(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 리소스는_유효_범위를_반환한다() {
        let r = read_resources();
        assert!(r.cpu_percent >= 0.0 && r.cpu_percent <= 100.0 * num_cpus_upper());
        assert!(r.ram_total_gb > 0.0);
        assert!(r.ram_used_gb >= 0.0 && r.ram_used_gb <= r.ram_total_gb + 1.0);
    }
    // global_cpu_usage는 0~100 정규화값이므로 상한 100으로 본다.
    fn num_cpus_upper() -> f32 { 1.0 }
}
```

- [ ] **Step 3: 테스트 실행(실패→성공)**

Run: `cd src-tauri && cargo test system::`
Expected: PASS. (mod 등록 전이면 컴파일 실패 → Step 4 후 재실행.)

- [ ] **Step 4: lib.rs에 mod + 명령 등록, commands.rs에 명령 추가**

`src-tauri/src/lib.rs` 상단 mod 목록에 `mod system;` 추가. `invoke_handler` 배열에 `commands::read_system_resources,` 추가.

`src-tauri/src/commands.rs`에 추가:

```rust
#[tauri::command]
pub async fn read_system_resources() -> Result<crate::system::SystemResources, String> {
    tauri::async_runtime::spawn_blocking(crate::system::read_resources)
        .await
        .map_err(|e| e.to_string())
}
```

- [ ] **Step 5: 테스트/빌드 확인**

Run: `cd src-tauri && cargo test`
Expected: 전체 PASS.

- [ ] **Step 6: 프론트 IPC 래퍼**

`src/lib/ipc/system.ts` 생성:

```ts
import { invoke } from "@tauri-apps/api/core";

export interface SystemResources {
  cpuPercent: number;
  ramUsedGb: number;
  ramTotalGb: number;
}

export function readSystemResources(): Promise<SystemResources> {
  return invoke<SystemResources>("read_system_resources");
}
```

- [ ] **Step 7: 커밋**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/system/mod.rs src-tauri/src/lib.rs src-tauri/src/commands.rs src/lib/ipc/system.ts
git commit -m "feat: 시스템 리소스(CPU/RAM) 조회 명령 추가"
```

---

