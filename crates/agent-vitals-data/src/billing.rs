//! Stage B（spec §4）：`BillingContext`/`UserProfile`——用户声明的固定订阅
//! 套餐、按量账户、预算、模型/价格来源。产出的每一笔金额都要落进
//! `agent_vitals_domain::data_contract::BillingBasis` 的既有五档，不允许在
//! 这里发明第二套口径词汇（那正是 spec §4 表要防止的"互相冒充"）。
//!
//! Stage 0 骨架阶段未实现。
