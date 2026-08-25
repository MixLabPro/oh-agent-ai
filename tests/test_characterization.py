#!/usr/bin/env python3
"""纯函数特征测试（ENGINEERING.md §4.4 第 2 层）。

与 `test_regressions.py` 的分工：

  回归测试   —— 每个用例对应一次真实事故，证明「旧缺陷没回来」
  **特征测试** —— 把当前行为**原样钉住**，证明「移植后行为没变」

§4.1 点名这批函数「完全无测试」：`est_tokens` 具体数值、`parse_frontmatter`
的续行 / 引号 / 值含冒号、`plugin_identity` 三种路径形态、`lookup_usage`
裸名回退、`diff_against` 整个函数。移植会均匀地打击所有地方，而回归测试
只覆盖出过事的地方——中间这段空白就是这个文件。

**这里的每个期望值都是 Rust 侧 `#[cfg(test)]` 要对齐的目标。**
断言的是具体数值而非范围：`est_tokens("hello") == 1`，不是 `> 0`。
范围断言在移植时毫无用处。

跑法：
    python3 -m unittest tests.test_characterization -v
"""

import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

_spec = importlib.util.spec_from_file_location("scan", ROOT / "scripts" / "scan.py")
scan = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(scan)

sys.path.insert(0, str(ROOT / "scripts"))
from skill_vitals.util import split_lines  # noqa: E402
from skill_vitals.util import fork_boundary, post_fork  # noqa: E402
from skill_vitals.usage import context_composition, request_metrics, token_by_model  # noqa: E402
from skill_vitals.compaction import compaction_events  # noqa: E402
from skill_vitals.waste import detect_duplicate_tool_results, detect_failure_run_waste, detect_structural_waste  # noqa: E402
from skill_vitals.util import est_tokens  # noqa: E402
from skill_vitals.behavior import match_behavior  # noqa: E402
from skill_vitals.trajectory import match_trajectory  # noqa: E402
from skill_vitals.skill import skill_invocations  # noqa: E402
from skill_vitals.duration import (  # noqa: E402
    tool_call_durations, turn_durations, step_durations, approval_latencies, hook_executions,
)


class TestEstTokens(unittest.TestCase):
    """int(cjk * 0.6 + other * 0.3)。CJK 判据是 U+4E00..U+9FFF。

    比例是 DeepSeek 官方换算（中文 0.6 token/字符、其余 0.3 token/字符）——
    2026-08-21 从旧比例（cjk/1.5 + other/4，来源不可考）换过来的：拿真实会话
    550 段 assistant 输出比对 provider 实际 outputTokens，旧比例系统性低估
    22.2%，官方比例低估 8.8%，明显更准（但仍是估算，DeepSeek 自己的文档也写
    "以接口返回为准"）。这里的期望值是按新比例重新算的，不是从旧数字改的——
    比例变了，"看起来差不多"式的手改容易把截断边界改错。

    移植清单第 5 条：`"一" <= ch <= "鿿"` 语义简单但边界易写错。
    下面的边界用例就是为了让写错的版本立刻红。
    """

    def test_empty_is_zero(self):
        self.assertEqual(scan.est_tokens(""), 0)
        self.assertEqual(scan.est_tokens(None or ""), 0)

    def test_other_chars_times_zero_point_three_and_truncates(self):
        self.assertEqual(scan.est_tokens("hello"), 1)        # 5*0.3 = 1.5 → 1
        self.assertEqual(scan.est_tokens("x" * 4), 1)        # 4*0.3 = 1.2 → 1
        self.assertEqual(scan.est_tokens("x" * 3), 0)        # 3*0.3 = 0.9 → 0，向下取整不是四舍五入
        self.assertEqual(scan.est_tokens("x" * 400), 120)    # 400*0.3 = 120

    def test_cjk_chars_times_zero_point_six(self):
        self.assertEqual(scan.est_tokens("中文"), 1)          # 2*0.6 = 1.2 → 1
        self.assertEqual(scan.est_tokens("中" * 3), 1)        # 3*0.6 = 1.8 → 1
        self.assertEqual(scan.est_tokens("中" * 150), 90)     # 150*0.6 = 90

    def test_mixed(self):
        # 中,文 = CJK；「，」是 U+FF0C，**不在** U+4E00..U+9FFF 内，算 other
        # 2*0.6 + 8*0.3 = 1.2 + 2.4 = 3.6 → 3
        self.assertEqual(scan.est_tokens("中文，English"), 3)

    def test_cjk_range_boundaries(self):
        """区间端点与两侧各一个字符。写成 < 而非 <= 会在这里露馅。"""
        self.assertEqual(scan.est_tokens("一" * 3), 1)   # 下界，含；3*0.6=1.8→1
        self.assertEqual(scan.est_tokens("鿿" * 3), 1)   # 上界，含
        self.assertEqual(scan.est_tokens("䷿" * 3), 0)   # 下界前一个 → other，3*0.3=0.9→0
        self.assertEqual(scan.est_tokens("ꀀ" * 3), 0)   # 上界后一个 → other
        self.assertEqual(scan.est_tokens("㐀" * 3), 0)   # 扩展 A 区不算 CJK
        self.assertEqual(scan.est_tokens("\U00020000" * 3), 0)  # 扩展 B 区不算

    def test_never_negative_and_no_panic_on_unicode(self):
        """属性测试第 2 条的用例版：任意 Unicode 不炸、非负。"""
        for s in ("\U0001f600" * 10, "\x00\x01\x02", "á̂",
                  "\ud83d", "🇨🇳🇺🇸", "\n\r\t"):
            self.assertGreaterEqual(scan.est_tokens(s), 0)


class TestSafeStrHandlesSurrogates(unittest.TestCase):
    """非 UTF-8 的**文件名**经 os.fsdecode 会变成孤立代理字符。

    这类字符 json.dumps 能产出，写文件时却抛 UnicodeEncodeError ——
    **整次扫描中断**。CI 的 Linux job 抓到过一次真崩溃；macOS 的 APFS
    拒绝非 UTF-8 文件名，本地永远撞不出。

    这里直接喂代理字符，不依赖文件系统，因此在任何平台都能跑。
    """

    def test_lone_surrogate_becomes_replacement_char(self):
        self.assertEqual(scan.safe_str("a\udcffb"), "a\ufffdb")

    def test_result_is_always_utf8_encodable(self):
        """这是它存在的唯一理由：结果必须能写进 UTF-8 文件。"""
        for s in ("\udcff", "x\udc80\udcfey", "\udcff" * 10, "正常中文"):
            scan.safe_str(s).encode("utf-8")  # 不抛异常即通过

    def test_plain_text_is_untouched(self):
        for s in ("hello", "中文混排 English", "", "emoji 😀"):
            self.assertEqual(scan.safe_str(s), s)

    def test_matches_rust_from_utf8_lossy(self):
        """两个实现必须给出同一个 U+FFFD 数量，否则 path 字段会分叉。

        Rust 的 from_utf8_lossy 按「极大子序列」replace，Python 这里
        先按 surrogateescape 还原字节再 replace 解码 —— 等价。
        """
        raw = b"bad-\xff\xfe-name"
        py = scan.safe_str(raw.decode("utf-8", "surrogateescape"))
        self.assertEqual(py, raw.decode("utf-8", "replace"))


class TestSplitLines(unittest.TestCase):
    """`skill_vitals.util.split_lines` 是给 Rust `util::split_lines`（其自身
    测试就叫 `split_lines_matches_python`）对齐的 Python 侧目标——两边都只认
    `\\n` / `\\r\\n` / `\\r` 三种真正的换行，不认 `str.splitlines()` 额外识别
    的那批 Unicode 段落/换行符。"""

    def test_matches_rust_ascii_cases(self):
        """与 src/util.rs 的 split_lines_matches_python 逐字节同源。"""
        self.assertEqual(split_lines("a\nb"), ["a", "b"])
        self.assertEqual(split_lines("a\nb\n"), ["a", "b"])
        self.assertEqual(split_lines("a\r\nb\r"), ["a", "b"])
        self.assertEqual(split_lines(""), [])

    def test_keeps_unicode_line_separators_inside_the_line(self):
        """真实回归的核心断言：U+2028/U+0085 等字符合法出现在 JSON 字符串值
        里，不是记录分隔符——split_lines 必须把它们留在原来的行里，
        str.splitlines() 会把它们切成新的一行（这正是缺陷所在）。"""
        for ch in (" ", " ", "\x85", "\x0b", "\x0c", "\x1c", "\x1d", "\x1e"):
            s = "a" + ch + "b\nc"
            self.assertEqual(split_lines(s), ["a" + ch + "b", "c"],
                             "char %r should stay inside its line" % ch)
            # 对照：str.splitlines() 恰恰会在这些字符处断行——这就是被替换掉的行为。
            self.assertEqual(s.splitlines(), ["a", "b", "c"])

    def test_loses_nothing_but_terminators(self):
        """与 Rust 的 split_lines_loses_nothing_but_terminators 属性测试同一条
        不变式：拼回去只丢 \\n / \\r，其余字符原样保留。"""
        s = "line1\r\nline2\rline3\nline4 still-line4"
        self.assertEqual("".join(split_lines(s)),
                         s.replace("\n", "").replace("\r", ""))


class TestParseFrontmatter(unittest.TestCase):
    """不依赖 yaml 库的手写解析器，边界全在这里。"""

    def test_no_frontmatter_returns_whole_text_as_body(self):
        fm, raw, body = scan.parse_frontmatter("just a body\n")
        self.assertEqual(fm, {})
        self.assertEqual(raw, "")
        self.assertEqual(body, "just a body\n")

    def test_basic_and_blank_line_after_frontmatter_is_consumed(self):
        """闭合 `---` 之后的 `\\s*\\n?` 会把紧跟的空行一起吃掉。

        body 从 "body" 开始，不是从 "\\n" 开始。这不是笔误而是真实行为，
        且**有后果**：`body_lines` 与 `tier2_core_tokens` 都由 body 算出，
        移植时把这段正则写松或写紧，两个数都会跟着偏。
        """
        fm, raw, body = scan.parse_frontmatter(
            "---\nname: a\ndescription: d\n---\n\nbody\n")
        self.assertEqual(fm, {"name": "a", "description": "d"})
        self.assertEqual(raw, "name: a\ndescription: d")
        self.assertEqual(body, "body\n")

    def test_many_blank_lines_after_frontmatter_all_consumed(self):
        _, _, body = scan.parse_frontmatter("---\nname: a\n---\n\n\n\nbody\n")
        self.assertEqual(body, "body\n")

    def test_quotes_are_stripped_both_kinds(self):
        fm, _, _ = scan.parse_frontmatter(
            "---\nname: 'a'\ndescription: \"d\"\n---\n")
        self.assertEqual(fm["name"], "a")
        self.assertEqual(fm["description"], "d")

    def test_value_containing_colons_keeps_everything_after_first(self):
        """partition(':') 只切第一个冒号，右边整段原样保留。"""
        fm, _, _ = scan.parse_frontmatter("---\nk: value: with: colons\n---\n")
        self.assertEqual(fm["k"], "value: with: colons")

    def test_quoted_value_with_inner_colon(self):
        fm, _, _ = scan.parse_frontmatter(
            "---\ndescription: 'Quoted: with a colon inside'\n---\n")
        self.assertEqual(fm["description"], "Quoted: with a colon inside")

    def test_continuation_line_joins_with_single_space(self):
        """缩进行并入上一个 key，用一个空格连接（不是换行）。"""
        fm, _, _ = scan.parse_frontmatter(
            "---\ndescription: first\n  second line\n    third\n---\n")
        self.assertEqual(fm["description"], "first second line third")

    def test_continuation_without_preceding_key_is_dropped(self):
        fm, _, _ = scan.parse_frontmatter("---\n  orphan\nname: a\n---\n")
        self.assertEqual(fm, {"name": "a"})

    def test_line_without_colon_is_ignored(self):
        fm, _, _ = scan.parse_frontmatter("---\nname: a\nbare-line\n---\n")
        self.assertEqual(fm, {"name": "a"})

    def test_crlf(self):
        """`^---\\s*\\n` 里的 \\s* 吃掉 \\r，所以 CRLF 能解析。"""
        fm, _, body = scan.parse_frontmatter(
            "---\r\nname: a\r\ndescription: d\r\n---\r\n\r\nbody\r\n")
        self.assertEqual(fm["name"], "a")
        self.assertEqual(fm["description"], "d")
        self.assertEqual(body, "body\r\n", "\\r 也被 \\s* 吃掉")

    def test_unclosed_frontmatter_is_all_body(self):
        """截断的 frontmatter 不算 frontmatter，整篇算正文。"""
        fm, raw, body = scan.parse_frontmatter("---\nname: a\n\nbody\n")
        self.assertEqual(fm, {})
        self.assertEqual(raw, "")
        self.assertTrue(body.startswith("---"))

    def test_duplicate_key_last_wins(self):
        fm, _, _ = scan.parse_frontmatter("---\nname: a\nname: b\n---\n")
        self.assertEqual(fm["name"], "b")


class TestPluginIdentity(unittest.TestCase):
    """三种真实存在的插件路径形态。返回 (插件名, marketplace)。"""

    def test_cache_form(self):
        self.assertEqual(
            scan.plugin_identity("/h/.claude/plugins/cache/mkt/plug/unknown/skills/s"),
            ("plug", "mkt"))

    def test_marketplaces_plugins_form(self):
        self.assertEqual(
            scan.plugin_identity("/h/.claude/plugins/marketplaces/mkt/plugins/plug/skills/s"),
            ("plug", "mkt"))

    def test_marketplaces_external_plugins_form(self):
        self.assertEqual(
            scan.plugin_identity(
                "/h/.claude/plugins/marketplaces/mkt/external_plugins/plug/skills/s"),
            ("plug", "mkt"))

    def test_non_plugin_path(self):
        self.assertEqual(scan.plugin_identity("/h/.claude/skills/s"), (None, None))

    def test_wrapper_dirs_are_stripped_and_last_segment_wins(self):
        """plugins / external_plugins / unknown / skills 是包装层，不是插件名。"""
        self.assertEqual(
            scan.plugin_identity("/h/plugins/cache/mkt/a/b/unknown/skills/s"),
            ("b", "mkt"))

    def test_falls_back_to_marketplace_when_middle_is_all_wrappers(self):
        self.assertEqual(
            scan.plugin_identity("/h/plugins/cache/mkt/unknown/skills/s"),
            ("mkt", "mkt"))

    def test_trailing_slash_is_appended_internally(self):
        """PLUGIN_PATH_RE 要求 /skills/，所以以 skills 结尾的路径也要能匹配。"""
        self.assertEqual(
            scan.plugin_identity("/h/plugins/cache/mkt/plug/unknown/skills"),
            ("plug", "mkt"))

    def test_version_directory_is_not_the_plugin_name(self):
        """WorkBuddy 的缓存把版本号放在 Claude Code 放 `unknown` 的那一格。

        原来取末段，于是命名空间成了 `1.0.0`：两个**不同的包**只要版本号
        相同就落进同一个命名空间，各自的同名 skill 会被判成冲突 —— 凭空
        报一个不存在的问题，而这正是本工具最不该犯的错。
        """
        for version in ("1.0.0", "2.0.0", "v20260727", "0.1.1784877812", "7"):
            with self.subTest(version=version):
                self.assertEqual(
                    scan.plugin_identity(
                        "/h/.workbuddy/plugins/cache/wb/pkg/%s/skills/s" % version),
                    ("pkg", "wb"))

    def test_version_like_plugin_name_survives(self):
        """整段都像版本号时**留一个**：宁可要个怪名字，也不要空命名空间。"""
        self.assertEqual(
            scan.plugin_identity("/h/plugins/cache/mkt/1.0.0/skills/s"),
            ("1.0.0", "mkt"))

    def test_non_version_suffix_is_kept(self):
        """只丢像版本号的末段。`plug/beta` 里的 beta 不是版本号，照旧取末段。"""
        self.assertEqual(
            scan.plugin_identity("/h/plugins/cache/mkt/plug/beta/skills/s"),
            ("beta", "mkt"))


class TestLookupUsage(unittest.TestCase):
    """skillUsage 的键可能是裸名，也可能是 `<plugin>:<skill>`。"""

    def test_namespaced_key_preferred_over_bare(self):
        usage = {"tool": {"usageCount": 1}, "plug:tool": {"usageCount": 9}}
        self.assertEqual(scan.lookup_usage(usage, "tool", "plug"),
                         (9, None, "plug:tool"))

    def test_bare_fallback_when_namespaced_missing(self):
        """已知的精度上限：裸名回退可能撞上同名的其他 skill。"""
        usage = {"tool": {"usageCount": 4}}
        self.assertEqual(scan.lookup_usage(usage, "tool", "plug"),
                         (4, None, "tool"))

    def test_plain_integer_form(self):
        self.assertEqual(scan.lookup_usage({"tool": 7}, "tool", None),
                         (7, None, "tool"))

    def test_last_used_at_passed_through(self):
        usage = {"tool": {"usageCount": 2, "lastUsedAt": 1700000000000}}
        self.assertEqual(scan.lookup_usage(usage, "tool", None),
                         (2, 1700000000000, "tool"))

    def test_missing_returns_zero_and_none_key(self):
        """没记录时匹配键必须是 None —— 不得伪造成匹配上了。"""
        self.assertEqual(scan.lookup_usage({}, "tool", None), (0, None, None))

    def test_usage_count_absent_or_null_becomes_zero(self):
        self.assertEqual(scan.lookup_usage({"t": {}}, "t", None)[0], 0)
        self.assertEqual(scan.lookup_usage({"t": {"usageCount": None}}, "t", None)[0], 0)

    def test_unexpected_value_type_is_skipped(self):
        """字符串等意外类型既不算命中也不能崩。"""
        self.assertEqual(scan.lookup_usage({"t": "nope"}, "t", None),
                         (0, None, None))


class TestIsCited(unittest.TestCase):
    """启发式：命中点看起来是否在引用/举例语境里。只排序，不裁决。"""

    def test_not_found_in_line(self):
        self.assertFalse(scan.is_cited("unrelated line", "payload"))

    def test_unbalanced_double_quote_before_match(self):
        self.assertTrue(scan.is_cited('say "hello payload', "payload"))

    def test_balanced_quotes_do_not_trigger(self):
        self.assertFalse(scan.is_cited('say "hi" then payload', "payload"))

    def test_cjk_open_quote(self):
        for q in ("“", "「", "『"):
            self.assertTrue(scan.is_cited("%s payload" % q, "payload"))

    def test_citation_hint_anywhere_in_line(self):
        self.assertTrue(scan.is_cited("For example, payload", "payload"))

    def test_backtick_counts_as_quote(self):
        self.assertTrue(scan.is_cited("run `payload", "payload"))


class TestDaysSince(unittest.TestCase):
    def test_none_and_zero_return_none(self):
        """0 也返回 None —— `if not ms` 把 0 当成缺失。移植时容易写成只判 null。"""
        self.assertIsNone(scan.days_since(None))
        self.assertIsNone(scan.days_since(0))

    def test_rounds_to_one_decimal(self):
        import time
        v = scan.days_since((time.time() - 86400 * 3) * 1000)
        self.assertAlmostEqual(v, 3.0, places=1)


class TestLevelRank(unittest.TestCase):
    """A6：`level_rank` 从标量改成 `(layer, rank)` 二维键，前五宿主必须原样。

    DSH 是二维覆盖（先 scope 层、后层内 rank），所以 rank 键要带一层；但前
    五个宿主只有一个隐式层，`layer` 必须恒 0、`rank` 必须是原标量 —— 这是
    golden 12/12 逐字节一致的前提。这里直接钉住返回值，而不只钉下游排序。
    """

    def test_five_hosts_layer_is_always_zero(self):
        for family in ("claude-code", "codex", "openclaw", "hermes",
                       "workbuddy", "unknown"):
            for level in ("enterprise", "personal", "project", "plugin",
                          "workspace", "managed", "other-host", "unknown", ""):
                with self.subTest(family=family, level=level):
                    out = scan.level_rank({"host_family": family, "level": level})
                    self.assertEqual(out[0], 0)
                    self.assertIsInstance(out[1], int)

    def test_claude_code_scalar_unchanged(self):
        self.assertEqual(
            scan.level_rank({"host_family": "claude-code", "level": "enterprise"}),
            (0, 0))
        self.assertEqual(
            scan.level_rank({"host_family": "claude-code", "level": "personal"}),
            (0, 1))
        self.assertEqual(
            scan.level_rank({"host_family": "claude-code", "level": "project"}),
            (0, 2))
        self.assertEqual(
            scan.level_rank({"host_family": "claude-code", "level": "plugin"}),
            (0, 3))
        self.assertEqual(
            scan.level_rank({"host_family": "claude-code", "level": "other-host"}),
            (0, 8))
        self.assertEqual(
            scan.level_rank({"host_family": "claude-code", "level": "unknown"}),
            (0, 9))

    def test_openclaw_scalar_unchanged(self):
        self.assertEqual(
            scan.level_rank({"host_family": "openclaw", "level": "workspace"}),
            (0, 0))
        self.assertEqual(
            scan.level_rank({"host_family": "openclaw", "level": "project"}),
            (0, 1))
        self.assertEqual(
            scan.level_rank({"host_family": "openclaw", "level": "personal"}),
            (0, 2))
        self.assertEqual(
            scan.level_rank({"host_family": "openclaw", "level": "managed"}),
            (0, 3))

    def test_host_fallback_via_legacy_host_field(self):
        # level_rank 也能从旧字段 host 取 family（compat 公开面不变）。
        self.assertEqual(
            scan.level_rank({"host": "claude-code", "level": "project"}), (0, 2))

    def test_dsh_is_two_dimensional(self):
        """DSH 分支返回二维键，层序与层内 rank 各占一位，不再退化成标量。"""
        out = scan.level_rank({
            "host_family": "dsh", "level": "project-dsh",
            "conflict_domain": "dsh:/home/u/.dsh:agent-main",
        })
        self.assertEqual(len(out), 2)
        self.assertIsInstance(out[0], int)
        self.assertEqual(out[1], 100)


class TestRedactPureBehaviour(unittest.TestCase):
    """脱敏的字符串替换规则。移植清单第 1 条：`regex` crate 不支持 lookbehind。

    这些用例定义了那个正则**必须保持**的行为，替换实现（捕获组或
    fancy-regex）拿它们验收。
    """

    def setUp(self):
        self._home, self._cwd = scan.HOME_N, scan.CWD_N
        scan.HOME_N, scan.CWD_N = "/home/alice", "/work/proj"

    def tearDown(self):
        scan.HOME_N, scan.CWD_N = self._home, self._cwd

    def test_home_and_cwd_replaced(self):
        out = scan.redact({"path": "/home/alice/.claude/skills/x"})
        self.assertEqual(out["path"], "~/.claude/skills/x")
        self.assertEqual(scan.redact({"p": "/work/proj/a"})["p"], "./a")

    def test_username_only_replaced_as_a_whole_path_segment(self):
        """lookbehind/lookahead 的全部意义：alice 是路径段才换，是子串不换。"""
        out = scan.redact({"a": "/data/alice/x", "b": "/data/alicexyz/x",
                           "c": "/data/xyzalice/x", "d": "/data/alice"})
        self.assertEqual(out["a"], "/data/<user>/x")
        self.assertEqual(out["b"], "/data/alicexyz/x", "前缀匹配不得替换")
        self.assertEqual(out["c"], "/data/xyzalice/x", "后缀匹配不得替换")
        self.assertEqual(out["d"], "/data/<user>", "行尾的路径段要替换")

    def test_username_match_is_case_insensitive(self):
        self.assertEqual(scan.redact({"p": "/data/ALICE/x"})["p"], "/data/<user>/x")

    def test_backslash_separators_also_handled(self):
        self.assertEqual(scan.redact({"p": r"\data\alice\x"})["p"], r"\data\<user>\x")

    def test_names_replaced_longest_first(self):
        """短名先替换会把长名切碎：`api` 先换掉，`api-client` 就成了 skill-001-client。"""
        obj = {"skills": [{"name": "api"}, {"name": "api-client"}],
               "note": "api-client uses api"}
        out = scan.redact(obj, names=True, name_map={})
        self.assertNotIn("api-client", json.dumps(out))
        aliases = {s["name"] for s in out["skills"]}
        self.assertEqual(len(aliases), 2, "两个名字必须映射到两个不同别名")

    def test_description_dropped_wholesale_not_pattern_cleaned(self):
        out = scan.redact({"description": "any free text"}, names=True, name_map={})
        self.assertEqual(out["description"], "<redacted: 13 chars>")

    def test_description_kept_when_names_not_redacted(self):
        out = scan.redact({"description": "any free text"})
        self.assertEqual(out["description"], "any free text")

    def test_numbers_and_bools_pass_through(self):
        out = scan.redact({"n": 5, "b": True, "z": None})
        self.assertEqual(out, {"n": 5, "b": True, "z": None})


class TestDiffAgainst(unittest.TestCase):
    """整个函数此前无测试。它是 `diff` 命令（PRODUCT §5.5）的全部实现。"""

    def _base(self, skills, budget=None, zombie_age=14):
        return {"skills": skills,
                "description_budget": budget or {"used_chars": 100, "pct_used": 1.0},
                "trigger_data": {"zombie_min_age_days": zombie_age},
                "security": {"flagged": []}}

    def _run(self, prev, now):
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False,
                                         encoding="utf-8") as f:
            json.dump(prev, f)
            p = f.name
        try:
            return scan.diff_against(p, now)
        finally:
            Path(p).unlink()

    def test_unreadable_baseline_returns_error_not_crash(self):
        r = scan.diff_against("/nonexistent/nope.json", self._base([]))
        self.assertIn("error", r)

    def test_malformed_baseline_returns_error(self):
        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as f:
            f.write("{not json")
            p = f.name
        try:
            self.assertIn("error", scan.diff_against(p, self._base([])))
        finally:
            Path(p).unlink()

    def test_only_loaded_skills_are_compared(self):
        """磁盘≠上下文在 diff 里同样成立：未加载的不进对比。"""
        prev = self._base([{"name": "a", "loaded": True, "usage_count": 0}])
        now = self._base([{"name": "a", "loaded": True, "usage_count": 0},
                          {"name": "ghost", "loaded": False, "usage_count": 0}])
        r = self._run(prev, now)
        self.assertEqual(r["added_skills"], [])
        self.assertEqual(r["loaded_then_now"], [1, 1])

    def test_added_and_removed(self):
        """条目是**有名字段的 dict**，不是裸的复合键数组。

        方向一直是对的：同名 skill 在两个宿主里不是同一个，比对必须带宿主。
        错的是序列化形状 —— 曾经是 `[["claude-code", null, "", "b"]]`，而脱敏
        对列表元素继承父键，于是**宿主名被当成 skill 名收录并全文替换**，
        report 里 host_selection / host_family / conflict_domain 全变成
        `skill-003`，而 host_summaries 的键不受影响，同一份报告自相矛盾。

        改成 dict 之后每个字段各归各的键，`name` 仍然被脱敏（下面的
        TestRedaction 与 test_regressions 都依赖这一点）。
        """
        prev = self._base([{"name": "a", "loaded": True, "usage_count": 0}])
        now = self._base([{"name": "b", "loaded": True, "usage_count": 0}])
        r = self._run(prev, now)
        self.assertEqual(len(r["added_skills"]), 1)
        self.assertEqual(r["added_skills"][0]["name"], "b")
        self.assertEqual(set(r["added_skills"][0]),
                         {"host", "instance_id", "namespace", "name"})
        self.assertEqual(len(r["removed_skills"]), 1)
        self.assertEqual(r["removed_skills"][0]["name"], "a")

    def test_usage_delta_sorted_descending_and_zero_delta_omitted(self):
        prev = self._base([{"name": "a", "loaded": True, "usage_count": 1},
                           {"name": "b", "loaded": True, "usage_count": 5},
                           {"name": "c", "loaded": True, "usage_count": 2}])
        now = self._base([{"name": "a", "loaded": True, "usage_count": 4},
                          {"name": "b", "loaded": True, "usage_count": 5},
                          {"name": "c", "loaded": True, "usage_count": 12}])
        r = self._run(prev, now)
        self.assertEqual([x["name"] for x in r["usage_delta"]], ["c", "a"])
        top = r["usage_delta"][0]
        # 只断言语义字段；host / instance_id / namespace 是多宿主定位用的
        self.assertEqual({k: top[k] for k in ("name", "delta", "now")},
                         {"name": "c", "delta": 10, "now": 12})

    def test_negative_delta_is_reported(self):
        """计数理论上只增，但宿主重置过就会减。不能默默吞掉。"""
        prev = self._base([{"name": "a", "loaded": True, "usage_count": 9}])
        now = self._base([{"name": "a", "loaded": True, "usage_count": 2}])
        self.assertEqual(self._run(prev, now)["usage_delta"][0]["delta"], -7)

    def test_newly_judgeable_crosses_the_age_gate(self):
        """上次太新不能判、这次够岁数了 —— 这批才是新的僵尸判定对象。"""
        prev = self._base([{"name": "a", "loaded": True, "usage_count": 0,
                            "installed_days_ago": 3}])
        now = self._base([{"name": "a", "loaded": True, "usage_count": 0,
                           "installed_days_ago": 20}])
        r = self._run(prev, now)
        self.assertEqual(len(r["newly_judgeable"]), 1)
        self.assertEqual(r["newly_judgeable"][0]["verdict"], "zombie")

    def test_newly_judgeable_alive_when_used(self):
        prev = self._base([{"name": "a", "loaded": True, "usage_count": 0,
                            "installed_days_ago": 3}])
        now = self._base([{"name": "a", "loaded": True, "usage_count": 6,
                           "installed_days_ago": 20}])
        self.assertEqual(self._run(prev, now)["newly_judgeable"][0]["verdict"], "alive")

    def test_already_old_skill_is_not_newly_judgeable(self):
        prev = self._base([{"name": "a", "loaded": True, "usage_count": 0,
                            "installed_days_ago": 30}])
        now = self._base([{"name": "a", "loaded": True, "usage_count": 0,
                           "installed_days_ago": 44}])
        self.assertEqual(self._run(prev, now)["newly_judgeable"], [])

    def test_budget_delta(self):
        prev = self._base([], budget={"used_chars": 100, "pct_used": 1.0})
        now = self._base([], budget={"used_chars": 250, "pct_used": 2.5})
        r = self._run(prev, now)
        self.assertEqual(r["budget_delta_chars"], 150)
        self.assertEqual(r["budget_pct_then_now"], [1.0, 2.5])

    def test_new_security_findings_keyed_by_skill_rule_where_line(self):
        prev = self._base([])
        now = self._base([])
        now["security"]["flagged"] = [
            {"name": "s", "findings": [{"rule": "r1", "where": "SKILL.md", "line": 3},
                                       {"rule": "r2", "where": "SKILL.md", "line": 9}]}]
        prev["security"]["flagged"] = [
            {"name": "s", "findings": [{"rule": "r1", "where": "SKILL.md", "line": 3}]}]
        r = self._run(prev, now)
        self.assertEqual(r["new_security_findings"],
                         [{"skill": "s", "rule": "r2", "where": "SKILL.md", "line": 9}])

    def test_same_rule_at_new_line_counts_as_new(self):
        """行号进键：同一规则挪了位置算新发现。这是有意的保守取向。"""
        prev = self._base([])
        now = self._base([])
        prev["security"]["flagged"] = [
            {"name": "s", "findings": [{"rule": "r", "where": "SKILL.md", "line": 3}]}]
        now["security"]["flagged"] = [
            {"name": "s", "findings": [{"rule": "r", "where": "SKILL.md", "line": 4}]}]
        self.assertEqual(len(self._run(prev, now)["new_security_findings"]), 1)


class TestFindingCoords(unittest.TestCase):
    """finding 的 turn/step/call_id 三态。Rust 侧 `coords_own_then_carried_then_null` 对齐。

    三种情形在真实日志里都真实存在（session-e4b0be69 实测覆盖率）：

        tool/call         turn 786/786  step 786/786  callId 786/786  → 自带
        approval/asked    turn   0/2    step   0/2    callId   2/2    → turn/step 靠顺延
        sandbox/mode(seq=1)  三者全无，且在首个 turn 之前           → 全 null

    顺延不是猜：事件流按 seq 有序，turn/start 是权威边界。实测两对 approval
    事件都落在 turn 9 内，与顺延结果一致。
    """

    def _events(self):
        def ev(t, seq, data):
            return {"type": t, "seq": seq, "time": 1000 + seq, "data": data}
        return [
            ev("sandbox/mode", 1, {"mode": "danger-full-access"}),
            ev("turn/start", 2, {"turn": 9}),
            ev("step/start", 3, {"turn": 9, "step": 2}),
            ev("tool/call", 4, {"turn": 7, "step": 1, "callId": "call_own",
                                "name": "bash", "arguments": '{"command":"rm -rf /x"}'}),
            ev("approval/asked", 5, {"id": "a1", "toolName": "bash",
                                     "callId": "call_ask", "reason": "escalate"}),
            ev("turn/end", 6, {"turn": 9}),
            ev("tool/result", 7, {"message": "x",
                                  "error": {"name": "E", "code": "FS_SANDBOX_DENIED"}}),
        ]

    def _by_seq(self, seq):
        out = match_behavior(self._events())
        return next(f for f in out if f["seq"] == seq)

    def test_own_coords_win_over_carried(self):
        """事件自带的 turn 优先于顺延值（turn 7，不是当时活跃的 9）。"""
        f = self._by_seq(4)
        self.assertEqual((f["turn"], f["step"], f["call_id"]), (7, 1, "call_own"))

    def test_missing_coords_carried_from_boundary(self):
        """approval/asked 没有 turn/step，从 turn/start · step/start 顺延。"""
        f = self._by_seq(5)
        self.assertEqual((f["turn"], f["step"], f["call_id"]), (9, 2, "call_ask"))

    def test_before_first_turn_is_null(self):
        """首个 turn 之前的事件三者全 None——不臆造一个 turn。"""
        f = self._by_seq(1)
        self.assertEqual((f["turn"], f["step"], f["call_id"]), (None, None, None))

    def test_after_turn_end_is_cleared(self):
        """turn/end 之后清空，不把事件硬塞进刚结束的那个 turn。"""
        f = self._by_seq(7)
        self.assertEqual((f["turn"], f["step"]), (None, None))

    def test_trajectory_findings_share_the_same_key_order(self):
        """轨迹 finding 与单事件 finding 必须同构（11 键、键序一致）。

        两类 finding 追加进同一个数组，键序一旦分叉，diff/排序/渲染都会出问题。
        trajectory 侧用「先 None 占位、再按 seq 回填」正是为了保住键序——如果改成
        事后 insert，新键会排到末尾，这条就红。
        """
        def ev(t, seq, data):
            return {"type": t, "seq": seq, "time": 1000 + seq, "data": data}
        traj = match_trajectory([
            ev("tool/call", 1, {"name": "bash", "arguments": '{"command":"ls"}'}),
            ev("tool/call", 2, {"name": "bash", "arguments": '{"command":"ls"}'}),
            ev("tool/call", 3, {"name": "bash", "arguments": '{"command":"ls"}'}),
        ])
        self.assertTrue(traj, "fixture 应至少产出一条 SV611")
        behav = match_behavior(self._events())
        self.assertEqual(list(traj[0].keys()), list(behav[0].keys()))


class TestContextComposition(unittest.TestCase):
    """常驻上下文构成（FR-04a）。Rust 侧 `context_composition_*` 对齐。

    真实会话（session-e4b0be69）实测：system 1,511 · tools 6,371 · catalog 2,773
    （29 个技能）= 常驻 10,655；而首次请求 provider 报的上下文是 13,959。
    **两个数来自不同估算器，差的那部分是首条用户消息与消息封套开销**——所以
    本函数只给常驻分类，不声称与 provider 计数相等。
    """

    EVENTS = [
        {"type": "request/header", "seq": 1, "data": {"header": {
            "config": {"model": "m"},
            "system": "You are an AI agent.",
            "tools": [{"name": "bash", "description": "Run a shell command"}]}}},
        {"type": "user/message", "seq": 2, "data": {"source": {
            "kind": "skill-catalog", "form": "catalog",
            "entries": [{"name": "a", "description": "skill a does things"},
                        {"name": "b", "description": "skill b"}]}}},
    ]

    EXPECTED = ('{"system_tokens":6,"tools_tokens":15,"catalog_tokens":8,'
                '"catalog_entries":2,"catalog_names":[{"name":"a","tokens":6},'
                '{"name":"b","tokens":2}],"resident_total":29,"estimator":"est_tokens"}')

    def test_byte_for_byte_matches_rust(self):
        """tools_tokens 最容易分叉：它估的是**序列化后的 JSON 文本**。

        Python 必须用 `separators=(",", ":")`（紧凑）才能与 Rust 的
        `serde_json::to_string` 一致；默认 json.dumps 会在 `, ` / `: ` 多出空格，
        字符数变多、估算随之偏大。真实日志上这个差异是 6,371 vs 6,546。
        """
        got = json.dumps(context_composition(self.EVENTS), ensure_ascii=False,
                         separators=(",", ":"))
        self.assertEqual(got, self.EXPECTED)

    def test_absent_source_is_null_not_zero(self):
        """源事件从未出现 → None，不是 0。

        「日志里没有 skill-catalog 事件」与「发布了一个空目录」是两回事；
        混成同一个 0，UI 就会写「0 个技能」——一个伪造的测量值。
        """
        out = context_composition([])
        for key in ("system_tokens", "tools_tokens", "catalog_tokens",
                    "catalog_entries", "catalog_names", "resident_total"):
            self.assertIsNone(out[key], key)

    def test_catalog_last_publication_wins(self):
        """目录中途重发时取最后一次，不累加（累加会把同一批技能算两遍）。"""
        out = context_composition([
            {"type": "user/message", "seq": 1, "data": {"source": {
                "kind": "skill-catalog", "entries": [
                    {"name": "a", "description": "x"},
                    {"name": "b", "description": "y"},
                    {"name": "c", "description": "z"}]}}},
            {"type": "agent/inbox/spliced", "seq": 2, "data": {"source": {
                "kind": "skill-catalog", "entries": [{"name": "a", "description": "x"}]}}},
        ])
        self.assertEqual(out["catalog_entries"], 1)
        self.assertEqual(out["catalog_tokens"], est_tokens("ax"))
        self.assertEqual(out["catalog_names"], [{"name": "a", "tokens": est_tokens("ax")}])

    def test_partial_sources_still_give_a_total(self):
        """只有 header 没有 catalog：catalog 仍为 None，但合计按已知项给出。"""
        out = context_composition([
            {"type": "request/header", "seq": 1,
             "data": {"header": {"system": "abc", "tools": []}}}])
        self.assertIsNone(out["catalog_tokens"])
        self.assertIsNotNone(out["resident_total"])

    def test_catalog_names_excludes_description_text(self):
        """T1 隐私决策：catalog_names 只出 {name, tokens}，description 原文绝不
        出现在输出的任何字段里——一旦进投影就会跟着走通用导出路径，FR-SK-09
        要求导出不含未脱敏内容。"""
        out = context_composition([
            {"type": "user/message", "seq": 1, "data": {"source": {
                "kind": "skill-catalog", "entries": [
                    {"name": "a", "description": "contains SECRET_TOKEN_ABC123 in the text"}]}}}])
        serialized = json.dumps(out, ensure_ascii=False)
        self.assertNotIn("SECRET_TOKEN_ABC123", serialized)
        self.assertEqual(out["catalog_names"], [
            {"name": "a", "tokens": est_tokens("acontains SECRET_TOKEN_ABC123 in the text")}])


class TestCompactionEvents(unittest.TestCase):
    """上下文压缩事件。Rust 侧 `compaction::tests::*` 对齐。

    真实会话（session-e4b0be69）实测形态：10 次 prune **全部**顺延到 turn 85
    （同一次爆发，合计 33,099 token），恰好是上下文峰值所在的那个 turn
    （799,841/1,000,000 = 80.0%）；完整压缩发生在两个 turn 之后的 turn 87。
    这条因果链是时间线要讲的故事，所以 turn 必须给准——prune 自身不带 turn，
    全靠 Coords 从 turn/start·turn/end 顺延。
    """

    EVENTS = [
        {"type": "turn/start", "seq": 1, "time": 1001, "data": {"turn": 85}},
        {"type": "compaction/prune", "seq": 2, "time": 1002, "data": {
            "shadowedRange": {"start": 10, "end": 10}, "shadowedSeqs": [10],
            "shadowedTokenCount": 3367}},
        {"type": "compaction/prune", "seq": 3, "time": 1003, "data": {
            "shadowedRange": {"start": 20, "end": 21}, "shadowedSeqs": [20, 21],
            "shadowedTokenCount": 2469}},
        {"type": "turn/end", "seq": 4, "time": 1004, "data": {"turn": 85}},
        {"type": "turn/start", "seq": 5, "time": 1005, "data": {"turn": 87}},
        {"type": "compaction/start", "seq": 6, "time": 1006,
         "data": {"compactionId": "c1", "turn": 87}},
        {"type": "compaction/summary", "seq": 7, "time": 1007,
         "data": {"compactionId": "c1", "summary": []}},
        {"type": "compaction/end", "seq": 8, "time": 1008,
         "data": {"compactionId": "c1", "turn": 87}},
    ]

    EXPECTED = (
        '{"compactions":[{"compaction_id":"c1","start_seq":6,"start_time":1006,'
        '"turn":87,"end_seq":8,"has_summary":true}],'
        '"prunes":[{"seq":2,"time":1002,"turn":85,"shadowed_token_count":3367,'
        '"shadowed_seq_count":1},{"seq":3,"time":1003,"turn":85,'
        '"shadowed_token_count":2469,"shadowed_seq_count":2}],'
        '"pruned_tokens_total":5836,"prunes_without_token_count":0}'
    )

    def test_byte_for_byte_matches_rust(self):
        got = json.dumps(compaction_events(self.EVENTS), ensure_ascii=False,
                         separators=(",", ":"))
        self.assertEqual(got, self.EXPECTED)

    def test_prune_turn_is_carried_forward_not_own(self):
        """prune 自身不带 turn，从 turn/start·turn/end 顺延——这是这个模块存在
        的理由：只喂 compaction/* 不喂 turn 边界的话，每条 prune 的 turn 都会
        落成 None（真实日志上验证过这个坑）。"""
        out = compaction_events(self.EVENTS)
        self.assertEqual({p["turn"] for p in out["prunes"]}, {85})
        self.assertEqual(out["compactions"][0]["turn"], 87,
                         "compaction/start 自带 turn，不需要顺延")

    def test_start_summary_end_merge_into_one_record(self):
        """三个事件按 compactionId 归并成一条，不是三条。"""
        out = compaction_events(self.EVENTS)
        self.assertEqual(len(out["compactions"]), 1)
        self.assertTrue(out["compactions"][0]["has_summary"])
        self.assertEqual(out["compactions"][0]["end_seq"], 8)

    def test_missing_token_count_surfaced_not_summed(self):
        """缺 shadowedTokenCount 的 prune：不计入合计，单独暴露计数。

        两种错误做法都要避免：当 0 累加（把「没上报」伪造成「剪掉了 0」）；或让
        整个合计变 None（一条畸形事件毁掉其余的有用信息，从「部分已知」退化成
        「完全未知」，反而更差）。
        """
        out = compaction_events([
            {"type": "compaction/prune", "seq": 1, "data": {"shadowedTokenCount": 100}},
            {"type": "compaction/prune", "seq": 2, "data": {"shadowedSeqs": [5]}},
        ])
        self.assertEqual(out["pruned_tokens_total"], 100, "只累加上报了的")
        self.assertEqual(out["prunes_without_token_count"], 1)
        self.assertIsNone(out["prunes"][1]["shadowed_token_count"])

    def test_orphan_end_does_not_fabricate_a_record(self):
        """只有 end 没有 start（日志被截断）：不硬造一条 compaction。"""
        out = compaction_events([
            {"type": "compaction/end", "seq": 1, "data": {"compactionId": "ghost", "turn": 9}},
        ])
        self.assertEqual(out["compactions"], [], "没有 start 就没有这次压缩，宁缺勿造")

    def test_absent_gives_empty_not_error(self):
        """无压缩事件：空列表 + 合计 0（「读全了，确实没发生压缩」）。"""
        out = compaction_events([{"type": "tool/call", "seq": 1, "data": {}}])
        self.assertEqual(out["compactions"], [])
        self.assertEqual(out["prunes"], [])
        self.assertEqual(out["pruned_tokens_total"], 0)


class TestStructuralWaste(unittest.TestCase):
    """FR-04b 结构性浪费。Rust 侧 `waste::tests::*` 对齐。

    两个检测器覆盖 PRD 点名的两种模式：重复工具结果、失败重试的上下文增量。
    明确排除的候选是 `compaction_events` 的 prune——查过真实日志（session-
    e4b0be69）的 10 次 prune 具体剪了什么，全部是 turn 3 到 turn 60 互不相同
    的一次性内容，不是重复读取，是正常的上下文老化清理，不该标成"浪费"。
    """

    CONTENT = [{"type": "text", "text": "key: value\nother: 1"}]

    def _tool_call(self, name, args, turn, step, call_id, seq):
        return {"type": "tool/call", "seq": seq, "time": 1000 + seq,
               "data": {"turn": turn, "step": step, "callId": call_id,
                        "name": name, "arguments": args}}

    def _tool_result(self, call_id, turn, step, content, seq):
        return {"type": "tool/result", "seq": seq, "time": 1000 + seq,
               "data": {"turn": turn, "step": step,
                        "message": {"source": {"kind": "tool", "callId": call_id},
                                   "content": content}}}

    def _tool_result_err(self, call_id, turn, step, code, seq):
        return {"type": "tool/result", "seq": seq, "time": 1000 + seq,
               "data": {"turn": turn, "step": step,
                        "message": {"source": {"kind": "tool", "callId": call_id},
                                   "content": []},
                        "error": {"name": "E", "code": code}}}

    def test_byte_for_byte_matches_rust(self):
        events = [
            self._tool_call("read", '{"path":"config.yaml"}', 1, 1, "c1", 1),
            self._tool_result("c1", 1, 1, self.CONTENT, 2),
            self._tool_call("read", '{"path":"config.yaml"}', 2, 1, "c2", 3),
            self._tool_result("c2", 2, 1, self.CONTENT, 4),
            self._tool_call("read", '{"path":"config.yaml"}', 3, 1, "c3", 5),
            self._tool_result("c3", 3, 1, self.CONTENT, 6),
            self._tool_result_err("c4", 70, 2, "FS_NOT_OBSERVED", 440338),
            self._tool_result_err("c5", 70, 2, "FS_NOT_OBSERVED", 440340),
            self._tool_result_err("c6", 70, 2, "FS_NOT_OBSERVED", 440342),
        ]
        requests = [
            {"request_seq": 1, "turn": 70, "step": 1, "context_tokens": 681584},
            {"request_seq": 2, "turn": 70, "step": 2, "context_tokens": 681893},
            {"request_seq": 3, "turn": 70, "step": 3, "context_tokens": 683985},
        ]
        got = json.dumps(detect_structural_waste(events, requests),
                         ensure_ascii=False, separators=(",", ":"))
        expected = (
            '[{"rule":"SV-COST-01","severity":"info","category":"cost","tool_name":"read",'
            '"evidence":"read 结果在 T1–T3 内容相同（重复 3 次）","seq":2,"time":1002,'
            '"turn":1,"step":1,"call_id":"c1","evidence_recency":"log","waste_tokens":28,'
            '"suggestion":"确认是否需要在每个 turn 重新调用「read」处理「config.yaml」；'
            '如果内容不会变化，可以只调用一次并复用结果。"},'
            '{"rule":"SV-COST-02","severity":"info","category":"cost","tool_name":null,'
            '"evidence":"连续 3 次工具失败（首个 FS_NOT_OBSERVED），T70 期间上下文增长 2092 token",'
            '"seq":440338,"time":441338,"turn":70,"step":2,"call_id":null,'
            '"evidence_recency":"log","waste_tokens":2092,'
            '"suggestion":"检查失败原因（工具参数、权限或环境问题）；'
            '重试前先确认根因，避免同一错误被反复携带进后续上下文。"}]'
        )
        self.assertEqual(got, expected)

    def test_duplicate_waste_is_n_minus_one_copies(self):
        """第一次是必要工作，后续每次是纯浪费——3 次出现，浪费 = 2 份多余拷贝。"""
        events = [
            self._tool_call("read", '{"path":"config.yaml"}', 1, 1, "c1", 1),
            self._tool_result("c1", 1, 1, self.CONTENT, 2),
            self._tool_call("read", '{"path":"config.yaml"}', 2, 1, "c2", 3),
            self._tool_result("c2", 2, 1, self.CONTENT, 4),
            self._tool_call("read", '{"path":"config.yaml"}', 3, 1, "c3", 5),
            self._tool_result("c3", 3, 1, self.CONTENT, 6),
        ]
        out = detect_duplicate_tool_results(events)
        self.assertEqual(len(out), 1)
        one_copy = est_tokens(json.dumps(self.CONTENT, ensure_ascii=False, separators=(",", ":")))
        self.assertEqual(out[0]["waste_tokens"], one_copy * 2)
        self.assertIn("config.yaml", out[0]["suggestion"],
                      "建议文案要点名具体目标，不是空泛的\"建议优化上下文\"")

    def test_same_turn_repeat_does_not_count(self):
        """同一 turn 内调用两次不算"重复"——更像同一工作单元里的正常校验。"""
        events = [
            self._tool_call("read", '{"path":"a"}', 1, 1, "c1", 1),
            self._tool_result("c1", 1, 1, self.CONTENT, 2),
            self._tool_call("read", '{"path":"a"}', 1, 2, "c2", 3),
            self._tool_result("c2", 1, 2, self.CONTENT, 4),
        ]
        self.assertEqual(detect_duplicate_tool_results(events), [])

    def test_same_content_different_args_does_not_count(self):
        """参数不同、结果碰巧一样（比如两次都读到空文件）不算重复。"""
        empty = [{"type": "text", "text": ""}]
        events = [
            self._tool_call("read", '{"path":"a.txt"}', 1, 1, "c1", 1),
            self._tool_result("c1", 1, 1, empty, 2),
            self._tool_call("read", '{"path":"b.txt"}', 2, 1, "c2", 3),
            self._tool_result("c2", 2, 1, empty, 4),
        ]
        self.assertEqual(detect_duplicate_tool_results(events), [])

    def test_no_false_positives_on_all_distinct_calls(self):
        """真实场景的负向测试：不同 (工具,参数) 各自只出现一次——真实日志
        796 组、0 重复，这是同一条纪律的单测版。"""
        events = [
            self._tool_call("read", '{"path":"a"}', 1, 1, "c1", 1),
            self._tool_result("c1", 1, 1, [{"type": "text", "text": "1"}], 2),
            self._tool_call("read", '{"path":"b"}', 2, 1, "c2", 3),
            self._tool_result("c2", 2, 1, [{"type": "text", "text": "2"}], 4),
        ]
        self.assertEqual(detect_duplicate_tool_results(events), [])

    def test_failure_run_waste_measures_context_growth(self):
        """增量是真正付出的代价，不是失败次数本身。"""
        events = [
            self._tool_result_err("c1", 5, 2, "FS_NOT_OBSERVED", 10),
            self._tool_result_err("c2", 5, 2, "FS_NOT_OBSERVED", 11),
            self._tool_result_err("c3", 5, 2, "FS_NOT_OBSERVED", 12),
        ]
        requests = [
            {"request_seq": 1, "turn": 5, "step": 1, "context_tokens": 1000},
            {"request_seq": 2, "turn": 5, "step": 2, "context_tokens": 1200},
            {"request_seq": 3, "turn": 5, "step": 3, "context_tokens": 1900},
        ]
        out = detect_failure_run_waste(events, requests)
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0]["waste_tokens"], 700, "1900-1200，不是失败次数")
        self.assertEqual(out[0]["turn"], 5)
        self.assertEqual(out[0]["step"], 2, "锚点是失败区间的起点")

    def test_failure_run_below_threshold_is_not_reported(self):
        events = [
            self._tool_result_err("c1", 1, 1, "X", 1),
            self._tool_result_err("c2", 1, 1, "X", 2),
        ]
        requests = [
            {"request_seq": 1, "turn": 1, "step": 1, "context_tokens": 100},
            {"request_seq": 2, "turn": 1, "step": 2, "context_tokens": 900},
        ]
        self.assertEqual(detect_failure_run_waste(events, requests), [])

    def test_failure_run_without_matching_request_row_is_skipped(self):
        """找不到匹配的请求行就跳过——不拿其他 turn 的数字硬凑一个假的增量。
        AC-08"缺一不得展示"，数据层同一条纪律。"""
        events = [
            self._tool_result_err("c1", 99, 1, "X", 1),
            self._tool_result_err("c2", 99, 1, "X", 2),
            self._tool_result_err("c3", 99, 1, "X", 3),
        ]
        requests = [{"request_seq": 1, "turn": 1, "step": 1, "context_tokens": 100}]
        self.assertEqual(detect_failure_run_waste(events, requests), [])

    def test_failure_run_with_no_context_growth_is_skipped(self):
        """上下文没有净增长（比如恰好发生了压缩）就不算浪费，不倒扣负数。"""
        events = [
            self._tool_result_err("c1", 1, 1, "X", 1),
            self._tool_result_err("c2", 1, 1, "X", 2),
            self._tool_result_err("c3", 1, 1, "X", 3),
        ]
        requests = [
            {"request_seq": 1, "turn": 1, "step": 1, "context_tokens": 5000},
            {"request_seq": 2, "turn": 1, "step": 2, "context_tokens": 1000},
        ]
        self.assertEqual(detect_failure_run_waste(events, requests), [])

    def test_failure_run_matches_real_session_regression(self):
        """真实数据回归：session-e4b0be69 的失败串在 turn 70 step 2。

        context_tokens 是 uncachedInputTokens + cacheReadTokens——不是只有
        uncached，这个坑我自己手算时踩过一次（只用 inputTokens 算出 2092，
        漏了 cacheReadTokens；跑真实管线才发现完整值是 1964）。这里用完整口径
        的真实数字回归。
        """
        events = [
            self._tool_result_err("c1", 70, 2, "FS_NOT_OBSERVED", 440338),
            self._tool_result_err("c2", 70, 2, "FS_NOT_OBSERVED", 440340),
            self._tool_result_err("c3", 70, 2, "FS_NOT_OBSERVED", 440342),
            self._tool_result_err("c4", 70, 2, "FS_NOT_OBSERVED", 440344),
            self._tool_result_err("c5", 70, 2, "FS_NOT_OBSERVED", 440346),
        ]
        # 681893+1664=683557，683985+1536=685521
        requests = [
            {"request_seq": 1, "turn": 70, "step": 1, "context_tokens": 681742},
            {"request_seq": 2, "turn": 70, "step": 2, "context_tokens": 683557},
            {"request_seq": 3, "turn": 70, "step": 3, "context_tokens": 685521},
        ]
        out = detect_failure_run_waste(events, requests)
        self.assertEqual(out[0]["waste_tokens"], 1964)

    def test_empty_input_gives_empty_output(self):
        self.assertEqual(detect_structural_waste([], []), [])


class TestSkillInvocations(unittest.TestCase):
    """Skill 执行审计（backlog T3）。Rust 侧 `skill::tests::*` 对齐。

    两种触发方式落库形态完全不同（`fixtures/dsh/README.md` 实测验证过）：
    explicit（`user/message`，`data.source.kind=="skill-invocation"`）没有
    二段式 call/result，`load_status` 恒为 "loaded"；model_selected
    （`tool/call name="skill"` 配 `tool/result`）照 `subagent.py` 的 callId
    配对写，结果没到就是 "incomplete"，不是"这次调用没发生"。
    """

    def _invocation(self, seq, time, name):
        return {"type": "user/message", "seq": seq, "time": time,
                "data": {"source": {"kind": "skill-invocation", "name": name}}}

    def _call(self, seq, time, turn, step, cid, name):
        return {"type": "tool/call", "seq": seq, "time": time,
                "data": {"turn": turn, "step": step, "callId": cid, "name": "skill",
                         "arguments": '{"name":"%s"}' % name}}

    def _result_ok(self, seq, time, cid):
        return {"type": "tool/result", "seq": seq, "time": time,
                "data": {"message": {"source": {"kind": "tool", "callId": cid},
                                      "content": [{"type": "tool-result", "isError": False}]}}}

    def _result_infra_error(self, seq, time, cid):
        return {"type": "tool/result", "seq": seq, "time": time,
                "data": {"message": {"source": {"kind": "tool", "callId": cid}, "content": []},
                         "error": {"name": "TimeoutError", "code": "TOOL_TIMEOUT"}}}

    def _result_semantic_error(self, seq, time, cid):
        return {"type": "tool/result", "seq": seq, "time": time,
                "data": {"message": {"source": {"kind": "tool", "callId": cid},
                                      "content": [{"type": "tool-result", "isError": True}]}}}

    def test_byte_for_byte_matches_rust(self):
        """与 Rust `skill::tests::python_rust_byte_for_byte_parity` 钉同一个串。"""
        events = [
            {"type": "turn/start", "seq": 10, "data": {"turn": 3}},
            self._invocation(13, 1750000014000, "release-notes"),
            {"type": "turn/end", "seq": 16, "data": {"turn": 3}},
            self._call(19, 1750000020000, 4, 1, "c1", "commit-summarizer"),
            self._result_ok(20, 1750000020018, "c1"),
        ]
        requests = [
            {"request_seq": 1, "turn": 3, "step": 1},
            {"request_seq": 2, "turn": 4, "step": 1},
        ]
        got = json.dumps(skill_invocations(events, requests), ensure_ascii=False,
                         separators=(",", ":"))
        expected = (
            '[{"name":"release-notes","trigger_mode":"explicit","load_status":"loaded",'
            '"duration_ms":null,"seq":13,"time":1750000014000,"turn":3,"step":null,'
            '"call_id":null,"request_seq":null,"missing_fields":["step","request_seq"]},'
            '{"name":"commit-summarizer","trigger_mode":"model_selected","load_status":"loaded",'
            '"duration_ms":18,"seq":19,"time":1750000020000,"turn":4,"step":1,"call_id":"c1",'
            '"request_seq":2,"missing_fields":[]}]'
        )
        self.assertEqual(got, expected)

    def test_explicit_invocation_is_always_loaded_with_no_duration_concept(self):
        events = [
            {"type": "turn/start", "seq": 10, "data": {"turn": 3}},
            self._invocation(13, 1750000014000, "release-notes"),
            {"type": "turn/end", "seq": 16, "data": {"turn": 3}},
        ]
        out = skill_invocations(events, [])
        self.assertEqual(len(out), 1)
        r = out[0]
        self.assertEqual(r["trigger_mode"], "explicit")
        self.assertEqual(r["load_status"], "loaded")
        self.assertIsNone(r["duration_ms"])
        self.assertEqual(r["turn"], 3)
        self.assertIsNone(r["call_id"])
        self.assertNotIn("duration_ms", r["missing_fields"],
                         "explicit 没有二段式 call/result，耗时是不适用而不是缺失")

    def test_model_selected_loaded_computes_real_world_duration(self):
        """真实量级回归——唯一实测样本 turn:5 step:3，Δt = 18ms。"""
        events = [self._call(19, 1000, 5, 3, "c1", "commit-summarizer"),
                  self._result_ok(20, 1018, "c1")]
        out = skill_invocations(events, [])
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0]["load_status"], "loaded")
        self.assertEqual(out[0]["duration_ms"], 18)
        self.assertEqual(out[0]["turn"], 5)
        self.assertEqual(out[0]["step"], 3)

    def test_model_selected_infra_error_is_failed(self):
        events = [self._call(1, 1000, 1, 1, "c1", "x"), self._result_infra_error(2, 1005, "c1")]
        self.assertEqual(skill_invocations(events, [])[0]["load_status"], "failed")

    def test_model_selected_semantic_error_is_failed(self):
        events = [self._call(1, 1000, 1, 1, "c1", "x"), self._result_semantic_error(2, 1005, "c1")]
        self.assertEqual(skill_invocations(events, [])[0]["load_status"], "failed")

    def test_model_selected_without_result_is_kept_as_incomplete(self):
        """结果没到 ≠ 这次调用没发生——行照留，`duration_ms` 是真的缺失，进 missing_fields。"""
        out = skill_invocations([self._call(1, 1000, 7, 2, "c1", "still-loading")], [])
        self.assertEqual(len(out), 1, "没有回执也要保留这一行")
        self.assertEqual(out[0]["load_status"], "incomplete")
        self.assertIsNone(out[0]["duration_ms"])
        self.assertIn("duration_ms", out[0]["missing_fields"])

    def test_model_selected_unparsable_name_keeps_row_with_missing_field(self):
        """`arguments` 解不出技能名：行照留（call_id 是这条路径的身份锚点），
        name 进 missing_fields。"""
        bad_call = {"type": "tool/call", "seq": 1, "time": 1000,
                    "data": {"turn": 1, "step": 1, "callId": "c1", "name": "skill",
                             "arguments": "not-json"}}
        out = skill_invocations([bad_call], [])
        self.assertEqual(len(out), 1)
        self.assertIsNone(out[0]["name"])
        self.assertEqual(out[0]["call_id"], "c1")
        self.assertIn("name", out[0]["missing_fields"])

    def test_request_seq_resolves_by_exact_turn_step_match(self):
        events = [self._call(19, 1000, 4, 1, "c1", "x"), self._result_ok(20, 1010, "c1")]
        requests = [{"request_seq": 1, "turn": 3, "step": 1},
                    {"request_seq": 2, "turn": 4, "step": 1}]
        out = skill_invocations(events, requests)
        self.assertEqual(out[0]["request_seq"], 2)

    def test_calls_before_fork_belong_to_upstream(self):
        events = [
            self._call(1, 1000, 1, 1, "old", "upstream-skill"),
            self._result_ok(2, 1010, "old"),
            {"type": "session", "seq": None, "data": {"seedLength": 3}},
            self._call(4, 1000, 9, 1, "mine", "own-skill"),
            self._result_ok(5, 1005, "mine"),
        ]
        out = skill_invocations(events, [])
        self.assertEqual(len(out), 1, "分叉前那次是上游触发的，不该算进本会话")
        self.assertEqual(out[0]["name"], "own-skill")

    def test_ignores_other_tools_and_sorts_by_seq(self):
        events = [
            self._call(5, 1000, 2, 1, "c2", "second"),
            self._result_ok(6, 1010, "c2"),
            {"type": "tool/call", "seq": 3, "data": {"callId": "b", "name": "bash",
                                                       "arguments": '{"command":"ls"}'}},
            self._invocation(1, 100, "first"),
        ]
        out = skill_invocations(events, [])
        self.assertEqual(len(out), 2, "bash 调用不是 skill，不进列表")
        self.assertEqual([r["seq"] for r in out], [1, 5], "按 seq 升序，跨两种触发方式")


class TestToolCallDurations(unittest.TestCase):
    """执行时长审计（D1）。Rust 侧 `duration::tests::*` 对齐。

    与 `TestSkillInvocations` 的两点不同：不按工具名过滤（所有带 callId 的
    tool/call 都进来），也不解析 arguments（tool_name 直接来自 data.name）。
    没有 callId 的调用整条跳过——结构上就配不了对，不是"耗时未知"。
    """

    def _call(self, seq, time, turn, step, cid, name):
        return {"type": "tool/call", "seq": seq, "time": time,
                "data": {"turn": turn, "step": step, "callId": cid, "name": name,
                         "arguments": "{}"}}

    def _call_no_name(self, seq, time, cid):
        return {"type": "tool/call", "seq": seq, "time": time, "data": {"callId": cid}}

    def _result_ok(self, seq, time, cid):
        return {"type": "tool/result", "seq": seq, "time": time,
                "data": {"message": {"source": {"kind": "tool", "callId": cid},
                                      "content": [{"type": "tool-result", "isError": False}]}}}

    def _result_infra_error(self, seq, time, cid):
        return {"type": "tool/result", "seq": seq, "time": time,
                "data": {"message": {"source": {"kind": "tool", "callId": cid}, "content": []},
                         "error": {"name": "TimeoutError", "code": "TOOL_TIMEOUT"}}}

    def _result_semantic_error(self, seq, time, cid):
        return {"type": "tool/result", "seq": seq, "time": time,
                "data": {"message": {"source": {"kind": "tool", "callId": cid},
                                      "content": [{"type": "tool-result", "isError": True}]}}}

    def test_byte_for_byte_matches_rust(self):
        """与 Rust `duration::tests::python_rust_byte_for_byte_parity` 钉同一个串。"""
        events = [
            # 没有 callId 就没法配对，也没有 turn/step——incomplete + 三项缺失。
            {"type": "tool/call", "seq": 5, "time": 1000, "data": {"callId": "c2"}},
            self._call(19, 1750000020000, 4, 1, "c1", "bash"),
            self._result_ok(20, 1750000020018, "c1"),
        ]
        got = json.dumps(tool_call_durations(events), ensure_ascii=False, separators=(",", ":"))
        expected = (
            '[{"call_id":"c2","tool_name":null,"load_status":"incomplete","duration_ms":null,'
            '"seq":5,"turn":null,"step":null,'
            '"missing_fields":["tool_name","turn","step","duration_ms"]},'
            '{"call_id":"c1","tool_name":"bash","load_status":"loaded","duration_ms":18,'
            '"seq":19,"turn":4,"step":1,"missing_fields":[]}]'
        )
        self.assertEqual(got, expected)

    def test_computes_duration_for_any_tool_not_just_skill(self):
        events = [self._call(19, 1000, 4, 1, "c1", "bash"), self._result_ok(20, 1018, "c1")]
        out = tool_call_durations(events)
        self.assertEqual(len(out), 1)
        r = out[0]
        self.assertEqual(r["tool_name"], "bash")
        self.assertEqual(r["load_status"], "loaded")
        self.assertEqual(r["duration_ms"], 18)
        self.assertEqual(r["turn"], 4)
        self.assertEqual(r["step"], 1)
        self.assertEqual(r["call_id"], "c1")
        self.assertEqual(r["missing_fields"], [])

    def test_infra_error_is_failed(self):
        events = [self._call(1, 1000, 1, 1, "c1", "bash"), self._result_infra_error(2, 1005, "c1")]
        self.assertEqual(tool_call_durations(events)[0]["load_status"], "failed")

    def test_semantic_error_is_failed(self):
        events = [self._call(1, 1000, 1, 1, "c1", "bash"), self._result_semantic_error(2, 1005, "c1")]
        self.assertEqual(tool_call_durations(events)[0]["load_status"], "failed")

    def test_without_result_is_kept_as_incomplete(self):
        out = tool_call_durations([self._call(1, 1000, 7, 2, "c1", "bash")])
        self.assertEqual(len(out), 1, "没有回执也要保留这一行")
        self.assertEqual(out[0]["load_status"], "incomplete")
        self.assertIsNone(out[0]["duration_ms"])
        self.assertIn("duration_ms", out[0]["missing_fields"])

    def test_call_without_call_id_is_skipped_entirely(self):
        events = [{"type": "tool/call", "seq": 1, "time": 1000, "data": {"name": "bash"}}]
        self.assertEqual(tool_call_durations(events), [])

    def test_missing_tool_name_keeps_row_with_missing_field(self):
        out = tool_call_durations([self._call_no_name(1, 1000, "c1")])
        self.assertEqual(len(out), 1)
        self.assertIsNone(out[0]["tool_name"])
        self.assertEqual(out[0]["call_id"], "c1")
        self.assertIn("tool_name", out[0]["missing_fields"])

    def test_calls_before_fork_belong_to_upstream(self):
        events = [
            self._call(1, 1000, 1, 1, "old", "bash"),
            self._result_ok(2, 1010, "old"),
            {"type": "session", "seq": None, "data": {"seedLength": 3}},
            self._call(4, 1000, 9, 1, "mine", "bash"),
            self._result_ok(5, 1005, "mine"),
        ]
        out = tool_call_durations(events)
        self.assertEqual(len(out), 1, "分叉前那次是上游触发的，不该算进本会话")
        self.assertEqual(out[0]["call_id"], "mine")

    def test_mixed_tools_sort_by_seq(self):
        events = [
            self._call(19, 1000, 4, 1, "c2", "subagent"),
            self._result_ok(20, 1010, "c2"),
            self._call(5, 1000, 1, 1, "c1", "bash"),
            self._result_ok(6, 1010, "c1"),
        ]
        out = tool_call_durations(events)
        self.assertEqual(len(out), 2)
        self.assertEqual([r["seq"] for r in out], [5, 19])
        self.assertEqual(out[0]["tool_name"], "bash")
        self.assertEqual(out[1]["tool_name"], "subagent")

    def test_empty_input_gives_empty_output(self):
        self.assertEqual(tool_call_durations([]), [])


class TestTurnStepDurations(unittest.TestCase):
    """执行时长审计 D2（turn/step 时长）。Rust 侧 `duration::tests::turn_*`/
    `step_*` 对齐。"""

    def _turn_start(self, seq, time, turn):
        return {"type": "turn/start", "seq": seq, "time": time, "data": {"turn": turn}}

    def _turn_end(self, seq, time, turn, kind):
        return {"type": "turn/end", "seq": seq, "time": time,
                "data": {"turn": turn, "reason": {"kind": kind}}}

    def _step_start(self, seq, time, turn, step):
        return {"type": "step/start", "seq": seq, "time": time, "data": {"turn": turn, "step": step}}

    def _step_end(self, seq, time, turn, step):
        return {"type": "step/end", "seq": seq, "time": time, "data": {"turn": turn, "step": step}}

    def test_turn_duration_computes_from_start_end_pair(self):
        events = [self._turn_start(10, 1000, 3), self._turn_end(16, 1500, 3, "completed")]
        out = turn_durations(events)
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0]["duration_ms"], 500)
        self.assertEqual(out[0]["ended_reason"], "completed")
        self.assertEqual(out[0]["load_status"], "loaded")

    def test_turn_without_end_is_kept_as_incomplete(self):
        out = turn_durations([self._turn_start(20, 2000, 4)])
        self.assertEqual(len(out), 1, "没有 turn/end 也要保留这一行")
        self.assertEqual(out[0]["load_status"], "incomplete")
        self.assertIsNone(out[0]["duration_ms"])
        self.assertIn("duration_ms", out[0]["missing_fields"])
        self.assertIn("ended_reason", out[0]["missing_fields"])

    def test_turn_durations_sort_by_turn_number(self):
        events = [
            self._turn_start(20, 2000, 4), self._turn_end(23, 2300, 4, "completed"),
            self._turn_start(10, 1000, 3), self._turn_end(16, 1500, 3, "completed"),
        ]
        out = turn_durations(events)
        self.assertEqual([r["turn"] for r in out], [3, 4])

    def test_turn_durations_byte_for_byte_matches_rust(self):
        events = [
            self._turn_start(10, 1000, 3),
            self._turn_end(16, 1500, 3, "completed"),
            self._turn_start(20, 2000, 4),
        ]
        got = json.dumps(turn_durations(events), ensure_ascii=False, separators=(",", ":"))
        expected = (
            '[{"turn":3,"duration_ms":500,"seq_start":10,"seq_end":16,"ended_reason":"completed",'
            '"load_status":"loaded","missing_fields":[]},'
            '{"turn":4,"duration_ms":null,"seq_start":20,"seq_end":null,"ended_reason":null,'
            '"load_status":"incomplete","missing_fields":["duration_ms","ended_reason"]}]'
        )
        self.assertEqual(got, expected)

    def test_step_duration_computes_from_start_end_pair(self):
        events = [self._step_start(11, 1100, 3, 1), self._step_end(15, 1400, 3, 1)]
        out = step_durations(events)
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0]["duration_ms"], 300)
        self.assertEqual(out[0]["load_status"], "loaded")

    def test_step_without_end_is_kept_as_incomplete(self):
        out = step_durations([self._step_start(21, 2100, 4, 1)])
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0]["load_status"], "incomplete")
        self.assertIn("duration_ms", out[0]["missing_fields"])

    def test_step_number_resets_per_turn_and_does_not_collide(self):
        events = [
            self._step_start(2, 1002, 1, 1), self._step_end(4, 1004, 1, 1),
            self._step_start(7, 1007, 2, 1), self._step_end(9, 1009, 2, 1),
        ]
        out = step_durations(events)
        self.assertEqual(len(out), 2, "(turn=1,step=1) 与 (turn=2,step=1) 是两个不同的 key")

    def test_step_durations_byte_for_byte_matches_rust(self):
        events = [
            self._step_start(11, 1100, 3, 1),
            self._step_end(15, 1400, 3, 1),
            self._step_start(21, 2100, 4, 1),
        ]
        got = json.dumps(step_durations(events), ensure_ascii=False, separators=(",", ":"))
        expected = (
            '[{"turn":3,"step":1,"duration_ms":300,"seq_start":11,"seq_end":15,'
            '"load_status":"loaded","missing_fields":[]},'
            '{"turn":4,"step":1,"duration_ms":null,"seq_start":21,"seq_end":null,'
            '"load_status":"incomplete","missing_fields":["duration_ms"]}]'
        )
        self.assertEqual(got, expected)


class TestApprovalLatencies(unittest.TestCase):
    """执行时长审计 D3（审批等待延迟）。Rust 侧 `duration::tests::*` 对齐。"""

    def _turn_start(self, seq, time, turn):
        return {"type": "turn/start", "seq": seq, "time": time, "data": {"turn": turn}}

    def _asked(self, seq, time, aid, tool_name):
        return {"type": "approval/asked", "seq": seq, "time": time,
                "data": {"id": aid, "toolName": tool_name, "reason": "escalation"}}

    def _decided(self, seq, time, aid, outcome):
        return {"type": "approval/decided", "seq": seq, "time": time,
                "data": {"id": aid, "outcome": outcome}}

    def test_approval_latency_computes_wait_ms_from_id_pairing(self):
        events = [self._turn_start(10, 1000, 3), self._asked(12, 1200, "a1", "bash"),
                  self._decided(13, 1210, "a1", "allowed-once")]
        out = approval_latencies(events)
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0]["wait_ms"], 10)
        self.assertEqual(out[0]["outcome"], "allowed-once")
        self.assertEqual(out[0]["status"], "decided")
        self.assertEqual(out[0]["turn"], 3)

    def test_pairs_by_id_not_callid(self):
        """关联键是 id，不是 callId——asked 事件即便完全没有 callId 字段也要
        能正常配对（fixtures/dsh/README.md 明确点过这个坑）。"""
        asked_no_callid = {"type": "approval/asked", "seq": 1, "time": 1000,
                            "data": {"id": "a1", "toolName": "bash", "reason": "x"}}
        events = [asked_no_callid, self._decided(2, 1010, "a1", "rejected")]
        out = approval_latencies(events)
        self.assertEqual(out[0]["wait_ms"], 10)
        self.assertEqual(out[0]["outcome"], "rejected")

    def test_asked_without_decided_is_pending_not_incomplete(self):
        out = approval_latencies([self._asked(20, 2000, "a2", "write_file")])
        self.assertEqual(len(out), 1, "没有决定也要保留这一行")
        self.assertEqual(out[0]["status"], "pending")
        self.assertIsNone(out[0]["wait_ms"])
        self.assertIsNone(out[0]["outcome"])
        self.assertNotIn("outcome", out[0]["missing_fields"],
                          "还没决定，不该显示成'outcome 缺失'——那是配对失败才有的语义")

    def test_approval_latencies_sort_by_seq(self):
        events = [self._asked(20, 2000, "a2", "x"), self._asked(12, 1200, "a1", "y")]
        out = approval_latencies(events)
        self.assertEqual([r["seq"] for r in out], [12, 20])

    def test_approval_latencies_byte_for_byte_matches_rust(self):
        events = [
            self._turn_start(10, 1000, 3),
            self._asked(12, 1200, "a1", "bash"),
            self._decided(13, 1210, "a1", "allowed-once"),
            self._asked(20, 2000, "a2", "write_file"),
        ]
        got = json.dumps(approval_latencies(events), ensure_ascii=False, separators=(",", ":"))
        expected = (
            '[{"id":"a1","tool_name":"bash","wait_ms":10,"outcome":"allowed-once","status":"decided",'
            '"turn":3,"step":null,"seq":12,"missing_fields":["step"]},'
            '{"id":"a2","tool_name":"write_file","wait_ms":null,"outcome":null,"status":"pending",'
            '"turn":3,"step":null,"seq":20,"missing_fields":["step","wait_ms"]}]'
        )
        self.assertEqual(got, expected)


class TestHookExecutions(unittest.TestCase):
    """执行时长审计 D4（hook 消费）。Rust 侧 `duration::tests::*_hook_*`/
    `hook_executions_*` 对齐。

    ⚠️ 宿主前提尚未验证（DURATION_AUDIT_BACKLOG.md D4）：这层只证明 CLI 侧
    的抽取逻辑正确，不代表 dsh-client 宿主投影已经接了 hook/* 事件——D6 故意
    没把 hook/* 加进 RELEVANT_TYPES。
    """

    def _turn_start(self, seq, time, turn):
        return {"type": "turn/start", "seq": seq, "time": time, "data": {"turn": turn}}

    def _hook_result(self, seq, time, handler_id, point=None, decision=None, duration_ms=None):
        data = {"handlerId": handler_id}
        if point is not None:
            data["point"] = point
        if decision is not None:
            data["decision"] = decision
        if duration_ms is not None:
            data["durationMs"] = duration_ms
        return {"type": "hook/result", "seq": seq, "time": time, "data": data}

    def test_extracts_duration_directly_from_result_no_pairing_needed(self):
        events = [self._turn_start(1, 1000, 1),
                  self._hook_result(9, 1009, "h1", "PreToolUse", "pass", 12)]
        out = hook_executions(events)
        rows = out["executions"]
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["handler_id"], "h1")
        self.assertEqual(rows[0]["point"], "PreToolUse")
        self.assertEqual(rows[0]["decision"], "pass")
        self.assertEqual(rows[0]["duration_ms"], 12)
        self.assertEqual(rows[0]["turn"], 1)
        self.assertEqual(rows[0]["missing_fields"], [])

    def test_missing_handler_id_is_skipped_entirely(self):
        bad = {"type": "hook/result", "seq": 1, "time": 1000, "data": {"point": "PreToolUse"}}
        self.assertEqual(hook_executions([bad])["executions"], [])

    def test_missing_point_decision_duration_go_to_missing_fields(self):
        out = hook_executions([self._hook_result(1, 1000, "h1")])
        row = out["executions"][0]
        self.assertIsNone(row["point"])
        self.assertIsNone(row["decision"])
        self.assertIsNone(row["duration_ms"])
        for f in ["point", "decision", "duration_ms"]:
            self.assertIn(f, row["missing_fields"])

    def test_decision_counts_tally_by_actual_string_value(self):
        events = [
            self._hook_result(1, 1000, "h1", decision="pass", duration_ms=1),
            self._hook_result(2, 1000, "h2", decision="pass", duration_ms=1),
            self._hook_result(3, 1000, "h3", decision="deny", duration_ms=1),
        ]
        counts = hook_executions(events)["decision_counts"]
        self.assertEqual(counts["pass"], 2)
        self.assertEqual(counts["deny"], 1)

    def test_turn_falls_back_to_coord_map_when_not_carried(self):
        events = [self._turn_start(1, 1000, 5), self._hook_result(9, 1009, "h1")]
        self.assertEqual(hook_executions(events)["executions"][0]["turn"], 5)

    def test_hook_executions_byte_for_byte_matches_rust(self):
        events = [
            self._turn_start(1, 1000, 1),
            self._hook_result(9, 1009, "h1", "PreToolUse", "pass", 12),
            self._hook_result(15, 1015, "h2", decision="deny"),
        ]
        got = json.dumps(hook_executions(events), ensure_ascii=False, separators=(",", ":"))
        expected = (
            '{"executions":[{"handler_id":"h1","point":"PreToolUse","decision":"pass",'
            '"duration_ms":12,"turn":1,"seq":9,"missing_fields":[]},'
            '{"handler_id":"h2","point":null,"decision":"deny","duration_ms":null,"turn":1,'
            '"seq":15,"missing_fields":["point","duration_ms"]}],'
            '"decision_counts":{"deny":1,"pass":1}}'
        )
        self.assertEqual(got, expected)

    def test_empty_input_gives_empty_output(self):
        out = hook_executions([])
        self.assertEqual(out["executions"], [])
        self.assertEqual(out["decision_counts"], {})


class TestRequestMetrics(unittest.TestCase):
    """`request_metrics` 的逐字节输出——Rust 侧 `usage.rs` 同名测试要对齐的目标。

    为什么两侧都要钉同一个串：Rust 的
    `request_metrics_python_rust_byte_for_byte_parity` 只是把这个串**硬编码**
    进去，它并不真的跑 Python。所以只有 Rust 那一处的话，Python 单方面改了输出
    仍然全绿——差分是假的。两侧各钉一次，任何一侧动了都会红，才是真差分。

    （`token_by_model` 的活差分另有 `test_cli_matrix.py` 的双二进制逐字节比较；
    `request_metrics` 目前还没接进 CLI，所以这里是它唯一的 Python 侧护栏。）
    """

    EVENTS = [
        {"type": "request/context", "seq": 1, "time": 1001,
         "data": {"provider": "p", "model": "m", "contextWindow": 1000000}},
        {"type": "request/header", "seq": 2, "time": 1002,
         "data": {"header": {"config": {"model": "m"}}}},
        {"type": "assistant/chunk", "seq": 3, "time": 1003,
         "data": {"turn": 1, "step": 1, "chunk": {"type": "usage",
                  "usage": {"inputTokens": 1000, "outputTokens": 200, "cacheReadTokens": 300}}}},
        # 故意缺 cacheReadTokens：验证它与 context_tokens 双双落 null 而不是 0
        {"type": "assistant/chunk", "seq": 4, "time": 1004,
         "data": {"turn": 2, "step": 1, "chunk": {"type": "usage",
                  "usage": {"inputTokens": 2000, "outputTokens": 50}}}},
    ]

    EXPECTED = (
        '[{"request_seq":1,"seq":3,"time":1003,"turn":1,"step":1,"model":"m",'
        '"context_window":1000000,"context_tokens":1300,"uncached_input_tokens":1000,'
        '"output_tokens":200,"cache_read_tokens":300,"cache_write_tokens":null,'
        # is_peak：这笔请求是否落在北京高峰时段。规则留在 core、价格留给调用方，
        # 展示层画逐请求费用曲线时才不必重算一遍（第四份拷贝）。
        '"is_peak":false},'
        '{"request_seq":2,"seq":4,"time":1004,"turn":2,"step":1,"model":"m",'
        '"context_window":1000000,"context_tokens":null,"uncached_input_tokens":2000,'
        '"output_tokens":50,"cache_read_tokens":null,"cache_write_tokens":null,'
        '"is_peak":false}]'
    )

    def test_byte_for_byte_matches_rust(self):
        got = json.dumps(request_metrics(self.EVENTS), ensure_ascii=False,
                         separators=(",", ":"))
        self.assertEqual(got, self.EXPECTED, "键序 / null 位置 / 值必须与 Rust 侧一致")

    def test_missing_field_is_null_not_zero(self):
        """缺字段落 null。落 0 就是把「宿主没报」伪造成「测到 0」。

        实测依据：真实会话 687 个请求点里 13 个缺 cacheReadTokens、687 个全部
        缺 cacheWriteTokens。给这些点补 0，曲线会在缺字段处莫名塌陷。
        """
        row = request_metrics(self.EVENTS)[1]
        self.assertIsNone(row["cache_read_tokens"])
        self.assertIsNone(row["cache_write_tokens"])
        self.assertIsNone(row["context_tokens"], "缺一个加数就整行留空，不拿部分和硬凑")
        self.assertEqual(row["uncached_input_tokens"], 2000, "在场的字段照常给值")

    def test_omits_per_request_compacted_field(self):
        """不输出逐请求的 `compacted` 布尔列——压缩事件类型已确认（见
        `TestCompactionEvents`），但它是**独立于请求**的一类事件（同一 turn 内
        没有对应哪个具体 request），不该硬塞成每行一个 True/False。真正的压缩
        视图是 `compaction_events()` 单独的输出，不是这里的一列。
        """
        self.assertNotIn("compacted", request_metrics(self.EVENTS)[0])

    def test_reconciles_with_token_by_model(self):
        """同源不变量：逐请求四桶之和 == token_by_model 四桶之和。

        证明两者共用同一套 (turn, step) 去重语义。任一侧改了去重都会红。
        真实会话 session-e4b0be69 上也对过：1398 样本去重成 687 请求点，
        四桶之和 226,424,711 / 685,754 / 50,073,856 / 0 两侧完全一致。
        """
        events = [
            {"type": "request/header", "seq": 1,
             "data": {"header": {"config": {"model": "pro"}}}},
            # 同 (1,1)：chunk 先到、message 后到 —— 只算后者
            {"type": "assistant/chunk", "seq": 2,
             "data": {"turn": 1, "step": 1, "chunk": {"type": "usage",
                      "usage": {"inputTokens": 1000, "outputTokens": 200,
                                "cacheReadTokens": 300, "cacheWriteTokens": 0}}}},
            {"type": "assistant/message", "seq": 3,
             "data": {"turn": 1, "step": 1,
                      "usage": {"inputTokens": 1200, "outputTokens": 250,
                                "cacheReadTokens": 300, "cacheWriteTokens": 0}}},
            {"type": "request/header", "seq": 4,
             "data": {"header": {"config": {"model": "flash"}}}},
            {"type": "assistant/chunk", "seq": 5,
             "data": {"turn": 2, "step": 1, "chunk": {"type": "usage",
                      "usage": {"inputTokens": 500, "outputTokens": 50,
                                "cacheReadTokens": 0, "cacheWriteTokens": 0}}}},
        ]
        rows = request_metrics(events)
        self.assertEqual(len(rows), 2, "3 个样本去重成 2 个请求点")
        agg = token_by_model(events)
        for key in ("uncached_input_tokens", "output_tokens",
                    "cache_read_tokens", "cache_write_tokens"):
            self.assertEqual(
                sum(r[key] or 0 for r in rows),
                sum(m[key] for m in agg["by_model"].values()),
                f"{key}: 逐请求之和必须等于按模型之和")
        self.assertEqual(rows[0]["uncached_input_tokens"], 1200, "替换后的值，不是 1000")

    def test_context_window_absent_is_null(self):
        """没有 request/context 就没有分母——不拿任何默认窗口顶替。"""
        rows = request_metrics([
            {"type": "request/header", "seq": 1,
             "data": {"header": {"config": {"model": "m"}}}},
            {"type": "assistant/chunk", "seq": 2,
             "data": {"turn": 1, "step": 1, "chunk": {"type": "usage",
                      "usage": {"inputTokens": 10, "cacheReadTokens": 5}}}},
        ])
        self.assertIsNone(rows[0]["context_window"], "不臆造 128K 之类的默认值")
        self.assertEqual(rows[0]["context_tokens"], 15, "分子照常可算")


if __name__ == "__main__":
    unittest.main(verbosity=2)


class TestForkBoundary(unittest.TestCase):
    """会话分叉边界 —— Rust 侧 `util.rs::fork_tests` 要对齐的目标。

    钉的是一个**真实的重复计费缺陷**：DSH 里从已有会话「branch into new
    conversation」派生的新会话，日志前半段是上游历史的原样拷贝（含上游当时的
    usage 记录）。实测 session-e4b0be69 显示 ¥1113.66，其中 ¥680.36（61%）是
    上游那本账里已经算过一次的钱。
    """

    @staticmethod
    def _ev(t, seq):
        return {"type": t, "seq": seq, "data": {}}

    @staticmethod
    def _header(seed=None):
        return {"type": "session", "seq": None,
                "data": {"seedLength": seed} if seed is not None else {}}

    def test_boundary_comes_from_header_seed_length(self):
        evs = [self._header(3), self._ev("tool/call", 1),
               self._ev("tool/call", 2), self._ev("tool/call", 4)]
        self.assertEqual(fork_boundary(evs), 3)
        self.assertEqual([e["seq"] for e in post_fork(evs) if e["seq"] is not None], [4],
                         "分叉前的 seq 1/2 必须滤掉")

    def test_end_seed_event_is_not_a_boundary(self):
        """**`session/end-seed` 不是分叉边界。**

        初版就是那么判的，还在一个已分叉的会话上验证通过——那是巧合。这个标记
        的是「一段续种结束」，会话每次被唤醒都会触发：真实日志 session-6b47acc7
        完全没分叉（header 无 seedLength），唯一的 end-seed 落在**最后一个事件**
        上。按事件判会把整个会话丢光，UI 上费用/上下文/常驻前缀/子代理全变
        「不可用」——这个回归是用户在真机上发现的。
        """
        # **没有 header 标记事件**——适配器只在 seedLength > 0 时才合成一个，
        # 未分叉的会话流里压根没有它。夹具必须是这个形状，否则 header 分支会
        # 先 return，测试永远走不到 end-seed，红-绿验证也会假绿。
        evs = [self._ev("tool/call", 1), self._ev("tool/call", 2),
               self._ev("session/end-seed", 3)]
        self.assertIsNone(fork_boundary(evs), "没有 seedLength 就是没分叉")
        self.assertEqual(len(post_fork(evs)), 3, "未分叉的会话一个事件都不能滤")

    def test_missing_header_or_field_means_no_fork(self):
        """没有日志头（或头里没这个字段）时同样不滤——子代理会话就是这样。"""
        no_header = [self._ev("tool/call", 0), self._ev("tool/call", 1)]
        self.assertIsNone(fork_boundary(no_header))
        self.assertEqual(len(post_fork(no_header)), 2)
        no_field = [self._header(), self._ev("tool/call", 1)]
        self.assertIsNone(fork_boundary(no_field))
        self.assertEqual(len(post_fork(no_field)), 2)

    def test_zero_seed_length_is_not_a_boundary(self):
        """0 或负数不是有效边界——那是「没有续种」，不是「续种了 0 个事件」。"""
        self.assertIsNone(fork_boundary([self._header(0)]))
        self.assertIsNone(fork_boundary([self._header(-1)]))

    def test_missing_seq_survives(self):
        """缺 seq 是「没上报」，不是「在分叉之前」——不得静默丢掉。"""
        evs = [self._header(5), {"type": "tool/call", "data": {}}, self._ev("tool/call", 6)]
        self.assertEqual(len(post_fork(evs)), 3)


class TestPeakSlotWeekday(unittest.TestCase):
    """高峰/空闲时段判定 —— 真实账单打出来的回归 + 通用性证明。

    起因：2026-08-23（周日）14:45 那次会话，29 次请求的 token 数与 DeepSeek
    账单逐位吻合，金额却正好 ×2.0000。原来的判定只看小时不看星期，把周日下午
    当成了高峰，而每一档 peak 恰好是 off_peak 的两倍。

    更值得记的是**它为什么一直没被发现**：在这之前唯一对过账的会话跑在 21–22
    点，全程走空闲分支——高峰这条路径从来没被任何真实账单验证过。
    """

    def test_weekend_is_always_off_peak(self):
        """周末全天空闲，即使落在 9–12 / 14–18 的钟点内。"""
        from skill_vitals.usage import _is_peak_slot
        # 北京时间的确定性时间戳
        self.assertTrue(_is_peak_slot(1787277600000), "周五 10:00 是高峰")
        self.assertTrue(_is_peak_slot(1787554800000), "周一 15:00 是高峰")
        self.assertFalse(_is_peak_slot(1787364000000), "周六 10:00 —— 周末全天空闲")
        self.assertFalse(_is_peak_slot(1787464800000), "周日 14:00 —— 打出这个 bug 的那一刻")
        self.assertFalse(_is_peak_slot(1787572800000), "周一 20:00 在窗口外")

    def test_weekday_formula_matches_stdlib_across_130_years(self):
        """星期换算是**纯算术**，不是查表，也没有写死任何一个周末。

        这条是对「能不能一直准」的正面回答：拿标准库当参照，逐日核对
        1970→2100 的每一天（各取 00:00 / 12:00 / 23:59 三个时刻）。闰年、
        世纪边界、跨年全都覆盖——因为算法根本不做日历运算，只在绝对秒数上
        做整除，这些情况对它不存在。
        """
        import datetime
        from skill_vitals.usage import _beijing_weekday
        BJ = 8 * 3600
        epoch = datetime.datetime(1970, 1, 1)
        d, end = epoch, datetime.datetime(2100, 1, 1)
        checked = 0
        while d < end:
            base = int((d - epoch).total_seconds()) * 1000 - BJ * 1000
            for off in (0, 12 * 3600 * 1000, 86399 * 1000):
                ms = base + off
                ref = datetime.datetime.utcfromtimestamp(ms / 1000 + BJ).weekday()
                self.assertEqual(_beijing_weekday(ms), ref,
                                 "北京时间 %s 星期算错" % datetime.datetime.utcfromtimestamp(ms / 1000 + BJ))
                checked += 1
            d += datetime.timedelta(days=1)
        self.assertGreater(checked, 140000, "覆盖面不应缩水")

    def test_negative_timestamps_before_1970(self):
        """1970 之前的负时间戳也要对——Python 的 // 和 % 本身就是向下取整/
        取正余数，Rust 侧用 div_euclid/rem_euclid 取得同样语义。"""
        import datetime
        from skill_vitals.usage import _beijing_weekday
        BJ = 8 * 3600
        for year in (1969, 1960, 1900):
            dt = datetime.datetime(year, 3, 1)
            ms = int((dt - datetime.datetime(1970, 1, 1)).total_seconds()) * 1000 - BJ * 1000
            ref = datetime.datetime.utcfromtimestamp(ms / 1000 + BJ).weekday()
            self.assertEqual(_beijing_weekday(ms), ref, "%d 年算错" % year)
