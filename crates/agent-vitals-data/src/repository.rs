//! Stage 0.3 起：typed query/mutation 边界——`daily_summary`/`monthly_summary`/
//! `coverage_status`（spec §3.1 代码示例）的唯一实现入口。上层
//! （`apps/cli`、`apps/desktop`）只应该认识这一个模块暴露的公开类型，不直接
//! 碰 `projection`/`store`/`evidence` 的内部结构——这条边界就是"repository
//! 是唯一取数接口"的落地方式（spec §5.1）。
//!
//! Stage 0.2 骨架阶段未实现。
