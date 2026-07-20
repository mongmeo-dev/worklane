# AI Agent Workspace

## Project Description

* 이 프로젝트는 여러 프로젝트를 동시에 진행하는 개발자가 여러 AI Agent를 쉽게 관리할 수 있게 만드는 프로그램이다.
* 유사한 도구로는 [Superset](https://superset.sh/)이나 [Orca](https://www.onorca.dev/)가 있다.

## Technical Requirements

* 이 프로젝트는 크로스플랫폼으로 작동한다.
* 데스크톱 버전은 MacOS와 Windows, Linux를 지원해야 하며, 모바일 버전에 대해서는 지원 예정이지만, 아직 생각하지 않는다.
* 데스크톱 버전은 MacOS를 우선 지원한다.

## Common Task Rule

* 모든 Task를 실행함에 있어 모호한 부분이 있을 경우 추측하여 작업하지 않고 사용자에게 질의한다.
* 사고 과정 및 사용자와의 인터렉션은 모두 한국어로 한다.
* 작업 진행 중 발견되는 프로젝트 전체적인 룰이나 사용자가 명시적으로 프로젝트 전체에서 적용하라고 지정하는 룰은 반드시 이 파일에 추가한다.
* 사용자와의 인터렉션은 경어체를 사용한다.
* main 브랜치에서 작업하는 경우 반드시 `git pull` 이후 진행한다.
* main 이외 브랜치에서 작업하는 경우 반드시 base branch(브랜치가 나온 기준 브랜치)를 rebase한다.

## Commit Rule

* 배포가 필요하지 않은 수정사항(문서 작성만 있는 커밋 등)에 대해서는 `[ci skip]` 문구를 함께 넣어 Github actions의 작동을 방지한다. 단, CI 통과(lint 등)가 필요한 코드 수정에는 `[ci skip]`을 붙이지 않는다 — 체크가 아예 보고되지 않아("no checks reported") PR 머지가 막힌다.
* 작업 중간중간 기능단위로 커밋하며 진행한다.
* 커밋 메세지는 되도록 한글로 작성한다.
* 커밋에 Co-Author를 포함하지 않는다.
* 한 커밋에 여러 기능 변경을 포함하지 않는다.

## Docs Rule

* 문서는 코드나 고유명사 등 불가피한 경우를 제외하고 반드시 한글로 작성한다.
* 별도의 worktree에서 작업 중 수정이 의도된 문서가 git ignore 대상인 경우, git으로 전파되지 않으므로 반드시 main worktree에도 동일하게 반영한다.
* 다른 task를 진행함에 있어서도 참조해야 하는 문서의 경우 이 문서에 링크한다.

## Execution Rule

* 터미널 커맨드 실행 시 환경변수의 주입이 필요한 경우 `mise exec -- `를 명령어 앞에 붙여 환경변수를 정상 사용할 수 있도록 한다.
