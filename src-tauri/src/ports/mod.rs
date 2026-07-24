use std::collections::{HashMap, HashSet};
use sysinfo::{Pid, System};

/// root pid의 자손(자기 자신 포함) pid 집합을 만든다.
pub fn descendant_pids(root: u32) -> HashSet<u32> {
    let system = System::new_all();
    let mut children: HashMap<u32, Vec<u32>> = HashMap::new();
    for (pid, process) in system.processes() {
        if let Some(parent) = process.parent() {
            children.entry(parent.as_u32()).or_default().push(pid.as_u32());
        }
    }
    let mut set = HashSet::new();
    let mut stack = vec![root];
    while let Some(p) = stack.pop() {
        if !set.insert(p) {
            continue;
        }
        if let Some(kids) = children.get(&p) {
            stack.extend(kids.iter().copied());
        }
    }
    set
}

/// 토큰을 소문자 basename으로 정규화해 중복 없이 추가한다.
fn push_token(tokens: &mut Vec<String>, seen: &mut HashSet<String>, raw: &str) {
    let token = raw.trim().to_lowercase();
    if token.is_empty() {
        return;
    }
    if seen.insert(token.clone()) {
        tokens.push(token);
    }
}

/// 세션 프로세스 트리(자기 자신 포함)에서 실행 파일/커맨드 토큰을 수집한다.
/// tmux 등 멀티플렉서를 뚫고 실제로 어떤 CLI 에이전트가 도는지 감지하는 데 쓴다.
pub fn descendant_process_tokens(root: u32) -> Vec<String> {
    let pids = descendant_pids(root);
    let system = System::new_all();
    let mut tokens: Vec<String> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();
    for pid in pids {
        let Some(process) = system.process(Pid::from_u32(pid)) else {
            continue;
        };
        push_token(&mut tokens, &mut seen, &process.name().to_string_lossy());
        if let Some(name) = process.exe().and_then(|p| p.file_name()) {
            push_token(&mut tokens, &mut seen, &name.to_string_lossy());
        }
        for arg in process.cmd() {
            let arg = arg.to_string_lossy();
            let base = arg.rsplit(['/', '\\']).next().unwrap_or(arg.as_ref());
            push_token(&mut tokens, &mut seen, base);
        }
    }
    tokens
}

/// lsof name 필드("*:5173", "127.0.0.1:5173", "[::1]:5173")에서 포트를 뽑는다.
fn parse_port(name: &str) -> Option<u16> {
    let after = name.rsplit(':').next()?.trim();
    after.split_whitespace().next()?.parse().ok()
}

/// `lsof -F pn` 출력에서 pids에 속한 프로세스의 LISTEN 포트를 추출한다(오름차순, 중복 제거).
pub fn parse_lsof_ports(output: &str, pids: &HashSet<u32>) -> Vec<u16> {
    let mut result: Vec<u16> = Vec::new();
    let mut include = false;
    for line in output.lines() {
        if let Some(rest) = line.strip_prefix('p') {
            include = rest
                .trim()
                .parse::<u32>()
                .map(|p| pids.contains(&p))
                .unwrap_or(false);
        } else if let Some(rest) = line.strip_prefix('n') {
            if include {
                if let Some(port) = parse_port(rest) {
                    if !result.contains(&port) {
                        result.push(port);
                    }
                }
            }
        }
    }
    result.sort_unstable();
    result
}

/// root_pid 프로세스 트리가 여는 LISTEN 포트를 감지한다. lsof 미가용/미탐지 시 빈 벡터.
pub fn detect_ports(root_pid: u32) -> Vec<u16> {
    let pids = descendant_pids(root_pid);
    let output = match std::process::Command::new("lsof")
        .args(["-nP", "-iTCP", "-sTCP:LISTEN", "-F", "pn"])
        .output()
    {
        Ok(o) => o,
        Err(_) => return Vec::new(),
    };
    parse_lsof_ports(&String::from_utf8_lossy(&output.stdout), &pids)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 포트를_이름에서_파싱한다() {
        assert_eq!(parse_port("*:5173"), Some(5173));
        assert_eq!(parse_port("127.0.0.1:3000"), Some(3000));
        assert_eq!(parse_port("[::1]:8080"), Some(8080));
        assert_eq!(parse_port("bogus"), None);
    }

    #[test]
    fn 대상_pid의_포트만_추출한다() {
        let output = "p1000\nn*:5173\nn127.0.0.1:6006\np2000\nn*:9999\n";
        let pids: HashSet<u32> = [1000u32].into_iter().collect();
        assert_eq!(parse_lsof_ports(output, &pids), vec![5173, 6006]);
    }

    #[test]
    fn 대상에_없는_pid는_제외하고_정렬한다() {
        let output = "p2000\nn*:9999\np1000\nn*:8080\nn*:3000\n";
        let pids: HashSet<u32> = [1000u32].into_iter().collect();
        assert_eq!(parse_lsof_ports(output, &pids), vec![3000, 8080]);
    }
}
