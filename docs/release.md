# 릴리스 · 자동 업데이트

Worklane은 `tauri-plugin-updater`로 자동 업데이트를 지원한다. 새 버전을 배포하면 실행 중인 앱이
GitHub Releases의 `latest.json`을 읽어 스스로 확인·설치·재시작한다.

## 동작 개요

- 앱 시작 시 `updater.check()`가 `tauri.conf.json`의 endpoint를 조회한다.
  - endpoint: `https://github.com/mongmeo-dev/worklane/releases/latest/download/latest.json`
- 서명 검증에는 `tauri.conf.json`의 `plugins.updater.pubkey`(공개키)를 사용한다.
- 릴리스는 GitHub Actions(`.github/workflows/release.yml`)가 개인키로 서명해 만든다.

## 최초 1회 설정 (GitHub Secrets 등록)

릴리스 워크플로가 서명하려면 저장소에 시크릿 2개가 필요하다.
GitHub → **Settings → Secrets and variables → Actions → New repository secret**

| 시크릿 이름 | 값 |
| --- | --- |
| `TAURI_SIGNING_PRIVATE_KEY` | `keys/worklane-update.key` 파일의 **전체 내용**(한 줄 base64) |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | 키 생성 시 사용한 비밀번호 |

- 개인키는 `keys/`에 보관하며 `.gitignore` 대상이라 커밋되지 않는다. **절대 저장소에 올리지 않는다.**
- 공개키는 이미 `tauri.conf.json`에 들어 있다. 개인키를 분실하면 새 키쌍을 만들고 공개키를 교체해야 한다.
  - 새 키 생성: `pnpm tauri signer generate -w keys/worklane-update.key`

## macOS 코드 서명 · 공증 (보안 경고 제거)

업데이터 서명(minisign)과 **별개로**, macOS Gatekeeper 경고("확인되지 않은 개발자")를 없애려면
**Apple Developer ID 인증서로 코드 서명 + 공증(notarization)** 이 필요하다. 없으면 앱은 ad-hoc 서명이라 경고가 뜬다.

릴리스 워크플로는 아래 시크릿이 있으면 자동으로 서명·공증하고, 없으면 기존처럼 ad-hoc로 빌드한다.

| 시크릿 | 값 | 용도 |
| --- | --- | --- |
| `APPLE_CERTIFICATE` | Developer ID Application `.p12`의 base64 (`base64 -i cert.p12`) | 코드 서명 |
| `APPLE_CERTIFICATE_PASSWORD` | `.p12` 내보낼 때 지정한 비밀번호 | 코드 서명 |
| `APPLE_SIGNING_IDENTITY` | 예: `Developer ID Application: 이름 (TEAMID)` | 코드 서명 ID |
| `APPLE_API_ISSUER` | App Store Connect API **Issuer ID**(UUID) | 공증 |
| `APPLE_API_KEY` | API **Key ID**(예: `AX682SGT3R`) | 공증 |
| `APPLE_API_KEY_P8` | `keys/AuthKey_*.p8`의 base64 (`base64 -i keys/AuthKey_XXXX.p8`) | 공증 |

- **Developer ID Application 인증서(.p12)** 는 [developer.apple.com](https://developer.apple.com/account/resources/certificates) 에서
  발급 후 키체인에서 `.p12`로 내보낸다. (Apple Developer Program 멤버십 필요)
- 공증은 이미 보유한 App Store Connect API 키(`keys/AuthKey_*.p8`)를 사용한다. Issuer ID는 App Store Connect → Users and Access → Integrations(Keys)에서 확인한다.
- 6개를 모두 등록하면 다음 태그 릴리스부터 서명·공증된 번들이 게시되어 경고가 사라진다.

### 서명 없이 현재 빌드 여는 임시 방법

```bash
xattr -dr com.apple.quarantine /Applications/Worklane.app   # 격리 속성 제거 후 실행
```
또는 앱을 우클릭 → 열기, 혹은 시스템 설정 → 개인정보 보호 및 보안 → "확인 없이 열기".

## 릴리스 절차

1. 버전을 올린다(두 파일을 동일하게).
   - `package.json`의 `version`
   - `src-tauri/tauri.conf.json`의 `version`
2. 커밋한다. 예: `git commit -m "chore: v0.1.1"`
3. 태그를 만들고 푸시한다.
   ```bash
   git tag v0.1.1
   git push origin v0.1.1
   ```
4. `release` 워크플로가 자동 실행되어 서명된 macOS 유니버설 번들과 `latest.json`을 릴리스에 게시한다.

## 확인 팁

- 자동 업데이트는 **설치된 앱 버전보다 릴리스 버전이 높을 때만** 감지된다. 최초 테스트 시 반드시 버전을 올린다.
- 수동 확인은 앱 **설정 → 연동 → 앱 업데이트 → 업데이트 확인**에서 할 수 있다.
- 개발(`pnpm tauri dev`) 실행에서는 서명/엔드포인트가 없어 확인이 조용히 실패한다. 정상이다.

## 로컬에서 서명 번들 만들기(선택)

```bash
export TAURI_SIGNING_PRIVATE_KEY="$(cat keys/worklane-update.key)"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="<비밀번호>"
pnpm tauri build --target universal-apple-darwin
```
`src-tauri/target/universal-apple-darwin/release/bundle/`에 `.app.tar.gz`와 `.sig`, `latest.json`이 생성된다.
