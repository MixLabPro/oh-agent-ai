//! v0.8 目标架构（`docs/AGENT_VITALS_V0_8_ARCHITECTURE_SPEC.md` §3.3 依赖预算 /
//! §14.2 / §15 DoD）的**可执行守卫**。Phase C Step 4 把 `agent-vitals-core`
//! 拆成 `agent-vitals-contracts`（宿主无关词表）+ `agent-vitals-domain`
//! （本 crate，纯计算）+ `agent-vitals-core`（薄 re-export facade）。本文件钉
//! 住 **`agent-vitals-domain` 必须保持纯计算**：不许 I/O / 原生 / 运行时依赖
//! 悄悄进来，方向只能 `adapters → domain`（domain 不许回依赖 facade 或 adapter）。
//! 迁移过程中任何一步破坏这条，`cargo test` 立刻红。
//!
//! 实测基线：`agent-vitals-domain/src` 的非 test 代码对
//! `std::fs`/`std::process`/`std::env`/`SystemTime::now` 命中数是 0，
//! `[dependencies]` 只有 `agent-vitals-contracts`/`regex`/`serde_json`/
//! `vitals-core`。守卫是防回归，不是修 bug。
//!
//! 做法与 `crates/vitals-core/tests/dependency_boundary.rs` 同源：源码/清单
//! 文本层面的静态断言，不引 `cargo metadata`。测试范围仅本 crate 自己
//! （`CARGO_MANIFEST_DIR`），不跨仓。`agent-vitals-contracts` 的纯净度由
//! `crates/agent-vitals-contracts/tests/dependency_budget.rs` 各自守。

use std::fs;
use std::path::{Path, PathBuf};

fn manifest_dir() -> &'static Path {
    Path::new(env!("CARGO_MANIFEST_DIR"))
}

// ─────────────────────── §3.3 / §14.2：依赖预算 ───────────────────────

/// §3.3「`agent-vitals-domain` 可依赖 vitals-core、serde、纯算法库，不能依赖
/// SQLite/watcher」+ §14.2「domain 的 Cargo 依赖禁止 runtime/Tauri/SQLite/zstd」。
/// 用**否定清单**而不是允许清单：新增一个合法的纯算法库（`itertools` 之类）不
/// 该让守卫变红，但下面这些类别一旦作为**直接依赖**出现，就是边界破了。
const FORBIDDEN_DEP_KEYS: &[&str] = &[
    // SQLite / 关系型存储 —— 属 runtime
    "rusqlite",
    "libsqlite3-sys",
    "sqlx",
    "diesel",
    "sled",
    // 压缩 / 编解码 —— I/O 相邻，属 runtime source
    "ruzstd",
    "zstd",
    "zstd-sys",
    "flate2",
    "brotli",
    "xz2",
    // 异步运行时 —— domain 是纯函数，不持有 executor
    "tokio",
    "async-std",
    "smol",
    // 文件监听 —— 属 runtime watcher
    "notify",
    "notify-debouncer-mini",
    "notify-debouncer-full",
    // 网络 —— domain 不出网（Catalog 远端拉取是 runtime 的事）
    "reqwest",
    "hyper",
    "ureq",
    "isahc",
    "curl",
    // 桌面外壳 —— 属 apps/desktop
    "tauri",
    "wry",
    "tao",
    // wasm 胶水 —— 属 agent-vitals-wasm，不进被它依赖的 core
    "wasm-bindgen",
    "js-sys",
    "web-sys",
    // CLI / 目录遍历 / home 解析 —— 属 apps 与 runtime
    "clap",
    "walkdir",
    "dirs",
    "directories",
    "home",
    "etcetera",
    // 时间库 —— CLAUDE.md 纪律：core 的日期用手写 civil 数学，chrono 不是依赖
    "chrono",
    "time",
    // §3.2 禁止方向：`[dependencies]` 不许反依赖 facade / 二进制 / wasm / adapter
    // （`adapters → domain` 是唯一允许的**生产**方向；`agent-vitals-core` 是
    //  domain 的**下游** facade，domain 回依赖它即成环）。`domain → adapters`
    //  只以 `[dev-dependencies]` 存在——`domain/usage.rs::tests` 经它调
    //  `canonical_tokens`，只换 `serde_json::Value`、不跨 crate 传 domain 类型，
    //  成环也安全。跨边界传 `CanonicalSession` 的 fixture 测试正因成环限制
    //  才把 `dsh_evidence`/`audit`/`compaction`/`waste` 留在 `domain/dsh/`。
    "agent-vitals",
    "agent-vitals-core",
    "agent-vitals-adapters",
    "agent-vitals-wasm",
];

/// 从 `[dependencies]` 段逐行按 TOML key 精确切出依赖名——与
/// `dependency_boundary.rs::deps_section_contains` 同一套解析（按 `=`/`.` 切
/// key、trim、精确比较），不做整段子串包含（否则 `agent-vitals-core` 会把
/// `agent-vitals` 也算命中）。`[dependencies.foo]` 的 table 形式也认。
fn dependency_keys(manifest: &str) -> Vec<String> {
    let mut keys = Vec::new();
    let mut in_deps = false;
    for raw in manifest.lines() {
        let line = raw.split('#').next().unwrap_or("").trim();
        if line.is_empty() {
            continue;
        }
        if line.starts_with('[') {
            // `[dependencies]` 或 `[dependencies.<name>]`；其余 section 关掉。
            if line == "[dependencies]" {
                in_deps = true;
            } else if let Some(rest) = line.strip_prefix("[dependencies.") {
                if let Some(name) = rest.strip_suffix(']') {
                    keys.push(name.trim().to_string());
                }
                in_deps = false;
            } else {
                in_deps = false;
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
fn cargo_toml_has_no_io_or_runtime_dependency() {
    let manifest = fs::read_to_string(manifest_dir().join("Cargo.toml")).expect("read Cargo.toml");
    let keys = dependency_keys(&manifest);
    for key in &keys {
        assert!(
            !FORBIDDEN_DEP_KEYS.contains(&key.as_str()),
            "v0.8 §3.3/§14.2 violated: agent-vitals-domain/Cargo.toml [dependencies] must not \
             pull in `{key}` — I/O / native / runtime deps belong in agent-vitals-runtime or \
             an app crate, never in the pure computation domain crate."
        );
    }
    // 正向 sanity：确实走 contracts + vitals-core 这条允许路径——否则上面的
    // 否定断言可能是在测一个假问题（比如 domain 干脆没接 contracts 了）。
    assert!(keys.iter().any(|k| k == "agent-vitals-contracts"), "domain 必须依赖 agent-vitals-contracts");
    assert!(keys.iter().any(|k| k == "vitals-core"), "domain 必须依赖 vitals-core（M2 桥）");
}

/// 证明上面那条不是摆设：喂一段只存在于本测试里的合成清单，断言解析器**确实**
/// 切出了每个依赖名（含 table 形式）。解析器一旦坏掉、切不出 key，
/// `cargo_toml_has_no_io_or_runtime_dependency` 的"全绿"就不可信。
#[test]
fn dependency_key_parser_actually_extracts_names() {
    let synthetic = r#"
[package]
name = "x"

[dependencies]
regex = "1"
serde_json = { version = "1", features = ["preserve_order"] }
vitals-core = { path = "../vitals-core" }
rusqlite = { version = "0.31", features = ["bundled"] }  # 违规样例

[dependencies.tokio]
version = "1"

[dev-dependencies]
proptest = "1"
"#;
    let keys = dependency_keys(synthetic);
    assert_eq!(
        keys,
        vec!["regex", "serde_json", "vitals-core", "rusqlite", "tokio"],
        "解析器必须切出全部 [dependencies] key（含 table 形式），且不越界抓 [dev-dependencies]"
    );
}

// ─────────────────── §15 DoD：domain 不碰文件/环境/时钟 ───────────────────

/// §15「domain 不读取文件、环境变量、数据库或系统时间」+ §14.3「adapters 禁止
/// `std::fs`、`std::process`、环境变量和 state 写入」。扫描非 test 源码——
/// `#[cfg(test)] mod ...` 块整段跳过（那里为了自包含算北京日会用
/// `SystemTime::now`，是合法的，`budget.rs` 现状即如此）。
const FORBIDDEN_IO_PATTERNS: &[&str] = &[
    "std::fs",
    "std::process",
    "std::env::",
    "SystemTime::now",
    "Instant::now",
    "File::open",
    "File::create",
];

fn each_src_file(mut visit: impl FnMut(&Path, &str)) {
    fn walk(dir: &Path, visit: &mut impl FnMut(&Path, &str)) {
        let mut entries: Vec<PathBuf> = fs::read_dir(dir)
            .unwrap_or_else(|e| panic!("read_dir {}: {e}", dir.display()))
            .flatten()
            .map(|e| e.path())
            .collect();
        entries.sort();
        for path in entries {
            if path.is_dir() {
                walk(&path, visit);
            } else if path.extension().and_then(|e| e.to_str()) == Some("rs") {
                let content = fs::read_to_string(&path).expect("read src file");
                visit(&path, &content);
            }
        }
    }
    walk(&manifest_dir().join("src"), &mut visit);
}

/// 去掉 `#[cfg(test)]` 紧跟的 `mod <name> { ... }` 整块（按花括号深度配平），
/// 再去掉行注释——剩下的就是"生产代码"。逐 token 而非逐 AST 是有意的简化
/// （同 `dependency_boundary.rs` 的取舍）：真正的语义审查在 code review，这里
/// 只挡"生产代码里直接写了 std::fs"这种一眼假的回归。
fn strip_test_modules_and_comments(content: &str) -> String {
    let mut out = String::with_capacity(content.len());
    let mut lines = content.lines().peekable();
    while let Some(line) = lines.next() {
        let trimmed = line.trim_start();
        if trimmed.starts_with("#[cfg(test)]") {
            // 下一行若是 `mod xxx {`（或本行内联到 `{`），吃掉整个 body。
            let opens_here = trimmed.contains('{');
            let mut depth: i32 = if opens_here {
                trimmed.matches('{').count() as i32 - trimmed.matches('}').count() as i32
            } else {
                match lines.peek() {
                    Some(next) if next.trim_start().starts_with("mod ") && next.contains('{') => {
                        let n = lines.next().unwrap();
                        n.matches('{').count() as i32 - n.matches('}').count() as i32
                    }
                    _ => 0, // `#[cfg(test)]` 修饰的是单个 fn/use，不是 mod —— 不整段跳，
                            // 让它下面的行照常被扫（test 辅助函数读 fs 也是这个 crate 的味道问题）
                }
            };
            if depth > 0 {
                for inner in lines.by_ref() {
                    depth += inner.matches('{').count() as i32;
                    depth -= inner.matches('}').count() as i32;
                    if depth <= 0 {
                        break;
                    }
                }
                continue;
            }
            continue;
        }
        // 去行注释（`//` 之后到行尾）——不处理块注释 `/* */`，本 crate 不用它。
        let code = line.split("//").next().unwrap_or("");
        out.push_str(code);
        out.push('\n');
    }
    out
}

#[test]
fn production_source_does_not_touch_files_env_or_clock() {
    each_src_file(|path, content| {
        let prod = strip_test_modules_and_comments(content);
        for pat in FORBIDDEN_IO_PATTERNS {
            assert!(
                !prod.contains(pat),
                "v0.8 §15 DoD violated in {}: production code contains `{pat}` — the pure core \
                 (future agent-vitals-domain / -adapters) must receive files/env/clock as typed \
                 inputs, never read them itself. If this is genuinely test-only code, move it \
                 into a `#[cfg(test)] mod tests {{ ... }}` block.",
                path.strip_prefix(manifest_dir()).unwrap_or(path).display()
            );
        }
    });
}

/// 同样证明扫描器不是空跑：合成一段带 `#[cfg(test)] mod tests` 的片段，断言
/// test 块里的 `std::fs` 被剥掉、生产行里的被保留。
#[test]
fn io_scanner_strips_test_modules_but_keeps_production_lines() {
    let synthetic = "\
pub fn pure() -> i32 { 1 + 1 }

#[cfg(test)]
mod tests {
    use std::fs;
    #[test]
    fn t() { let _ = fs::read_to_string(\"/etc/hosts\"); assert!(std::env::var(\"X\").is_err()); }
}
";
    let stripped = strip_test_modules_and_comments(synthetic);
    assert!(stripped.contains("pub fn pure"), "生产行必须保留");
    assert!(!stripped.contains("std::fs"), "test 块里的 std::fs 必须被剥掉");
    assert!(!stripped.contains("std::env"), "test 块里的 std::env 必须被剥掉");

    let leaky = "use std::fs;\npub fn bad() { let _ = std::fs::read(\"x\"); }\n";
    assert!(
        strip_test_modules_and_comments(leaky).contains("std::fs"),
        "生产代码里的 std::fs 不能被误剥"
    );
}

// ─────────────────────── Phase C：crate 边界 ───────────────────────

#[test]
fn source_root_is_an_explicit_facade_not_a_flat_module_dump() {
    let src = manifest_dir().join("src");
    let mut entries: Vec<String> = fs::read_dir(&src)
        .expect("read src")
        .flatten()
        .map(|entry| entry.file_name().to_string_lossy().into_owned())
        // 忽略 `.`-前缀的非模块项（`.DS_Store` 之类 OS/工具产物，`.gitignore`
        // 已排除）——本测试钉的是**模块**布局，不是目录里有没有 Finder 落过灰。
        .filter(|name| !name.starts_with('.'))
        .collect();
    entries.sort();
    // Phase C Step 4：`contracts/` 迁进 `agent-vitals-contracts` crate；
    // `agent-vitals-core/src/adapters/` 早已删除（Step 3）。domain crate 的
    // src 只剩 `domain/`（计算）+ `compatibility/`（vitals-core 桥）+ lib.rs。
    assert_eq!(
        entries,
        vec!["compatibility", "domain", "lib.rs"],
        "agent-vitals-domain/src may only expose domain/ + compatibility/ + lib.rs"
    );
}

/// Phase C Step 4：`contracts/` 与任何 host `adapters/` 目录都不在本 crate。
#[test]
fn domain_crate_holds_neither_contracts_nor_host_adapters() {
    assert!(
        !manifest_dir().join("src/contracts").exists(),
        "Phase C Step 4a: `contracts/` moved to the agent-vitals-contracts crate"
    );
    assert!(
        !manifest_dir().join("src/adapters").exists(),
        "Phase C Step 3: host adapters moved to agent-vitals-adapters / domain/dsh/"
    );
}

/// `domain/dsh/` 是**唯一**登记的 layer-2 DSH-wire 债（`evidence`/`audit`/
/// `compaction`/`waste` 解析 DSH 原始事件、暂住 domain 因为 domain 测试的
/// `build_dsh_evidence` fixture 依赖，见 `AGENT_VITALS_V0_8_PHASE_C_RESEARCH.md`
/// §6ter）。它可以缩到空、不许长出第二个同类模块。
#[test]
fn domain_dsh_is_the_only_registered_layer2_wire_module() {
    let dsh = manifest_dir().join("src/domain/dsh");
    assert!(dsh.join("mod.rs").is_file(), "domain/dsh/mod.rs 必须显式登记这条债");
    let mut files: Vec<String> = fs::read_dir(&dsh)
        .expect("read domain/dsh")
        .flatten()
        .map(|e| e.file_name().to_string_lossy().into_owned())
        .filter(|n| !n.starts_with('.'))
        .collect();
    files.sort();
    assert_eq!(
        files,
        vec!["audit.rs", "compaction.rs", "evidence.rs", "mod.rs", "waste.rs"],
        "domain/dsh/ 只该有这四个 wire 模块 + mod.rs——新增即 layer-2 债扩张"
    );
}

#[test]
fn nested_paths_and_legacy_facade_resolve_to_the_same_items() {
    assert_eq!(
        agent_vitals_domain::contracts::usage_fact::USAGE_FACT_FIELDS,
        agent_vitals_domain::usage_fact::USAGE_FACT_FIELDS
    );
    assert_eq!(
        agent_vitals_domain::domain::usage::AMBIGUOUS_PROVIDER,
        agent_vitals_domain::usage::AMBIGUOUS_PROVIDER
    );
    assert_eq!(
        agent_vitals_domain::domain::dsh::audit::match_behavior(&[], None),
        agent_vitals_domain::audit::match_behavior(&[], None),
    );
}

/// `domain/` 的生产代码（`domain/dsh/` 那条登记债除外）不许引用 host 适配
/// （`agent-vitals-adapters` / `crate::adapters` / `crate::{*_evidence, codex_usage}`）
/// ——方向是 `adapters → domain`。`#[cfg(test)]` 里经 `[dev-dependencies]` 调
/// `canonical_tokens`（只换 `Value`）/ `crate::dsh_evidence`（现 `domain/dsh/`）
/// 造 fixture 是允许的。
#[test]
fn domain_production_code_outside_dsh_has_no_host_adapter_dependency() {
    let dsh_dir = manifest_dir().join("src/domain/dsh");
    each_src_file(|path, content| {
        if !path.starts_with(manifest_dir().join("src/domain")) || path.starts_with(&dsh_dir) {
            return;
        }
        let prod = strip_test_modules_and_comments(content);
        for needle in [
            "agent_vitals_adapters",
            "crate::adapters",
            "crate::claude_code_evidence",
            "crate::codex_evidence",
            "crate::codex_usage",
            "crate::dsh_evidence",
            "crate::workbuddy_evidence",
        ] {
            assert!(
                !prod.contains(needle),
                "v0.8 Phase C: production code in {} references `{needle}` — host wire \
                 interpretation belongs in agent-vitals-adapters or the registered \
                 `domain/dsh/` debt module, not scattered through domain",
                path.strip_prefix(manifest_dir()).unwrap_or(path).display()
            );
        }
    });
}
