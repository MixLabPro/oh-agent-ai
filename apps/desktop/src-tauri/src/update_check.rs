//! 应用内版本检查的纯选择逻辑（无网络、无 Tauri 依赖，便于单测）。
//!
//! 为什么不用 GitHub `/releases/latest`：该端点会跳过 prerelease，
//! 1.0.0-beta.* 用户永远看不到更新的 beta。这里改为拉取
//! `/releases?per_page=30` 列表，自行按通道与 semver 选出候选：
//!
//! - 只认 `app-v<semver>` 标签（仓库历史上还有 `skill-v*` 等其它标签族）；
//! - 跳过 draft；
//! - 当前是预发布版（如 1.0.0-beta.3）→ 预发布与正式版都参与比较；
//!   当前是正式版 → 只看正式版，不把 beta 推给正式版用户；
//! - 只有严格更新（semver 优先级，beta.10 > beta.9，1.0.0 > 1.0.0-beta.N）才算有更新。

use semver::Version;
use serde_json::Value;

/// 可信发布页根；单个 release 页链接必须严格落在 `{TRUSTED_RELEASES_URL}/tag/<tag>`。
pub const TRUSTED_RELEASES_URL: &str = "https://github.com/Oh-Agent-AI/oh-agent/releases";
/// 发布列表 API（含 prerelease）。owner/repo 与 TRUSTED_RELEASES_URL 保持一致。
pub const RELEASES_API: &str =
    "https://api.github.com/repos/Oh-Agent-AI/oh-agent/releases?per_page=30";
pub const APP_TAG_PREFIX: &str = "app-v";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ReleaseCandidate {
    pub tag: String,
    pub version: Version,
    /// semver 带预发布段，或 GitHub 把它标成 prerelease，都视为预发布。
    pub prerelease: bool,
    /// 校验通过的 release 页链接；不可信时回落到 TRUSTED_RELEASES_URL。
    pub release_url: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct UpdateSelection {
    /// 当前通道内可见的最新发布（可能等于当前版本）。
    pub latest: ReleaseCandidate,
    /// 只有 latest 严格新于当前版本时为 true。
    pub update_available: bool,
}

/// 与前端 `parseUpdateCheck` 的标签白名单一致：`app-v` + `[A-Za-z0-9][A-Za-z0-9._-]{0,63}`。
fn tag_is_safe(tag: &str) -> bool {
    let Some(rest) = tag.strip_prefix(APP_TAG_PREFIX) else {
        return false;
    };
    let mut chars = rest.chars();
    match chars.next() {
        Some(c) if c.is_ascii_alphanumeric() => {}
        _ => return false,
    }
    rest.len() <= 64 && chars.all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'))
}

/// 只接受 `https://github.com/Oh-Agent-AI/oh-agent/releases/tag/<tag>` 这一种形态。
fn trusted_release_url(html_url: Option<&str>, tag: &str) -> String {
    let expected = format!("{TRUSTED_RELEASES_URL}/tag/{tag}");
    match html_url {
        Some(url) if url == expected => expected,
        _ => TRUSTED_RELEASES_URL.to_string(),
    }
}

/// 把单条 release JSON 解析成候选；draft、非 app-v、非 semver、不安全标签一律 None。
pub fn parse_release(entry: &Value) -> Option<ReleaseCandidate> {
    if entry.get("draft").and_then(Value::as_bool).unwrap_or(false) {
        return None;
    }
    let tag = entry.get("tag_name").and_then(Value::as_str)?;
    if !tag_is_safe(tag) {
        return None;
    }
    let version = Version::parse(&tag[APP_TAG_PREFIX.len()..]).ok()?;
    let flagged = entry
        .get("prerelease")
        .and_then(Value::as_bool)
        .unwrap_or(false);
    Some(ReleaseCandidate {
        tag: tag.to_string(),
        prerelease: flagged || !version.pre.is_empty(),
        release_url: trusted_release_url(entry.get("html_url").and_then(Value::as_str), tag),
        version,
    })
}

/// 从 `/releases` 列表里按通道选出最新候选。列表为空 / 无可用 app-v 发布 → None。
pub fn select_update(current: &Version, releases: &Value) -> Option<UpdateSelection> {
    let allow_prerelease = !current.pre.is_empty();
    let latest = releases
        .as_array()?
        .iter()
        .filter_map(parse_release)
        .filter(|candidate| allow_prerelease || !candidate.prerelease)
        .max_by(|a, b| {
            a.version
                .cmp_precedence(&b.version)
                .then_with(|| a.version.cmp(&b.version))
        })?;
    let update_available = latest.version.cmp_precedence(current).is_gt();
    Some(UpdateSelection {
        latest,
        update_available,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn v(s: &str) -> Version {
        Version::parse(s).unwrap()
    }

    fn rel(tag: &str, prerelease: bool) -> Value {
        json!({
            "tag_name": tag,
            "draft": false,
            "prerelease": prerelease,
            "html_url": format!("{TRUSTED_RELEASES_URL}/tag/{tag}"),
        })
    }

    #[test]
    fn stable_user_ignores_betas() {
        let list = json!([rel("app-v1.1.0-beta.1", true), rel("app-v1.0.0", false)]);
        let sel = select_update(&v("1.0.0"), &list).unwrap();
        assert_eq!(sel.latest.tag, "app-v1.0.0");
        assert!(!sel.update_available);
        // 只有 beta 时，正式版用户没有任何候选。
        assert!(select_update(&v("1.0.0"), &json!([rel("app-v1.1.0-beta.1", true)])).is_none());
    }

    #[test]
    fn stable_user_ignores_github_flagged_prerelease_even_with_plain_version() {
        let list = json!([rel("app-v1.2.0", true), rel("app-v1.1.0", false)]);
        let sel = select_update(&v("1.0.0"), &list).unwrap();
        assert_eq!(sel.latest.tag, "app-v1.1.0");
        assert!(sel.update_available);
    }

    #[test]
    fn beta_user_sees_newer_beta() {
        let list = json!([
            rel("app-v1.0.0-beta.4", true),
            rel("app-v1.0.0-beta.3", true)
        ]);
        let sel = select_update(&v("1.0.0-beta.3"), &list).unwrap();
        assert_eq!(sel.latest.tag, "app-v1.0.0-beta.4");
        assert!(sel.update_available);
        assert_eq!(
            sel.latest.release_url,
            format!("{TRUSTED_RELEASES_URL}/tag/app-v1.0.0-beta.4")
        );
    }

    #[test]
    fn beta_user_sees_stable_release() {
        let list = json!([rel("app-v1.0.0", false), rel("app-v1.0.0-beta.9", true)]);
        let sel = select_update(&v("1.0.0-beta.3"), &list).unwrap();
        assert_eq!(sel.latest.tag, "app-v1.0.0");
        assert!(sel.update_available);
    }

    #[test]
    fn ignores_non_app_tags_and_drafts() {
        let mut draft = rel("app-v1.0.0-beta.9", true);
        draft["draft"] = json!(true);
        let list = json!([
            rel("skill-v9.9.9", false),
            rel("v9.9.9", false),
            rel("app-vnext", false),
            rel("app-v2.0.0+build/../x", false),
            draft,
            rel("app-v1.0.0-beta.3", true),
        ]);
        let sel = select_update(&v("1.0.0-beta.2"), &list).unwrap();
        assert_eq!(sel.latest.tag, "app-v1.0.0-beta.3");
        assert!(sel.update_available);
    }

    #[test]
    fn beta_10_is_newer_than_beta_9() {
        let list = json!([
            rel("app-v1.0.0-beta.9", true),
            rel("app-v1.0.0-beta.10", true)
        ]);
        let sel = select_update(&v("1.0.0-beta.9"), &list).unwrap();
        assert_eq!(sel.latest.tag, "app-v1.0.0-beta.10");
        assert!(sel.update_available);
    }

    #[test]
    fn equal_version_is_not_an_update() {
        let list = json!([rel("app-v1.0.0-beta.3", true)]);
        let sel = select_update(&v("1.0.0-beta.3"), &list).unwrap();
        assert_eq!(sel.latest.tag, "app-v1.0.0-beta.3");
        assert!(!sel.update_available);
    }

    #[test]
    fn older_release_is_not_an_update() {
        let list = json!([rel("app-v1.0.0-beta.2", true)]);
        let sel = select_update(&v("1.0.0-beta.3"), &list).unwrap();
        assert!(!sel.update_available);
    }

    #[test]
    fn empty_or_malformed_list_yields_none() {
        assert!(select_update(&v("1.0.0-beta.3"), &json!([])).is_none());
        assert!(select_update(
            &v("1.0.0-beta.3"),
            &json!({"message": "API rate limit exceeded"})
        )
        .is_none());
        assert!(select_update(&v("1.0.0-beta.3"), &json!([{"draft": false}])).is_none());
    }

    #[test]
    fn untrusted_html_url_falls_back_to_releases_root() {
        let mut evil = rel("app-v1.0.0-beta.4", true);
        evil["html_url"] =
            json!("https://evil.example/Oh-Agent-AI/oh-agent/releases/tag/app-v1.0.0-beta.4");
        let mut other_repo = rel("app-v1.0.0-beta.5", true);
        other_repo["html_url"] =
            json!("https://github.com/someone/fork/releases/tag/app-v1.0.0-beta.5");
        for entry in [evil, other_repo] {
            let cand = parse_release(&entry).unwrap();
            assert_eq!(cand.release_url, TRUSTED_RELEASES_URL);
        }
    }

    /// 2026-10-22 实拍的 `/releases?per_page=30` 响应（精简字段），见 fixtures 文件。
    #[test]
    fn live_fixture_beta3() {
        let list: Value =
            serde_json::from_str(include_str!("../tests/fixtures/releases-2026-10-22.json"))
                .unwrap();
        let sel = select_update(&v("1.0.0-beta.2"), &list).unwrap();
        assert_eq!(sel.latest.tag, "app-v1.0.0-beta.3");
        assert!(sel.update_available);
        assert_eq!(
            sel.latest.release_url,
            "https://github.com/Oh-Agent-AI/oh-agent/releases/tag/app-v1.0.0-beta.3"
        );
        let sel = select_update(&v("1.0.0-beta.3"), &list).unwrap();
        assert!(!sel.update_available);
        // 正式版用户在只有 beta 的仓库里没有候选。
        assert!(select_update(&v("1.0.0"), &list).is_none());
    }
}
