//! Claude Code 的**端点/配置证据**（自动归因规格 §10.2 层 ②）。
//!
//! 会话 JSONL 里没有"这次请求打到哪个端点"的字段（§10.1 的表格里 claude-code 那格
//! 写的就是"启动环境变量，日志不记"）——真机验证：44,827 条 deepseek 记录里
//! `requestId` 只在 176 条上出现，正文里的 `router.shengsuanyun.com` 全是**对话内容**
//! 而非请求元数据。所以端点只能从**配置**读：`~/.claude/settings.json` 的 `env`。
//!
//! 隐私边界与 `account.rs` 同纪律：**白名单取键**，只读基址与模型映射；同一段 `env`
//! 里就挨着 `ANTHROPIC_AUTH_TOKEN`，读取器连它的值都不碰（`ALLOWED_KEYS` 之外一律不取，
//! 结构里也没有放令牌的槽位）。
//!
//! 证据强度是 `ConfigCurrent`(4)：配置是"现在"的，历史事实可能用的是另一个端点，
//! 所以它**只能预填与追问，永远不能单独把一组判成 determined**（P3）。

use std::path::Path;

/// 只允许读的 `env` 键。加键要同时问一句"这会不会把凭据带出去"。
const ALLOWED_KEYS: [&str; 5] = [
    "ANTHROPIC_BASE_URL",
    "ANTHROPIC_MODEL",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL",
    "ANTHROPIC_DEFAULT_SONNET_MODEL",
    "ANTHROPIC_DEFAULT_OPUS_MODEL",
];

/// 从模型映射里剥出网关前缀用的分隔符（`deepseek/deepseek-v4-pro-0813`）。
const GATEWAY_SEPARATOR: char = '/';

/// 端点证据。**故意不 derive `Serialize`**：本 crate 不直接依赖 `serde`（边界守卫），
/// 消费方要出 JSON 就自己 `json!`——顺带保证"能带出去的字段"是显式选择的。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ClaudeEndpointConfig {
    pub host: String,
    /// 原始基址（只在本地判断用，UI 只展示主机名）。
    pub base_url: Option<String>,
    /// 基址主机名，如 `router.shengsuanyun.com`。
    pub endpoint_host: Option<String>,
    /// 模型映射里带 `vendor/model` 前缀的那些（配置本身承认经过了网关）。
    pub gateway_named_models: Vec<String>,
    pub evidence_basis: agent_vitals_provider::EvidenceBasis,
    pub source: String,
}

/// 取 URL 的主机名：去 scheme、去路径、去端口、去尾点。镜像
/// `agent_vitals_provider::normalize_host` 的边界处理（端口只在全数字时剥离）。
fn host_of(url: &str) -> Option<String> {
    let mut value = url.trim().to_ascii_lowercase();
    if value.is_empty() {
        return None;
    }
    if let Some((_, rest)) = value.split_once("://") {
        value = rest.to_string();
    }
    value = value.split('/').next().unwrap_or(&value).to_string();
    if let Some((host, port)) = value.rsplit_once(':') {
        if port.chars().all(|c| c.is_ascii_digit()) {
            value = host.to_string();
        }
    }
    let value = value.trim_end_matches('.').to_string();
    if value.is_empty() || !value.contains('.') {
        return None;
    }
    Some(value)
}

/// 读 `~/.claude/settings.json`（`settings.local.json` 覆盖前者，与 Claude Code 的
/// 优先级一致）。两个文件都没有 `env` 就返回 `None`——不猜。
pub fn read_claude_config(home: &Path) -> Option<ClaudeEndpointConfig> {
    let mut env = serde_json::Map::new();
    let mut source_file = None;
    for name in ["settings.json", "settings.local.json"] {
        let path = home.join(".claude").join(name);
        let Ok(text) = std::fs::read_to_string(&path) else { continue };
        let Ok(doc) = serde_json::from_str::<serde_json::Value>(&text) else { continue };
        let Some(block) = doc.get("env").and_then(serde_json::Value::as_object) else { continue };
        // 白名单投影：`env` 里其它键（尤其 ANTHROPIC_AUTH_TOKEN）连值都不复制出来。
        for key in ALLOWED_KEYS {
            if let Some(value) = block.get(key).and_then(serde_json::Value::as_str) {
                if !value.trim().is_empty() {
                    env.insert(key.to_string(), serde_json::Value::String(value.trim().to_string()));
                }
            }
        }
        source_file = Some(format!("~/.claude/{name} env"));
    }
    if env.is_empty() {
        return None;
    }
    let base_url = env.get("ANTHROPIC_BASE_URL").and_then(|v| v.as_str()).map(str::to_string);
    let endpoint_host = base_url.as_deref().and_then(host_of);
    let mut gateway_named_models: Vec<String> = Vec::new();
    for key in ["ANTHROPIC_MODEL", "ANTHROPIC_DEFAULT_HAIKU_MODEL", "ANTHROPIC_DEFAULT_SONNET_MODEL", "ANTHROPIC_DEFAULT_OPUS_MODEL"] {
        if let Some(model) = env.get(key).and_then(|v| v.as_str()) {
            if model.contains(GATEWAY_SEPARATOR) {
                gateway_named_models.push(model.to_string());
            }
        }
    }
    gateway_named_models.sort();
    gateway_named_models.dedup();
    Some(ClaudeEndpointConfig {
        host: "claude-code".to_string(),
        base_url,
        endpoint_host,
        gateway_named_models,
        evidence_basis: agent_vitals_provider::EvidenceBasis::ConfigCurrent,
        source: source_file.unwrap_or_else(|| "~/.claude/settings.json env".to_string()),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write_settings(home: &Path, name: &str, body: &str) {
        let dir = home.join(".claude");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join(name), body).unwrap();
    }

    /// 白名单投影：同一个 `env` 里的令牌/其它键绝不进入结构，序列化后也不含它们
    /// （与 `account.rs` 同一条 P1 断言）。
    #[test]
    fn only_whitelisted_env_keys_are_read_and_never_the_token() {
        let home = std::env::temp_dir().join(format!("av-config-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&home);
        write_settings(&home, "settings.json", r#"{
          "env": {
            "ANTHROPIC_BASE_URL": "https://router.shengsuanyun.com/api",
            "ANTHROPIC_MODEL": "deepseek/deepseek-v4-pro-0813",
            "ANTHROPIC_AUTH_TOKEN": "sk-SECRET-VALUE-DO-NOT-LEAK",
            "ANTHROPIC_API_KEY": "sk-ANOTHER-SECRET",
            "SOME_OTHER": "x"
          },
          "model": "sonnet"
        }"#);
        let cfg = read_claude_config(&home).expect("config");
        assert_eq!(cfg.host, "claude-code");
        assert_eq!(cfg.endpoint_host.as_deref(), Some("router.shengsuanyun.com"));
        assert_eq!(cfg.gateway_named_models, vec!["deepseek/deepseek-v4-pro-0813"]);
        assert_eq!(cfg.evidence_basis, agent_vitals_provider::EvidenceBasis::ConfigCurrent);
        // 结构里能带出去的字段是显式列出的这几个（下面这份 JSON 就是设计上允许的
        // 全部内容），凭据连槽位都没有。
        let serialized = serde_json::json!({
            "host": cfg.host, "base_url": cfg.base_url, "endpoint_host": cfg.endpoint_host,
            "gateway_named_models": cfg.gateway_named_models, "source": cfg.source,
        }).to_string();
        for forbidden in ["SECRET", "sk-", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_API_KEY", "SOME_OTHER"] {
            assert!(!serialized.contains(forbidden), "leaked {forbidden}: {serialized}");
        }
        let _ = std::fs::remove_dir_all(&home);
    }

    /// `settings.local.json` 覆盖 `settings.json`（与 Claude Code 的优先级一致）。
    #[test]
    fn local_settings_override_global() {
        let home = std::env::temp_dir().join(format!("av-config-local-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&home);
        write_settings(&home, "settings.json", r#"{"env":{"ANTHROPIC_BASE_URL":"https://api.deepseek.com"}}"#);
        write_settings(&home, "settings.local.json", r#"{"env":{"ANTHROPIC_BASE_URL":"https://router.shengsuanyun.com/api","ANTHROPIC_DEFAULT_HAIKU_MODEL":"deepseek/deepseek-v4-flash"}}"#);
        let cfg = read_claude_config(&home).unwrap();
        assert_eq!(cfg.endpoint_host.as_deref(), Some("router.shengsuanyun.com"));
        assert_eq!(cfg.gateway_named_models, vec!["deepseek/deepseek-v4-flash"]);
        let _ = std::fs::remove_dir_all(&home);
    }

    #[test]
    fn official_endpoint_and_missing_config_both_behave() {
        let home = std::env::temp_dir().join(format!("av-config-none-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&home);
        assert!(read_claude_config(&home).is_none(), "no config file → None, never a guess");
        write_settings(&home, "settings.json", r#"{"env":{"ANTHROPIC_BASE_URL":"https://api.deepseek.com/v1"}}"#);
        let cfg = read_claude_config(&home).unwrap();
        assert_eq!(cfg.endpoint_host.as_deref(), Some("api.deepseek.com"));
        assert!(cfg.gateway_named_models.is_empty());
        assert_eq!(host_of("HTTPS://Router.ShengSuanYun.com:443/api/"), Some("router.shengsuanyun.com".to_string()));
        assert_eq!(host_of("not-a-url"), None);
        let _ = std::fs::remove_dir_all(&home);
    }
}
