//! `agent-vitals-runtime` 的可执行边界守卫（arch §3.2）。
//!
//! runtime 是**非宿主本机机器**：允许 I/O（state 存储、文件发现）、允许依赖
//! `agent-vitals-hosts` / `agent-vitals-domain`（正向）。禁的是：
//! - 反依赖二进制 / wasm（`agent-vitals` / `agent-vitals-wasm`）——方向是
//!   `apps → runtime`，不是反过来；
//! - 重新实现规则计算（那是 domain 的唯一真相源）——这条靠 code review + 家族
//!   分类测试，不在这里机械化；
//! - `chrono`/`time`（CLAUDE.md 纪律：日期用手写 civil 数学）。

use std::fs;
use std::path::Path;

fn manifest_dir() -> &'static Path {
    Path::new(env!("CARGO_MANIFEST_DIR"))
}

fn dependency_keys(manifest: &str) -> Vec<String> {
    let mut keys = Vec::new();
    let mut in_deps = false;
    for raw in manifest.lines() {
        let line = raw.split('#').next().unwrap_or("").trim();
        if line.is_empty() {
            continue;
        }
        if line.starts_with('[') {
            in_deps = line == "[dependencies]";
            if let Some(rest) = line.strip_prefix("[dependencies.") {
                if let Some(name) = rest.strip_suffix(']') {
                    keys.push(name.trim().to_string());
                }
            }
            continue;
        }
        if in_deps {
            let key = line.split(['=', '.']).next().unwrap_or("").trim();
            if !key.is_empty() {
                keys.push(key.to_string());
            }
        }
    }
    keys
}

#[test]
fn runtime_dependency_direction_is_one_way() {
    let manifest = fs::read_to_string(manifest_dir().join("Cargo.toml")).expect("read Cargo.toml");
    let keys = dependency_keys(&manifest);
    for forbidden in ["agent-vitals", "agent-vitals-wasm", "tauri", "chrono", "time"] {
        assert!(
            !keys.iter().any(|k| k == forbidden),
            "agent-vitals-runtime/Cargo.toml [dependencies] must not reference `{forbidden}` — \
             方向是 apps/desktop → runtime → hosts → domain，不是反过来；日期用手写 civil 数学"
        );
    }
}

/// D7：`HomeResolver` 单点 —— 没有别的 crate 再造一份「选哪个数据根」。
#[test]
fn home_resolver_is_the_single_source() {
    // 纯函数在，签名稳定。
    let get = |_: &str| None::<String>;
    let h = std::path::PathBuf::from("/x");
    assert_eq!(
        agent_vitals_runtime::home::data_home_from(&get, h.clone()),
        h.join(".agent-vitals")
    );
    let _ = agent_vitals_runtime::home::dsh_home; // fn item 解析
}
