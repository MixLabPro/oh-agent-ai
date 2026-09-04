//! 安全启发式扫描的 I/O 层——v0.8 Phase E7.3 从原 `security.rs` 拆出（原文件
//! 把目录遍历/文件读取/权限位读取焊在正则规则判断里）。纯规则引擎迁进
//! `agent_vitals_domain::skills::security_rules`（`Rule`/`rules`/`is_cited`/
//! `check`/`evaluate`/…）；这里只做三件真实 I/O 的事——`canonicalize`（self-
//! exclusion 判定）、`discovery::sorted_files`（目录遍历）、`read_lossy` +
//! `mode_of`（文件内容与权限位读取）——收集好数据后交给 `evaluate()`。

use std::path::Path;

use agent_vitals_domain::skills::security_rules::{evaluate, self_excluded_result, EXEC_EXT};
use serde_json::Value;

use crate::util::{norm, read_lossy};

/// 对 SKILL.md 正文与附带脚本做启发式安全检查。
pub fn security_scan(skill_dir: &Path, skill_raw: &str, self_root: Option<&Path>) -> Value {
    // 排除扫描器自身：否则规则定义与规则说明会自己命中自己（不变量 5）。
    // canonicalize 任一失败（瞬态 fs 错误、并发下目录被改动）**不得**把排除静默
    // 丢掉——否则就扫到自己、self_excluded 缺失，正是 test_self_excluded 在差分
    // harness 下守的回归（曾经扫到自己、报告带自身 22 条规则命中）。失败时回退到
    // 裸路径等值比较（不碰 fs，纯字符串）：skill_dir 与 self_root 字面相等即可排除。
    if let Some(root) = self_root {
        let excluded = match (skill_dir.canonicalize(), root.canonicalize()) {
            (Ok(a), Ok(b)) => a == b,
            _ => skill_dir == root,
        };
        if excluded {
            return self_excluded_result();
        }
    }

    let mut scripts: Vec<(String, bool, Option<String>)> = Vec::new();

    // 排序：walkdir 不保证顺序，findings 与 exec_scripts 的次序都跟着它走
    for p in crate::skills::discovery::sorted_files(skill_dir) {
        if p.file_name().and_then(|s| s.to_str()) == Some("SKILL.md") {
            continue;
        }
        let ext = p
            .extension()
            .and_then(|s| s.to_str())
            .map(|s| s.to_lowercase())
            .unwrap_or_default();
        if !EXEC_EXT.contains(&ext.as_str()) {
            continue;
        }
        let rel = p
            .strip_prefix(skill_dir)
            .map(norm)
            .unwrap_or_else(|_| norm(&p));
        let executable = mode_of(&p).is_some_and(|m| m & 0o111 != 0);
        scripts.push((rel, executable, read_lossy(&p)));
    }

    evaluate(skill_raw, &scripts)
}

#[cfg(unix)]
fn mode_of(p: &Path) -> Option<u32> {
    use std::os::unix::fs::PermissionsExt;
    std::fs::metadata(p).ok().map(|m| m.permissions().mode())
}

#[cfg(not(unix))]
fn mode_of(_p: &Path) -> Option<u32> {
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn self_exclusion_survives_canonicalize_failure() {
        // canonicalize 对不存在的路径返回 Err。旧代码 `if let (Ok, Ok)` 会静默落到
        // 全扫描（self_excluded 缺失）——test_self_excluded 在差分 harness 下守的
        // 回归（曾经扫到自己）。回退：skill_dir 与 self_root 字面相等也排除。
        let missing = Path::new("/definitely/not/a/real/self-exclusion-test-dir");
        let v = security_scan(missing, "", Some(missing));
        assert_eq!(v["self_excluded"], serde_json::json!(true));
        assert_eq!(v["max_severity"], serde_json::json!("none"));
    }

    #[test]
    fn self_exclusion_fallback_requires_equal_paths() {
        // 回退只在路径字面相等时排除；不相等照常扫（self_excluded 不出现）。
        let a = Path::new("/definitely/not/a/real/self-exclusion-test-a");
        let b = Path::new("/definitely/not/a/real/self-exclusion-test-b");
        let v = security_scan(a, "", Some(b));
        assert_ne!(v["self_excluded"], serde_json::json!(true));
        assert_eq!(v["max_severity"], serde_json::json!("none"));
    }
}
