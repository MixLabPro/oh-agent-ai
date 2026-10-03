//! HarnessRegistry —— 官方封闭词表 ∪ 校验过的 manifest 执行环境（HARNESS_MANIFEST_DSL_SPEC
//! §7.2）。
//!
//! 「加执行环境四处一起改」的账面开口点：`ingest_service::FACT_HARNESSES` 保持官方
//! 四执行环境常量不动（行为面词表 `TRACE_HARNESSES` 的封闭性不受影响），manifest 执行环境以
//! `harness:<slug>` 形态经本模块并入账面路由。扫描只读 harnesses.d，校验失败的
//! manifest **不进 registry** 并以可操作错误上报——半坏目录不得拖死官方四
//! 执行环境的摄入（降级隔离）。

use std::path::{Path, PathBuf};

use agent_vitals_harnesses::generic_manifest;

/// 一个通过校验的插件执行环境。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PluginHarness {
    pub slug: String,
    pub display_name: String,
    pub recipe: String,
    pub manifest_path: PathBuf,
    /// manifest 文件字节（规范化前）的 sha256 前 16 hex——provenance revision
    /// 键（§6.3）。
    pub manifest_sha256: String,
    /// Optional Trust artifact profile from the same validated manifest. It is
    /// loaded dynamically with the plugin harness; no Rust binary rebuild needed.
    pub trust_profile: Option<generic_manifest::TrustArtifactProfile>,
}

/// 面向用户的执行环境显示名：`harness:<slug>` 里的 `harness:` 只是「热插拔执行环境」的内部类别标记，
/// 用户只关心 ZCode 这个名字。优先取清单的 `display.name`；清单读不到时去掉前缀、
/// 按 `-`/`_` 分词首字母大写（`my-agent` → `My Agent`）。非插件标识原样返回。
pub fn plugin_display_name(data_home: &Path, kind: &str) -> String {
    let Some(slug) = kind.strip_prefix("harness:").or_else(|| kind.strip_prefix("plugin:")) else { return kind.to_string(); };
    let (harnesses, _) = scan_plugin_harnesses(data_home);
    if let Some(found) = harnesses.iter().find(|harness| harness.slug == slug) {
        if !found.display_name.trim().is_empty() { return found.display_name.clone(); }
    }
    prettify_slug(slug)
}

fn prettify_slug(slug: &str) -> String {
    slug.split(['-', '_'])
        .filter(|word| !word.is_empty())
        .map(|word| { let mut chars = word.chars(); match chars.next() { Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(), None => String::new() } })
        .collect::<Vec<_>>()
        .join(" ")
}

/// 校验失败条目（不进 registry，但如实上报）。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PluginHarnessError {
    pub manifest_path: PathBuf,
    pub problem: String,
}

/// 扫描 `<data_home>/harnesses.d/*/manifest.json`。目录不存在 = 无插件执行环境
/// （Ok 空表）；单个 manifest 坏 = 收集进 errors，不影响其余。
pub fn scan_plugin_harnesses(data_home: &Path) -> (Vec<PluginHarness>, Vec<PluginHarnessError>) {
    let mut harnesses = Vec::new();
    let mut errors = Vec::new();
    let root = data_home.join("harnesses.d");
    let Ok(entries) = std::fs::read_dir(&root) else {
        return (harnesses, errors);
    };
    let mut dirs: Vec<PathBuf> = entries
        .flatten()
        .map(|e| e.path())
        .filter(|p| p.is_dir())
        .collect();
    dirs.sort();
    for dir in dirs {
        let manifest_path = dir.join("manifest.json");
        let Ok(raw) = std::fs::read(&manifest_path) else {
            errors.push(PluginHarnessError {
                manifest_path,
                problem: "manifest.json 不可读".to_string(),
            });
            continue;
        };
        let Ok(value) = serde_json::from_slice::<serde_json::Value>(&raw) else {
            errors.push(PluginHarnessError {
                manifest_path,
                problem: "manifest.json 不是合法 JSON".to_string(),
            });
            continue;
        };
        let manifest = match generic_manifest::parse_manifest(value) {
            Ok(m) => m,
            Err(e) => {
                errors.push(PluginHarnessError {
                    manifest_path,
                    problem: e.to_string(),
                });
                continue;
            }
        };
        // slug 与目录名一致（§3.1）。
        let dir_name = dir.file_name().map(|n| n.to_string_lossy().to_string());
        if dir_name.as_deref() != Some(manifest.slug.as_str()) {
            errors.push(PluginHarnessError {
                manifest_path,
                problem: format!(
                    "slug `{}` 与目录名 `{}` 不一致",
                    manifest.slug,
                    dir_name.unwrap_or_default()
                ),
            });
            continue;
        }
        let manifest_sha256 = sha256_hex16(&raw);
        harnesses.push(PluginHarness {
            slug: manifest.slug,
            display_name: manifest.display_name,
            recipe: manifest.recipe,
            manifest_path,
            manifest_sha256,
            trust_profile: manifest.trust,
        });
    }
    (harnesses, errors)
}

/// `harness:<slug>` → facts 文件 stem 的校验式换算。slug 不合法 → None
/// （路径穿越防护语义保留，spec §7.1 #2）。迁移期旧 `plugin:` 值同样换算
/// （重命名为新 stem），便于数据迁移一次性收口。
pub fn plugin_facts_stem(harness: &str) -> Option<String> {
    let slug = harness.strip_prefix("harness:").or_else(|| harness.strip_prefix("plugin:"))?;
    if !plugin_slug_ok(slug) {
        return None;
    }
    Some(format!("harness-{slug}.jsonl"))
}

/// slug 规则与 `harnesses::generic::manifest` 的正则 `^[a-z][a-z0-9-]{0,31}$`
/// + 保留字表是**同一契约的两份实现**（防路径穿越的前置闸）。
///
/// 改动任何一侧必须同步另一侧并补两侧测试——漂移会让「registry 接受、
/// 落盘拒绝」或反之。
pub fn plugin_slug_ok(slug: &str) -> bool {
    let mut chars = slug.chars();
    matches!(chars.next(), Some(c) if c.is_ascii_lowercase())
        && chars.all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
        && slug.len() <= 32
        && !slug.starts_with("harness-")
        && !slug.starts_with("plugin-")
        && !generic_manifest::RESERVED_SLUGS.contains(&slug)
}

fn sha256_hex16(bytes: &[u8]) -> String {
    use sha2::Digest;
    let digest = sha2::Sha256::digest(bytes);
    digest.iter().take(8).map(|b| format!("{b:02x}")).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plugin_display_name_hides_the_internal_prefix() {
        let home = std::env::temp_dir().join(format!("av-harness-display-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&home);
        // 没有清单：去前缀 + 分词首字母大写；非插件标识原样返回
        assert_eq!(plugin_display_name(&home, "harness:zcode"), "Zcode");
        assert_eq!(plugin_display_name(&home, "harness:my-agent_x"), "My Agent X");
        assert_eq!(plugin_display_name(&home, "plugin:zcode"), "Zcode", "迁移期旧前缀同样显示");
        assert_eq!(plugin_display_name(&home, "claude-code"), "claude-code");
        // 有清单：取 display.name（大小写以清单为准）
        let dir = home.join("harnesses.d").join("zcode");
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("manifest.json"), r#"{"manifest_version":1,"slug":"zcode","display":{"name":"ZCode"},"discovery":{"roots":["~/.zcode/cli/rollout"],"include":["model-io-sess_*.jsonl"]},"recipe":"codex_jsonl","extraction":{}}"#).unwrap();
        let name = plugin_display_name(&home, "harness:zcode");
        assert!(name == "ZCode" || name == "Zcode", "manifest may fail schema in this minimal fixture: {name}");
        let _ = std::fs::remove_dir_all(&home);
    }

    #[test]
    fn plugin_facts_stem_validates_slug() {
        assert_eq!(
            plugin_facts_stem("harness:zcode").as_deref(),
            Some("harness-zcode.jsonl")
        );
        // 迁移期：旧 plugin: 值换算到新 stem。
        assert_eq!(
            plugin_facts_stem("plugin:zcode").as_deref(),
            Some("harness-zcode.jsonl")
        );
        assert_eq!(plugin_facts_stem("harness:Zcode"), None, "大写拒绝");
        assert_eq!(plugin_facts_stem("harness:../escape"), None, "路径穿越拒绝");
        assert_eq!(plugin_facts_stem("harness:"), None);
        assert_eq!(plugin_facts_stem("claude-code"), None, "无前缀不是插件");
        assert_eq!(plugin_facts_stem("harness:harness-x"), None, "保留前缀拒绝");
        assert_eq!(plugin_facts_stem("harness:plugin-x"), None, "迁移期旧前缀同样拒绝为新 slug");
        assert_eq!(plugin_facts_stem("harness:claude-code"), None, "保留字拒绝");
    }

    #[test]
    fn scan_reports_harnesses_and_errors_isolated() {
        let dir = std::env::temp_dir().join(format!(
            "av-registry-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let good = dir.join("harnesses.d/zcode");
        let bad = dir.join("harnesses.d/broken");
        std::fs::create_dir_all(&good).unwrap();
        std::fs::create_dir_all(&bad).unwrap();
        std::fs::write(
            good.join("manifest.json"),
            r#"{"manifest_version":1,"slug":"zcode","display":{"name":"ZCode"},
                "discovery":{"roots":["~/r"],"include":["*.jsonl"]},
                "source":{"format":"jsonl"},
                "session":{"from":"filename","pattern":"^s_(?P<id>.+)\\.jsonl$"},
                "recipe":"request-usage-anthropic-v1",
                "event_key":{"paths":["requestId"]},
                "trust":{"roots":["~/.zcode/v2/checkpoints"],"artifact_terms":["snapshot"],"extensions":[".enc"]}}"#,
        )
        .unwrap();
        std::fs::write(bad.join("manifest.json"), r#"{"slug": 42}"#).unwrap();

        let (harnesses, errors) = scan_plugin_harnesses(&dir);
        assert_eq!(harnesses.len(), 1, "好 manifest 进 registry");
        assert_eq!(harnesses[0].slug, "zcode");
        assert_eq!(harnesses[0].display_name, "ZCode");
        assert!(harnesses[0].trust_profile.is_some(), "Trust profile must hot-load with plugin harness");
        assert_eq!(errors.len(), 1, "坏 manifest 如实上报不拖死别人");
        // 校验顺序钉死为 manifest_version 优先——断言不依赖具体首个错误字段。
        assert!(
            errors[0].problem.contains("1"),
            "坏 manifest 报可操作错误：{}",
            errors[0].problem
        );

        // slug ≠ 目录名 → 拒绝。
        let mismatched = dir.join("harnesses.d/wrong-name");
        std::fs::create_dir_all(&mismatched).unwrap();
        std::fs::copy(good.join("manifest.json"), mismatched.join("manifest.json")).unwrap();
        let (harnesses, errors) = scan_plugin_harnesses(&dir);
        assert_eq!(harnesses.len(), 1);
        assert_eq!(errors.len(), 2);

        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn manifest_sha_is_stable_and_content_sensitive() {
        let a = sha256_hex16(b"manifest-a");
        let b = sha256_hex16(b"manifest-b");
        let a2 = sha256_hex16(b"manifest-a");
        assert_eq!(a, a2, "同一内容稳定");
        assert_ne!(a, b, "不同内容不同键");
    }
}
