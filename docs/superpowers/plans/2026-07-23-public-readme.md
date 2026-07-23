# 공개 README Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Worklane의 가치, 현재 기능, 개발 방법을 외부 방문자에게 정확히 전달하는 영문 및 한글 README를 작성합니다.

**Architecture:** `README.md`를 기본 영문 진입점으로 두고 `README.ko.md`가 같은 정보 구조를 자연스러운 한글로 제공합니다. 두 문서는 상호 언어 링크를 제공하며, 현재 구현과 향후 계획을 명확히 분리합니다.

**Tech Stack:** Markdown, Node.js, pnpm, Rust, Tauri v2, Svelte 5, TypeScript

## Global Constraints

- 제품 상태를 초기 개발 단계로 표시합니다.
- 저장소에서 확인된 기능만 현재 기능으로 설명합니다.
- 공식 릴리스가 없으므로 소스 빌드 절차만 제공합니다.
- 영문과 한글 문서의 섹션과 핵심 사실을 일치시킵니다.
- 존재하지 않는 링크, 명령, 배지 또는 성능 수치를 추가하지 않습니다.
- 문서 변경 커밋에는 `[ci skip]`을 포함합니다.

---

### Task 1: 영문 및 한글 공개 README 작성

**Files:**
- Create: `README.md`
- Create: `README.ko.md`
- Reference: `package.json`
- Reference: `src-tauri/Cargo.toml`
- Reference: `src-tauri/src/lib.rs`
- Reference: `docs/superpowers/specs/2026-07-23-public-readme-design.md`

**Interfaces:**
- Consumes: `package.json`의 스크립트와 저장소에 구현된 Worklane 기능
- Produces: GitHub 저장소의 기본 영문 소개 문서와 대응하는 한글 소개 문서

- [ ] **Step 1: 저장소 근거를 다시 확인합니다**

Run:

```bash
node -e "const p=require('./package.json'); console.log(p.name, p.version, p.scripts)"
grep -n 'portable-pty\|rusqlite' src-tauri/Cargo.toml
grep -n 'generate_handler' -A30 src-tauri/src/lib.rs
```

Expected: 패키지 이름 `worklane`, 버전 `0.1.0`, `dev`, `build`, `check`, `test`, `tauri` 스크립트와 PTY·SQLite 의존성 및 현재 Tauri 명령 목록이 출력됩니다.

- [ ] **Step 2: 영문 README를 작성합니다**

`README.md`에 다음 순서와 내용을 작성합니다.

1. `Worklane` 제목과 “Manage multiple projects and multiple CLI coding agents from one desktop workspace.”라는 한 줄 설명
2. `한국어` 언어 링크
3. Early Development 경고
4. 다중 프로젝트 × 다중 에이전트 문제 정의
5. 현재 구현된 프로젝트·작업환경·터미널·상태 추적·변경 검토·사용량 표시 기능
6. 프로세스 생존, 출력 활동, 에이전트 훅의 3계층 상태 추적 설명
7. Tauri v2, Rust, Svelte 5, TypeScript, xterm.js, portable-pty, SQLite 기술 스택
8. Node.js, pnpm, Rust, Git, Tauri v2 사전 요구사항과 공식 링크
9. `pnpm install`, `pnpm tauri dev`, 검증 및 빌드 명령
10. 확정 일정을 제시하지 않는 향후 계획
11. 초기 단계 기여 안내와 MIT 라이선스

- [ ] **Step 3: 한글 README를 같은 구조로 작성합니다**

`README.ko.md`에 `README.md`와 동일한 제목 계층과 사실을 자연스러운 한글로 작성하고 상단에 `English` 링크를 둡니다. 제품 한 줄 설명은 “여러 프로젝트와 여러 CLI 코딩 에이전트를 하나의 데스크톱 작업공간에서 관리하세요.”로 작성합니다.

- [ ] **Step 4: Markdown 형식 오류를 확인합니다**

Run:

```bash
git diff --check -- README.md README.ko.md
```

Expected: 출력 없이 종료 코드 0입니다.

### Task 2: 문서 정합성 검증 및 커밋

**Files:**
- Verify: `README.md`
- Verify: `README.ko.md`

**Interfaces:**
- Consumes: Task 1에서 작성한 두 README
- Produces: 유효한 상대 링크, 일치하는 섹션 구조, 실행 가능한 문서 명령에 대한 검증 결과

- [ ] **Step 1: 상대 링크가 실제 파일을 가리키는지 검사합니다**

Run:

```bash
python3 - <<'PY'
from pathlib import Path
import re

for source in (Path("README.md"), Path("README.ko.md")):
    for target in re.findall(r"\[[^\]]+\]\(([^)]+)\)", source.read_text()):
        if "://" in target or target.startswith("#"):
            continue
        path = (source.parent / target.split("#", 1)[0]).resolve()
        assert path.exists(), f"{source}: missing link target {target}"
print("relative links: ok")
PY
```

Expected: `relative links: ok`

- [ ] **Step 2: 두 문서의 제목 구조가 일치하는지 검사합니다**

Run:

```bash
python3 - <<'PY'
from pathlib import Path

def levels(path):
    return [
        len(line) - len(line.lstrip("#"))
        for line in Path(path).read_text().splitlines()
        if line.startswith("#")
    ]

assert levels("README.md") == levels("README.ko.md")
print("heading structure: ok")
PY
```

Expected: `heading structure: ok`

- [ ] **Step 3: README에 안내한 프로젝트 명령을 실행합니다**

Run:

```bash
pnpm check
pnpm test
pnpm build
```

Expected: Svelte 진단 오류 0개, Vitest 전체 통과, Vite 프로덕션 빌드 성공입니다.

- [ ] **Step 4: 문서 변경을 커밋합니다**

Run:

```bash
git add README.md README.ko.md
git commit -m "docs: 공개 README 영문 및 한글 문서 추가 [ci skip]"
```

Expected: 두 README만 포함한 새 문서 커밋이 생성됩니다.
