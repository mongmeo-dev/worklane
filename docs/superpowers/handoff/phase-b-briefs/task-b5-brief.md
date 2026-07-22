## Task B5: 공유 worktree (재사용 + 참조 카운트 삭제)

**Files:**
- Modify: `src-tauri/src/git/mod.rs` (worktree 존재 확인)
- Modify: `src-tauri/src/store/repo.rs` (같은 worktree_path 카운트)
- Modify: `src-tauri/src/commands.rs` (create_agent 재사용, delete_agent 참조 카운트)

**Interfaces:**
- create_agent: `worktreePath`가 이미 존재하는 디렉토리이고 다른 에이전트가 쓰면 생성 스킵, `worktreeManaged=false`.
- delete_agent: 같은 `worktree_path`를 쓰는 다른 에이전트가 있으면 디렉토리 제거 스킵.

- [ ] **Step 1: worktree 존재 확인 함수 + 참조 카운트 쿼리 테스트**

`git/mod.rs`:

```rust
/// 경로가 이미 유효한 git worktree인지(.git 파일/디렉토리 존재) 확인.
pub fn is_existing_worktree(path: &str) -> bool {
    std::path::Path::new(path).join(".git").exists()
}
```

`store/repo.rs`에 참조 카운트 쿼리 + 테스트:

```rust
/// 주어진 worktree_path를 사용하는 에이전트 수.
pub fn count_agents_by_worktree(conn: &Connection, worktree_path: &str) -> rusqlite::Result<i64> {
    conn.query_row(
        "SELECT COUNT(*) FROM agents WHERE worktree_path = ?1",
        params![worktree_path], |r| r.get(0),
    )
}
```

테스트(repo.rs tests 모듈):

```rust
#[test]
fn 같은_worktree_참조_카운트() {
    let conn = mem();
    let p = insert_project(&conn, "proj", "/tmp/proj", 10).unwrap();
    let mut a1 = sample_agent(&p.id); a1.worktree_path = "/tmp/shared".into();
    let mut a2 = sample_agent(&p.id); a2.worktree_path = "/tmp/shared".into();
    insert_agent(&conn, &a1).unwrap();
    insert_agent(&conn, &a2).unwrap();
    assert_eq!(count_agents_by_worktree(&conn, "/tmp/shared").unwrap(), 2);
}
```

Run: `cd src-tauri && cargo test store::repo` → PASS(구현 후).

- [ ] **Step 2: create_agent 재사용 분기**

`commands.rs`의 `create_agent`에서 worktree 경로 결정 후, **명시적 경로가 이미 존재하는 worktree면 생성 스킵**:

```rust
let (wt_path, managed) = match worktree_path {
    Some(p) if !p.trim().is_empty() => (p, false),
    _ => {
        let base = app.path().app_data_dir().map_err(|e| e.to_string())?
            .join("worktrees").join(&project_id).join(&branch);
        (base.to_string_lossy().into_owned(), true)
    }
};

// 재사용: 경로가 이미 유효한 worktree면 git 생성 스킵.
let created = if git::is_existing_worktree(&wt_path) {
    std::fs::canonicalize(&wt_path).map(|p| p.to_string_lossy().into_owned())
        .map_err(|e| e.to_string())?
} else {
    git::create_worktree(&project_path, &branch, &start_point, &wt_path)?
};
```

(이후 insert 로직은 기존과 동일. managed 값은 위에서 결정된 대로 유지 — 명시 경로 재사용은 managed=false.)

- [ ] **Step 3: delete_agent 참조 카운트**

`commands.rs`의 `delete_agent`에서 worktree 제거 조건에 참조 카운트 추가:

```rust
if let Some(a) = &agent {
    if remove_worktree && a.worktree_managed {
        // 같은 worktree를 쓰는 다른 에이전트가 있으면 디렉토리 제거 스킵.
        let refs = {
            let conn = store.0.lock().map_err(|e| e.to_string())?;
            store::repo::count_agents_by_worktree(&conn, &a.worktree_path).map_err(|e| e.to_string())?
        };
        if refs <= 1 {
            git::remove_worktree(&a.worktree_path, &a.worktree_path, force)?;
        }
    }
}
```

(delete_project도 동일 취지로 반영: 프로젝트 내 같은 worktree 공유 시 마지막 것만 제거 — 단, delete_project는 프로젝트 전체 삭제라 프로젝트 내 모든 에이전트가 사라지므로, worktree별로 1회만 remove하도록 dedup. `HashSet<worktree_path>`로 이미 제거한 경로는 스킵.)

- [ ] **Step 4: delete_project worktree dedup**

`commands.rs`의 `delete_project` worktree 정리 루프를 dedup:

```rust
let mut removed: std::collections::HashSet<String> = std::collections::HashSet::new();
for a in &p.agents {
    if a.worktree_managed && removed.insert(a.worktree_path.clone()) {
        if let Err(e) = git::remove_worktree(&p.path, &a.worktree_path, true) {
            failed_worktrees.push((a.worktree_path.clone(), e));
        }
    }
}
```

- [ ] **Step 5: 테스트/커밋**

Run: `cd src-tauri && cargo test`
Expected: 전체 PASS(기존 worktree 테스트 포함 회귀 없음).

```bash
git add src-tauri/src/git src-tauri/src/store/repo.rs src-tauri/src/commands.rs
git commit -m "feat: 공유 worktree 재사용 및 참조 카운트 기반 삭제"
```

---

