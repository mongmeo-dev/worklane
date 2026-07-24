/// URL로 Slack/Discord 웹훅 페이로드를 고른다. Discord는 content, 그 외(Slack)는 text.
fn webhook_payload(url: &str, text: &str) -> serde_json::Value {
    if url.contains("discord.com") || url.contains("discordapp.com") {
        serde_json::json!({ "content": text })
    } else {
        serde_json::json!({ "text": text })
    }
}

/// Slack/Discord incoming webhook으로 메시지를 보낸다.
pub fn send_webhook(url: &str, text: &str) -> Result<(), String> {
    let url = url.trim();
    if url.is_empty() {
        return Err("웹훅 URL이 없습니다.".into());
    }
    let client = reqwest::blocking::Client::new();
    let resp = client
        .post(url)
        .json(&webhook_payload(url, text))
        .send()
        .map_err(|e| format!("웹훅 전송 실패: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("웹훅 응답 오류: {}", resp.status()));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn discord_url은_content를_쓴다() {
        let p = webhook_payload("https://discord.com/api/webhooks/1/abc", "안녕");
        assert_eq!(p["content"], "안녕");
        assert!(p.get("text").is_none());
    }

    #[test]
    fn slack_url은_text를_쓴다() {
        let p = webhook_payload("https://hooks.slack.com/services/T/B/x", "안녕");
        assert_eq!(p["text"], "안녕");
        assert!(p.get("content").is_none());
    }
}
