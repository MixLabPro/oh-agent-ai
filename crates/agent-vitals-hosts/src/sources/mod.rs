//! 跨宿主 I/O 面——不属于任何单一 `hosts/<h>/sources/`，因为它本身就是「按
//! host 参数分派到对应宿主」的那一层（v0.10.0 新建，见 `canonical_input`）。
//! 放在 `src/sources/`（与各 `hosts/<h>/sources/` 并列）而不是 crate 根，是为了
//! 落进 `tests/dependency_budget.rs::io_tokens_only_appear_under_sources` 的
//! 路径匹配（"路径含 `/sources`"）——它确实是 I/O 层，理应被同一条守卫钉住。

pub mod canonical_input;
// v1.0.0-beta.1 自动归因 A12/§10.2 层②：跨宿主的端点/配置证据读取器。
pub mod endpoint_evidence;

// 猴子测试（用户拍板）——只活在 test 编译里，不进任何产物。
#[cfg(test)]
mod monkey_tests;
