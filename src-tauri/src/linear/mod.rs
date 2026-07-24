/// Linear 이슈 한 건.
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LinearIssue {
    pub identifier: String,
    pub title: String,
    pub url: String,
    pub description: String,
}

const QUERY: &str = r#"{"query":"query { viewer { assignedIssues(first: 30, filter: { completedAt: { null: true } }) { nodes { identifier title url description } } } }"}"#;

/// Linear GraphQL API로 내게 할당된 미완료 이슈를 조회한다.
pub fn list_linear_issues(api_key: &str) -> Result<Vec<LinearIssue>, String> {
    let api_key = api_key.trim();
    if api_key.is_empty() {
        return Err("Linear API 키를 설정하세요.".into());
    }
    let client = reqwest::blocking::Client::new();
    let resp = client
        .post("https://api.linear.app/graphql")
        .header("Authorization", api_key)
        .header("Content-Type", "application/json")
        .body(QUERY)
        .send()
        .map_err(|e| format!("Linear 요청 실패: {e}"))?;
    let text = resp.text().map_err(|e| format!("Linear 응답 읽기 실패: {e}"))?;
    parse_issues(&text)
}

/// GraphQL 응답 JSON에서 이슈 목록을 파싱한다. errors가 있으면 에러 메시지를 반환한다.
fn parse_issues(body: &str) -> Result<Vec<LinearIssue>, String> {
    let v: serde_json::Value =
        serde_json::from_str(body).map_err(|e| format!("Linear 응답 파싱 실패: {e}"))?;
    if let Some(errors) = v.get("errors").and_then(|e| e.as_array()) {
        let message = errors
            .first()
            .and_then(|e| e.get("message"))
            .and_then(|m| m.as_str())
            .unwrap_or("알 수 없는 오류");
        return Err(format!("Linear 오류: {message}"));
    }
    let nodes = v
        .pointer("/data/viewer/assignedIssues/nodes")
        .and_then(|n| n.as_array())
        .cloned()
        .unwrap_or_default();
    Ok(nodes
        .iter()
        .filter_map(|node| {
            Some(LinearIssue {
                identifier: node.get("identifier")?.as_str()?.to_string(),
                title: node.get("title")?.as_str()?.to_string(),
                url: node.get("url").and_then(|u| u.as_str()).unwrap_or("").to_string(),
                description: node
                    .get("description")
                    .and_then(|d| d.as_str())
                    .unwrap_or("")
                    .to_string(),
            })
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn 이슈_노드를_파싱한다() {
        let body = r#"{"data":{"viewer":{"assignedIssues":{"nodes":[
            {"identifier":"ENG-1","title":"로그인 개선","url":"https://linear.app/x/ENG-1","description":"본문"},
            {"identifier":"ENG-2","title":"결제","url":"https://linear.app/x/ENG-2","description":null}
        ]}}}}"#;
        let issues = parse_issues(body).unwrap();
        assert_eq!(issues.len(), 2);
        assert_eq!(issues[0].identifier, "ENG-1");
        assert_eq!(issues[1].description, "");
    }

    #[test]
    fn errors가_있으면_에러를_반환한다() {
        let body = r#"{"errors":[{"message":"Authentication required"}]}"#;
        assert!(parse_issues(body).is_err());
    }

    #[test]
    fn 노드가_없으면_빈_목록() {
        assert!(parse_issues(r#"{"data":{"viewer":{"assignedIssues":{"nodes":[]}}}}"#)
            .unwrap()
            .is_empty());
    }
}
