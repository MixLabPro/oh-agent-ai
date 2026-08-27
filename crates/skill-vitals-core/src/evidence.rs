//! P1 of the runtime evidence model (`docs/RUNTIME_EVIDENCE_CONTRACT.md` §17).
//!
//! **零行为变更**：这个模块目前没有任何调用方。`behavior.rs` / `usage.rs` /
//! `trajectory.rs` 等现有规则引擎完全不受影响，继续按 DSH-only 的老路径跑，
//! goldens 不会变。这里先把契约里定义的类型落地，让 P2（`DshSource` 适配器 +
//! 反向投影）有类型可用；P3 才开始把规则一条条迁过来读 `Signal` 而不是直接
//! 读 DSH 的 JSON 事件形状。
//!
//! 每个小节的类型对应契约文档的同名小节，删掉这个模块 = 回到 P0。

use std::collections::BTreeMap;

// ────────────────────────── §2 Three axes / Provenance ──────────────────────────

/// 一个值 + 它的来源标注。`value` 缺席（比如 `Observed<Option<T>>` 里的
/// `None`）本身是有意义的事实——"这里发生过 N 次调用，但我们对它们的 token
/// 一无所知"是一条陈述，不是"没有数据"。
pub struct Observed<T> {
    pub value: T,
    pub prov: Provenance,
}

/// 一个数字是宿主measured出来的、适配器derive出来的、还是像 `est_tokens`
/// 那样纯estimate的——`src/host.rs` 已经用 `Option` 把"能不能读到"变成编译期
/// 的事，这里把"读到的东西有多可信"也变成编译期的事，理由相同。
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Provenance {
    /// 宿主自己记录的数字。
    Measured,
    /// 适配器从别的信号推出来的（例如 Claude Code 的 turn 边界）。
    Derived { from: &'static str },
    /// `est_tokens` 这类纯估算。
    Estimated { estimator: &'static str },
    /// 存在，但降级过（截断 / 哈希 / 打码）。
    Lossy { kind: LossKind },
}

/// `Lossy` 具体降级成了什么形状——展示层需要知道是"看不全"还是"看不清"。
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum LossKind {
    Truncated { hint: Option<usize> },
    Hashed,
    Redacted,
}

// ────────────────────────── §3 Signals ──────────────────────────

/// 一个具名、类型化的证据通道，独立于其它任何通道存在或缺席——这条独立性是
/// 整个模型能撑过四个宿主的原因（§4 的 host coverage matrix 逐格都不同）。
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Debug)]
pub enum Signal {
    ToolCalls,
    ToolResults,
    TurnBoundaries,
    StepBoundaries,
    /// 逐请求时间序列。
    Usage,
    /// 只有总量，没有逐请求分辨率。
    UsageAggregate,
    ContextWindow,
    ApprovalDecisions,
    ApprovalPolicy,
    SandboxModes,
    SandboxPolicy,
    NetworkAccess,
    Compaction,
    SubagentSpawns,
    SkillInvocations,
    Hooks,
    FileMutations,
    /// 真人发起的 turn（与 agent 自己续写的 turn 相对）。
    UserPrompts,
    /// §3.2：永远是 `Estimated`，从不是 `Measured`——没有宿主会把"用户不满意
    /// 上一步的输出"这件事直接记下来，只能从后续行为里猜。
    UserCorrections,
}

/// `Signal` 的位集合——19 个变体放一个 `u32` 里正好，比 `HashSet<Signal>`
/// 便宜（`Copy`，不分配），适配器每处理一个事件就可能查询/更新一次。
#[derive(Clone, Copy, PartialEq, Eq, Default, Debug)]
pub struct SignalSet(u32);

impl SignalSet {
    pub const EMPTY: Self = Self(0);

    pub fn insert(&mut self, signal: Signal) {
        self.0 |= 1 << (signal as u32);
    }

    pub fn contains(&self, signal: Signal) -> bool {
        self.0 & (1 << (signal as u32)) != 0
    }

    pub fn from_signals(signals: impl IntoIterator<Item = Signal>) -> Self {
        let mut set = Self::EMPTY;
        for s in signals {
            set.insert(s);
        }
        set
    }
}

// ────────────────────────── §4 Coverage ──────────────────────────

/// 一个信号在一份会话里的覆盖情况：不是"available/degraded/unavailable"三选
/// 一，而是四个互斥计数——缺一类就拉低分母，而不是从报告里消失。
#[derive(Clone, Copy, PartialEq, Eq, Default, Debug)]
pub struct CoverageCounts {
    pub measured: u64,
    pub derived: u64,
    pub lossy: u64,
    /// 已知发生过、但除此之外一无所知——这是分母里"承重"的一项：适配器不能
    /// 靠"读不到就不算"来偷偷刷高自己的覆盖率。
    pub unmetered: u64,
}

impl CoverageCounts {
    pub fn total(&self) -> u64 {
        self.measured + self.derived + self.lossy + self.unmetered
    }

    /// `(measured + derived) / total`；`total == 0` 时是 `None`，不是 `0.0`——
    /// "这个信号在这份日志里从没出现过"与"出现过但覆盖率是零"是两回事。
    pub fn ratio(&self) -> Option<f64> {
        let total = self.total();
        if total == 0 {
            None
        } else {
            Some((self.measured + self.derived) as f64 / total as f64)
        }
    }
}

/// 一份会话里每个 `Signal` 各自的覆盖计数。§4：覆盖率是**逐会话算出来的**，
/// 不是按宿主 id 查表——Codex 的 `ThreadHistoryMode` 就是反例：同一个宿主 id
/// 下有两种互不兼容的事件词表，只能靠探测内容判断，不能靠"这是 Codex 所以
/// 覆盖率是 X"这种静态查表。
#[derive(Clone, Default, Debug)]
pub struct Coverage(BTreeMap<Signal, CoverageCounts>);

impl Coverage {
    pub fn new() -> Self {
        Self(BTreeMap::new())
    }

    pub fn set(&mut self, signal: Signal, counts: CoverageCounts) {
        self.0.insert(signal, counts);
    }

    /// 缺席的信号视为全零覆盖，而不是 panic——调用方不需要先判断"这个信号
    /// 有没有被记录过"。
    pub fn get(&self, signal: Signal) -> CoverageCounts {
        self.0.get(&signal).copied().unwrap_or_default()
    }

    /// 跨所有信号汇总后的覆盖率。
    pub fn overall_ratio(&self) -> Option<f64> {
        let total: CoverageCounts = self.0.values().fold(CoverageCounts::default(), |acc, c| {
            CoverageCounts {
                measured: acc.measured + c.measured,
                derived: acc.derived + c.derived,
                lossy: acc.lossy + c.lossy,
                unmetered: acc.unmetered + c.unmetered,
            }
        });
        total.ratio()
    }
}

// ────────────────────────── §5 Provenance under aggregation ──────────────────────────

/// 一批不同 provenance 的行相加之后，"这个总数算测量还是估算"本身需要算，
/// 不能直接沿用某一行的标注。`Mixed` 是一等公民——不能因为凑不出单一答案
/// 就悄悄吞掉这条信息。
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum AggregateProvenance {
    Measured,
    Derived,
    Estimated,
    Lossy,
    Mixed,
    Unknown,
}

/// 一个窗口内**实际出现过**哪几类 provenance——`AggregateProvenance::for_window`
/// 用它来判断能不能把 set 级别的分类收窄成纯值。
#[derive(Clone, Copy, PartialEq, Eq, Default, Debug)]
pub struct ProvenanceSet {
    pub measured: bool,
    pub derived: bool,
    pub estimated: bool,
    pub lossy: bool,
}

impl ProvenanceSet {
    fn count(&self) -> u32 {
        self.measured as u32 + self.derived as u32 + self.estimated as u32 + self.lossy as u32
    }

    fn only(&self) -> Option<AggregateProvenance> {
        if self.measured {
            Some(AggregateProvenance::Measured)
        } else if self.derived {
            Some(AggregateProvenance::Derived)
        } else if self.estimated {
            Some(AggregateProvenance::Estimated)
        } else if self.lossy {
            Some(AggregateProvenance::Lossy)
        } else {
            None
        }
    }
}

impl AggregateProvenance {
    /// 把 set 级别的分类收窄成某个具体窗口实际含有的分类。
    ///
    /// 窗口里一种 provenance 都没出现（`present` 全 false）时**沿用外层
    /// `set`**，不是 `Unknown`——空窗口不等于"不知道"，可能只是这个窗口
    /// 本来就没有任何行（比如某个小时完全没有请求），外层的分类依然成立。
    /// 只有一种出现时收窄成那个纯值；出现不止一种时是 `Mixed`。
    pub fn for_window(set: Self, present: &ProvenanceSet) -> Self {
        match present.count() {
            0 => set,
            1 => present.only().expect("count()==1 时 only() 必有值"),
            _ => AggregateProvenance::Mixed,
        }
    }
}

// ────────────────────────── §6 Linearization ──────────────────────────

/// Claude Code 的 transcript 是一棵树（`uuid`/`parentUuid`）、Codex 记
/// `thread_rolled_back`、DSH 的分叉带 `seedLength` 前缀——三者的日志里都留着
/// 用户放弃掉的路径，选哪条路径去计数会改变报告里的每一个数字。
#[derive(Clone, Copy, PartialEq, Eq, Debug, Default)]
pub enum Linearization {
    /// 默认：用户最终走到的那条路径。
    #[default]
    LeafPath,
    AllRecorded,
}

// ────────────────────────── §8 Cost ──────────────────────────

/// ISO 4217 三字母货币码（如 `*b"CNY"`）。不用 `String`——三字节定长，
/// `Copy`，比较不用分配。
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct CurrencyCode(pub [u8; 3]);

/// 货币精确金额：整数分值 + 精度位数（例如 `scale = 2` 时 `minor_units = 1234`
/// 表示 12.34）。不用 `f64`——金额相加会有舍入误差；P1 还没有消费者，先用
/// 这个最小可行的定点表示，等 cost 模块真正迁过来（P3 之后）时再评估要不要
/// 换一个成熟的定点数 crate。
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct DecimalAmount {
    pub minor_units: i64,
    pub scale: u8,
}

/// 订阅配额消耗的一个窗口——一个订阅套餐可能同时挂多个互不重叠的窗口
/// （例如一个 7 天滚动窗口叠一个更短的突发窗口），§14.10 cc-switch 的
/// `tiers[]` 就是因为拍扁成一个数字而丢了"到底哪个窗口先撞线"，所以这里
/// 用 `Vec<QuotaWindow>` 而不是单个百分比。
#[derive(Clone, Debug)]
pub struct QuotaWindow {
    /// 套餐档位的原始字符串（如某宿主上会读到 `"plus"`）——不同宿主的叫法
    /// 互不通用，不结构化成枚举。
    pub plan: String,
    pub used_percent: f64,
    pub window_minutes: u32,
    pub resets_at_ms: i64,
}

/// 不同单位的花费**不可比较**——不同币种不相加不排名；WorkBuddy 计的是
/// credits，不是 token，不能先换算成 token 再定价。
///
/// `Quota` 是第三种、既不是 `Money` 也不是 `Credits` 的花费：某些宿主的
/// 订阅账户按请求返回一个"这次用了多少配额"的百分比，相对一个会清零的
/// 滚动窗口，从头到尾没有美元单价，也不是可攒可花的余额（`has_credits`
/// 恒为 false）。把它硬塞进 `Money` 是编造一个不存在的单价；塞进 `Credits`
/// 则混淆了"计量单位是余额"和"计量单位是配额百分比"这两件事——两者都会让
/// `Cost` 的读者误判"这次请求值多少钱"这个问题其实无法回答。
#[derive(Clone, Debug)]
pub enum Cost {
    Money { amount: DecimalAmount, currency: CurrencyCode },
    Credits(f64),
    Quota(Vec<QuotaWindow>),
    Unavailable(Reason),
}

/// 人读的降级原因。目前就是字符串——契约里没有要求结构化到枚举的地步，
/// 结构化的部分是 `SourceAttempt.error` / `RuleOutcome::Unavailable.missing`。
pub type Reason = String;

// ────────────────────────── §9 Identity and join keys ──────────────────────────

/// 一个宿主内部的编号空间——主会话是一个，每个子代理会话各自另开一个。
/// 不同 scope 下的 `ordinal` 互不可比，这也是为什么 `EventId` 强制要求
/// 跨 scope 的 join 必须走 `native` 字段。
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Debug)]
pub struct ScopeId(pub u32);

/// 各宿主自己的原生标识：DSH 用 `seq`，Codex 用 `turn_id`/`call_id`，
/// Claude Code 用 `uuid`，WorkBuddy 用 `toolCallId`/`requestId`。
#[derive(Clone, PartialEq, Eq, Hash, Debug)]
pub enum NativeId {
    Seq(u64),
    Uuid(String),
    CallId(String),
    TurnId(String),
}

#[derive(Clone, PartialEq, Eq, Hash, Debug)]
pub struct EventId {
    pub host_scope: ScopeId,
    /// 适配器内部合成的序号，**只在同一个 scope 内**保证有序——Claude Code
    /// 完全没有原生 `seq`，跨 scope 或跨适配器比较这个字段没有意义。
    pub ordinal: u64,
    pub native: NativeId,
}

// ────────────────────────── §10 Rules declare what they need ──────────────────────────

/// 一条 finding 的可信程度。派生自 `Ord`：`Full > Partial > Inferred`——
/// 声明顺序从低到高，`derive(Ord)` 按声明顺序排，所以 `Inferred` 必须写在
/// 最前面。`min_fidelity` 卡的是"低于这个档位只能是 possible，永远不能是
/// confirmed"，需要能比大小。
#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Debug)]
pub enum Fidelity {
    Inferred,
    Partial,
    Full,
}

pub struct RuleSpec {
    /// "SV601" 这样的规则编号。
    pub code: &'static str,
    /// 缺一个就整条规则报 `Unavailable`，规则不跑。
    pub requires: &'static [Signal],
    /// 缺一个规则仍然跑，只是降级（比如从 confirmed 掉到 possible）。
    pub enhances: &'static [Signal],
    pub min_fidelity: Fidelity,
}

/// 引擎对每条规则、在每个宿主上，必须产出且只能产出这三种之一——这是整份
/// 契约里唯一"不可谈判"的属性。"把宿主翻译成 DSH 事件再跑老引擎"这条路
/// 天生做不到这件事：没有 approval 事件可翻译时，这类适配器只会报告"零条
/// 审批异常"，而报告本身就是错的（该说 unavailable 却说成了 measured-zero）。
pub enum RuleOutcome {
    /// N 条 finding——复用现有 `behavior.rs` 系列已经在用的 JSON 表示，
    /// P1 阶段不新造一个 `Finding` 结构体，避免出现两份不一致的 finding 形状。
    Findings(Vec<serde_json::Value>),
    /// 规则确实跑了，测量到零条。
    MeasuredZero,
    Unavailable { missing: Vec<Signal>, reason: Reason },
}

// ────────────────────────── §11 Adapter result and the attempt trail ──────────────────────────

/// 报告说某个信号 unavailable 时，读者的下一个问题是"到底试过什么"——
/// 自由文本回答不了这个问题，必须是结构化的。
pub struct SourceAttempt {
    /// 例如 `"codex.rollout.jsonl"` / `"workbuddy.audit-log"`。
    pub source_id: &'static str,
    pub kind: SourceKind,
    pub surface: Surface,
    pub available: bool,
    pub error: Option<String>,
    /// 这个来源**实际**覆盖到的时间跨度。不能假设它等于报告请求的窗口——
    /// surface 2/3（钩子 / 遥测）只从配置那一刻开始才有数据（§14.8.6）。
    pub observed_span: Option<TimeSpan>,
}

/// §14.8.3 的四种证据面对应的存储形态。
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum SourceKind {
    LogFile,
    Sqlite,
    BlobStore,
    RuntimeProbe,
    HookStream,
    TelemetryExport,
}

/// 证据来自哪一类观察位置——会话日志本身、旁路遥测、还是钩子。
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Surface {
    SessionLog,
    Telemetry,
    Hook,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct TimeSpan {
    pub start_ms: i64,
    pub end_ms: i64,
}

/// 自由文本的补充说明——与 `attempts` 的结构化数据互补，不是替代。
pub struct AdapterNote {
    pub message: String,
}

/// 一份会话跑完五段式适配器流水线（locate → shape → extract → derive →
/// coverage，§4）之后的产物。**不是 trait**——理由见
/// `ARCHITECTURE.md` §4.2：宿主之间差的是"哪些阶段存在"，trait 会强迫每个
/// 宿主实现一堆空方法，反而把这个差异藏起来。
///
/// §12：这个类型（以及它引用的每一个类型）里不允许出现任何宿主专属字段——
/// 宿主专属数据必须放进一个由宿主 id 索引的不透明 payload，本模块自己不
/// 持有那个 payload（避免"通用层"迟早变成"每个宿主怪癖的并集"）。
pub struct CanonicalSession {
    pub meta: SessionMeta,
    pub signals: SignalSet,
    pub coverage: Coverage,
    pub attempts: Vec<SourceAttempt>,
    pub notes: Vec<AdapterNote>,
}

pub struct SessionMeta {
    pub session_id: String,
    /// 通用的宿主标识符**值**（比如运行时取到的 `"codex"`）——存的是数据，
    /// 不是类型名，所以不违反 §12："不能有宿主专属字段"针对的是字段/类型
    /// 名字本身携带宿主专属含义，不是字段里能装什么字符串。
    pub host_id: &'static str,
    pub workspace_roots: Vec<String>,
    pub model: Option<String>,
    pub span: Option<TimeSpan>,
}

// ────────────────────────── §12 acceptance test ──────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn coverage_counts_ratio_is_none_when_total_is_zero() {
        assert_eq!(CoverageCounts::default().ratio(), None);
    }

    #[test]
    fn coverage_counts_ratio_counts_measured_and_derived_only() {
        let c = CoverageCounts { measured: 3, derived: 1, lossy: 1, unmetered: 5 };
        // (3+1) / (3+1+1+5) = 4/10
        assert_eq!(c.ratio(), Some(0.4));
    }

    #[test]
    fn coverage_overall_ratio_sums_across_signals() {
        let mut cov = Coverage::new();
        cov.set(Signal::ToolCalls, CoverageCounts { measured: 10, ..Default::default() });
        cov.set(Signal::Hooks, CoverageCounts { unmetered: 10, ..Default::default() });
        // 10 measured / (10 measured + 10 unmetered) = 0.5
        assert_eq!(cov.overall_ratio(), Some(0.5));
    }

    #[test]
    fn coverage_get_missing_signal_is_zero_not_panic() {
        let cov = Coverage::new();
        assert_eq!(cov.get(Signal::NetworkAccess), CoverageCounts::default());
    }

    #[test]
    fn signal_set_insert_and_contains() {
        let mut set = SignalSet::EMPTY;
        assert!(!set.contains(Signal::Hooks));
        set.insert(Signal::Hooks);
        assert!(set.contains(Signal::Hooks));
        assert!(!set.contains(Signal::ToolCalls));
    }

    #[test]
    fn signal_set_from_signals_builds_the_same_set_as_manual_insert() {
        let a = SignalSet::from_signals([Signal::ToolCalls, Signal::Hooks]);
        let mut b = SignalSet::EMPTY;
        b.insert(Signal::ToolCalls);
        b.insert(Signal::Hooks);
        assert_eq!(a, b);
    }

    #[test]
    fn aggregate_provenance_narrows_to_the_single_kind_present() {
        let present = ProvenanceSet { measured: true, ..Default::default() };
        let narrowed = AggregateProvenance::for_window(AggregateProvenance::Mixed, &present);
        assert_eq!(narrowed, AggregateProvenance::Measured);
    }

    #[test]
    fn aggregate_provenance_is_mixed_when_more_than_one_kind_present() {
        let present = ProvenanceSet { measured: true, estimated: true, ..Default::default() };
        let narrowed = AggregateProvenance::for_window(AggregateProvenance::Measured, &present);
        assert_eq!(narrowed, AggregateProvenance::Mixed);
    }

    #[test]
    fn aggregate_provenance_empty_window_falls_back_to_outer_set() {
        // 窗口内一行都没有 ≠ Unknown——沿用外层分类（比如某个小时完全没有
        // 请求，不代表这份会话整体的 provenance 变得"不知道"）。
        let present = ProvenanceSet::default();
        let narrowed = AggregateProvenance::for_window(AggregateProvenance::Estimated, &present);
        assert_eq!(narrowed, AggregateProvenance::Estimated);
    }

    #[test]
    fn fidelity_orders_full_above_partial_above_inferred() {
        assert!(Fidelity::Full > Fidelity::Partial);
        assert!(Fidelity::Partial > Fidelity::Inferred);
    }

    #[test]
    fn linearization_default_is_leaf_path() {
        assert_eq!(Linearization::default(), Linearization::LeafPath);
    }

    #[test]
    fn cost_quota_holds_multiple_windows_not_one_flattened_number() {
        let cost = Cost::Quota(vec![
            QuotaWindow { plan: "plus".into(), used_percent: 19.0, window_minutes: 10080, resets_at_ms: 1_787_846_539_000 },
            QuotaWindow { plan: "plus".into(), used_percent: 42.0, window_minutes: 300, resets_at_ms: 1_787_800_000_000 },
        ]);
        let Cost::Quota(windows) = cost else { panic!("expected Cost::Quota") };
        assert_eq!(windows.len(), 2);
        assert_eq!(windows[1].window_minutes, 300);
    }

    /// §12："这条规则有一个测试：断言共享类型层里没有任何标识符含宿主名。"
    /// 用源码文本自检而不是逐类型反射——本文件的说明性注释里会大量提到
    /// Codex / Claude Code / WorkBuddy / DSH（解释为什么要这么设计），所以
    /// 必须先把 `//` / `///` 注释行剥掉，只检查真正的代码文本；否则这条
    /// 测试自己先假红。
    #[test]
    fn shared_type_layer_has_no_host_identifiers_in_code() {
        let src = include_str!("evidence.rs");
        // 只扫 `#[cfg(test)]` 之前的部分——测试模块自己就得把宿主名列成
        // 字符串字面量才能拿它们去查（正下面这份 host 列表），不这样切一刀
        // 这条测试会先把自己判红。
        let production_src = src.split("#[cfg(test)]").next().unwrap_or(src);
        let code_only: String = production_src
            .lines()
            .map(|line| {
                let trimmed = line.trim_start();
                if trimmed.starts_with("//") {
                    return String::new();
                }
                match line.find("//") {
                    Some(i) => line[..i].to_string(),
                    None => line.to_string(),
                }
            })
            .collect::<Vec<_>>()
            .join("\n")
            .to_lowercase();
        for host in ["codex", "claude_code", "claudecode", "workbuddy", "dsh"] {
            assert!(
                !code_only.contains(host),
                "shared evidence type layer must not name host {host:?} in code (see contract §12)"
            );
        }
    }
}
