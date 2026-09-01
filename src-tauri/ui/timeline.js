// 通用轨迹时间线几何 —— docs/TRAJECTORY_TIMELINE_SPEC.md §4/§5 的纯函数实现。
//
// 无 DOM、无构建链、无依赖：工作台直接 `<script src>`，node 的 verify 脚本直接
// `require`（文件尾的 module.exports）。这里是「几何只写一份」的那一份——比例尺
// 算错了不报错、只有人眼看出来，所以必须能下断言（scripts/verify-timeline-
// geometry.mjs），否则三份前端各写一份就是三份会静默画错的图。
//
// 两条不能破的语义（spec §5 不变量 5，从 DSH timeline.ts 与 Codex svTimelineSvg
// 各自踩过的坑收敛而来）：
//   1. **缺数据留缺口，不连直线**——但只对"原始值"序列（context 这类）。累计序列
//      （token/cost）缺的是"这一笔加了多少"，不是"总数归零了"，所以沿用上一格、
//      不产生缺口，缺口改由 measured/total 披露（DSH timeline.ts 的 tokens/cost
//      模式就是这么做的）。
//   2. **事件标记永不参与聚合**——曲线可以按显示宽度抽稀，风险/浪费/压缩这些标记
//      一个不丢（eventsIn === eventsOut）。抽掉一次 rm -rf 不行。

(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.TimelineGeometry = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var DEFAULTS = { width: 800, height: 130, pad: 26 };

  function fmt(n) {
    return Math.round(n * 10) / 10;
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function num(n) {
    return (n == null ? 0 : Number(n)).toLocaleString("en-US");
  }

  // 序列的取值函数：cumulative 序列缺值时沿用上一格，原始值序列缺值返回 null（断开）。
  function buildSeriesValues(points, name, cumulative) {
    var out = new Array(points.length);
    var measured = 0;
    var last = null;
    for (var i = 0; i < points.length; i++) {
      var v = points[i].values ? points[i].values[name] : null;
      v = v == null ? null : Number(v);
      if (v != null) {
        if (cumulative) { last = (last == null ? 0 : last) + v; out[i] = last; }
        else { out[i] = v; }
        measured++;
      } else if (cumulative) {
        // 累计序列缺行沿用上一格：缺的是"这一笔加了多少"，不是总数归零。
        out[i] = last;
      } else {
        out[i] = null;
      }
    }
    return { values: out, measured: measured };
  }

  function seriesNames(spec) {
    if (spec.series && spec.series.length) return spec.series;
    if (!spec.points.length) return [];
    var names = Object.keys(spec.points[0].values || {});
    return names.map(function (n) { return { name: n, label: n, cumulative: false }; });
  }

  /**
   * buildTimeline(spec) -> SVG 字符串（或空态 <div>）。
   *
   * spec = {
   *   points: [{ ordinal, ts?, task_id?, values: { name: number|null } }],  // 已按 ordinal 升序
   *   events: [{ ordinal, kind, label, severity?, targetId? }],             // 与 points 正交
   *   series: [{ name, label, cumulative? }],                               // 缺省 = 第一个 point 的 values 键
   *   width, height, pad,
   * }
   *
   * 返回的 SVG 用 `.tl-*` 类 + data-kind/data-severity 供前端样式与交互；事件标记
   * 恒被画出来（不聚合、不抽稀），每个事件一个 <g class="tl-event">。
   */
  function buildTimeline(spec) {
    var points = spec.points || [];
    var events = spec.events || [];
    var W = spec.width || DEFAULTS.width;
    var H = spec.height || DEFAULTS.height;
    var PAD = spec.pad || DEFAULTS.pad;
    var n = points.length;

    if (n === 0) {
      return '<div class="tl-empty">无时间线数据（该宿主没有带时间/序号的可画点）。</div>';
    }

    var series = seriesNames(spec);
    if (series.length === 0) {
      return '<div class="tl-empty">无时间线数据（没有可画的序列）。</div>';
    }

    // ordinal → 数组下标（events 用 ordinal 定位；定位不到就跳过，不画在猜的位置上）。
    var idxOf = {};
    for (var i = 0; i < n; i++) idxOf[points[i].ordinal] = i;

    // 每个序列的取值 + 测量计数。
    var cols = series.map(function (s) {
      var v = buildSeriesValues(points, s.name, !!s.cumulative);
      return { series: s, values: v.values, measured: v.measured };
    });
    var measuredTotal = cols.reduce(function (a, c) { return a + c.measured; }, 0);
    if (measuredTotal === 0) {
      return '<div class="tl-empty">无时间线数据（所有序列都没有测量值）。</div>';
    }

    // y 轴上限：全序列的最大值。原始值序列与累计序列混画时取 max（累计通常更大）。
    var yMax = 0;
    for (var c = 0; c < cols.length; c++) {
      for (var j = 0; j < cols[c].values.length; j++) {
        var v = cols[c].values[j];
        if (v != null && v > yMax) yMax = v;
      }
    }
    if (yMax <= 0) yMax = 1;

    var xAt = function (i) { return n === 1 ? W / 2 : PAD + (i / (n - 1)) * (W - PAD * 2); };
    var yFor = function (v) { return H - PAD - (v / yMax) * (H - PAD * 2); };

    // 单点退化：折线的 X(i) 恒等于 PAD，line 是零长线段、area 是零宽三角形（Codex
    // svTimelineSvg 踩过的坑：session 01a029cb 单小时桶「时间线没有渲染」）。单点改
    // 画居中柱，恒非退化。
    var body = "";
    var ylabel = "";
    if (n === 1) {
      var single = cols[0].values[0] != null ? cols[0].values[0] : 0;
      var bw = Math.min((H - PAD * 2) * 0.4, 48);
      var top = yFor(single);
      var barH = (single / yMax) * (H - PAD * 2);
      body = '<rect class="tl-bar" x="' + fmt(W / 2 - bw / 2) + '" y="' + fmt(top) +
        '" width="' + fmt(bw) + '" height="' + fmt(barH) + '" rx="4"/>' +
        '<text class="tl-axis" x="' + fmt(W / 2) + '" y="' + fmt(top - 6) + '" text-anchor="middle">' +
        num(single) + '</text>';
    } else {
      // 每个序列一条 path；原始值序列缺值断开成多段（多个 M），累计序列连成一段。
      var paths = [];
      var area = "";
      for (var k = 0; k < cols.length; k++) {
        var segs = [];
        var cur = [];
        var vals = cols[k].values;
        for (var p = 0; p < n; p++) {
          if (vals[p] == null) {
            if (cur.length) { segs.push(cur); cur = []; }
          } else {
            cur.push([xAt(p), yFor(vals[p])]);
          }
        }
        if (cur.length) segs.push(cur);
        var d = segs.map(function (seg) {
          return seg.map(function (pt, idx2) {
            return (idx2 === 0 ? "M" : "L") + fmt(pt[0]) + " " + fmt(pt[1]);
          }).join(" ");
        }).join(" ");
        paths.push('<path class="tl-line" data-series="' + esc(cols[k].series.name) + '" d="' + d + '"/>');
        // 只给第一个序列画面积填充（多序列叠加面积会糊成一片）。
        if (k === 0 && segs.length) {
          var flat = [];
          for (var s = 0; s < segs.length; s++) flat = flat.concat(segs[s]);
          area = '<path class="tl-area" d="M' + fmt(flat[0][0]) + ' ' + fmt(yFor(0)) + ' ' +
            flat.map(function (pt) { return "L" + fmt(pt[0]) + " " + fmt(pt[1]); }).join(" ") +
            ' L' + fmt(flat[flat.length - 1][0]) + ' ' + fmt(yFor(0)) + ' Z"/>';
        }
      }
      body = area + paths.join("");
      ylabel = '<text class="tl-axis" x="8" y="' + fmt(yFor(yMax)) + '">' + num(yMax) + '</text>';
    }

    // 事件标记：每个事件一个 <g>，永不聚合。定位不到 ordinal 就跳过（不画在猜的位置）。
    var evMarkers = "";
    for (var e = 0; e < events.length; e++) {
      var ev = events[e];
      var idx = idxOf[ev.ordinal];
      if (idx == null) continue;
      var x = xAt(idx);
      evMarkers += '<g class="tl-event" data-kind="' + esc(ev.kind) + '"' +
        (ev.severity ? ' data-severity="' + esc(ev.severity) + '"' : "") +
        (ev.targetId ? ' data-target="' + esc(ev.targetId) + '"' : "") + '>' +
        '<title>' + esc(ev.label || ev.kind) + '</title>' +
        '<line x1="' + fmt(x) + '" y1="' + fmt(PAD) + '" x2="' + fmt(x) + '" y2="' + fmt(H - PAD) + '" class="tl-event-tick"/>' +
        '<circle cx="' + fmt(x) + '" cy="' + fmt(PAD) + '" r="3.5" class="tl-event-dot"/>' +
        '</g>';
    }

    // x 轴标签：首 / 中 / 末三个点的 task_id 或序号。
    var xLabels = "";
    if (n > 1) {
      var labelIdx = [0, Math.floor((n - 1) / 2), n - 1];
      xLabels = labelIdx.map(function (i) {
        var pt = points[i];
        var lab = pt.task_id != null ? "T" + pt.task_id : String(pt.ordinal);
        return '<text class="tl-axis" x="' + fmt(xAt(i)) + '" y="' + fmt(H - 8) + '" text-anchor="middle">' +
          esc(lab) + '</text>';
      }).join("");
    }

    return '<svg class="tl-chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="会话时间线">' +
      '<line class="tl-grid" x1="' + PAD + '" y1="' + fmt(yFor(0)) + '" x2="' + fmt(W - PAD) + '" y2="' + fmt(yFor(0)) + '"/>' +
      '<line class="tl-grid" x1="' + PAD + '" y1="' + fmt(yFor(yMax)) + '" x2="' + fmt(W - PAD) + '" y2="' + fmt(yFor(yMax)) + '"/>' +
      body + ylabel + evMarkers + xLabels +
      '</svg>';
  }

  return { buildTimeline: buildTimeline };
});
