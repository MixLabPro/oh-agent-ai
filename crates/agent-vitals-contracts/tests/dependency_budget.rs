//! v0.8 Phase C Step 4a：`agent-vitals-contracts` 是宿主无关的**词表层**——
//! adapters / runtime / domain 都依赖它，它自己**只**依赖 `serde_json`。
//! 这条守卫钉住它不长出 `vitals-core` / `regex` / 任何 domain 或 host 依赖，
//! 也不碰 I/O。破了这条，「契约能被单独依赖而不拉进 domain 逻辑」的整个
//! 拆分理由就没了。做法与 `crates/vitals-core/tests/dependency_boundary.rs`
//! 同源：清单/源码文本层面的静态断言，不引 `cargo metadata`。

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
fn contracts_depends_on_serde_json_and_nothing_else() {
    let manifest = fs::read_to_string(manifest_dir().join("Cargo.toml")).expect("read Cargo.toml");
    let mut keys = dependency_keys(&manifest);
    keys.sort();
    assert_eq!(
        keys,
        vec!["serde_json"],
        "agent-vitals-contracts must stay minimal: serde_json only, no vitals-core / regex / \
         domain / host adapter — the whole point of the split is that adapters and the runtime \
         can depend on the vocabulary without pulling in the domain computation."
    );
}

const FORBIDDEN_IO_PATTERNS: &[&str] = &[
    "std::fs",
    "std::process",
    "std::env::",
    "SystemTime::now",
    "Instant::now",
    "File::open",
    "File::create",
];

fn strip_test_modules(content: &str) -> String {
    let mut out = String::with_capacity(content.len());
    let mut lines = content.lines().peekable();
    while let Some(line) = lines.next() {
        let trimmed = line.trim_start();
        if trimmed.starts_with("#[cfg(test)]") {
            if matches!(lines.peek(), Some(n) if n.trim_start().starts_with("mod ") && n.contains('{'))
            {
                let n = lines.next().unwrap();
                let mut depth =
                    n.matches('{').count() as i32 - n.matches('}').count() as i32;
                for inner in lines.by_ref() {
                    depth += inner.matches('{').count() as i32;
                    depth -= inner.matches('}').count() as i32;
                    if depth <= 0 {
                        break;
                    }
                }
            }
            continue;
        }
        out.push_str(line.split("//").next().unwrap_or(""));
        out.push('\n');
    }
    out
}

#[test]
fn production_source_does_not_touch_files_env_or_clock() {
    fn walk(dir: &Path, visit: &mut impl FnMut(&Path, String)) {
        let mut entries: Vec<_> = fs::read_dir(dir).expect("read_dir").flatten().map(|e| e.path()).collect();
        entries.sort();
        for path in entries {
            if path.is_dir() {
                walk(&path, visit);
            } else if path.extension().and_then(|e| e.to_str()) == Some("rs") {
                let content = fs::read_to_string(&path).expect("read src file");
                visit(&path, content);
            }
        }
    }
    walk(&manifest_dir().join("src"), &mut |path, content| {
        let prod = strip_test_modules(&content);
        for pat in FORBIDDEN_IO_PATTERNS {
            assert!(
                !prod.contains(pat),
                "contracts production code in {} contains `{pat}` — the vocabulary layer receives \
                 typed inputs, it never reads files/env/clock itself",
                path.strip_prefix(manifest_dir()).unwrap_or(path).display()
            );
        }
    });
}

/// 词表层的两条路径（`crate::contracts::evidence` 与 lib.rs re-export 的
/// `crate::evidence`）解析到同一处——facade 传递不出岔子的最小自证。
#[test]
fn nested_and_flat_contract_paths_resolve_to_the_same_items() {
    assert_eq!(
        agent_vitals_contracts::contracts::usage_fact::USAGE_FACT_FIELDS,
        agent_vitals_contracts::usage_fact::USAGE_FACT_FIELDS
    );
}
