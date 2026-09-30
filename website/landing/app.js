// 演示交互：时间范围切换、示例会话轨迹、动效开关。纯本地，无网络、无遥测。
// 回归记录：b1621514（i18n）曾把本文件从 85 行误删成 2 行——周期切换、图表柱、会话弹窗、
// 动效开关全部失效，而 verify-landing 只做静态检查没有报警。现已恢复，并由
// tools/verify-landing.mjs 的行为断言守住（见该脚本「演示脚本」一节）。
const LANG = window.__avLandingLang || { lang: 'en', t: () => '', demoSessions: () => '', chartAria: () => '' };
const zh = LANG.lang === 'zh';
const pick = (en, cn) => (zh ? cn : en);

const periods = {
  month: { tokens: '127.4', cost: '38.60', cache: '96.8', sessions: [42, 2], label: pick('This month', '本月'), axis: ['09.01', '09.15', '09.28'], flag: 13, bars: [25, 34, 21, 49, 42, 68, 38, 57, 84, 46, 37, 65, 51, 94, 73, 54, 69, 41, 59, 76, 52] },
  week: { tokens: '32.8', cost: '9.40', cache: '97.2', sessions: [11, 2], label: pick('This week', '本周'), axis: ['09.22', '09.25', '09.28'], flag: 5, bars: [35, 54, 83, 42, 63, 91, 49] },
};

function renderPeriod(period) {
  const value = periods[period];
  if (!value) return;
  document.querySelector('#demo-tokens').innerHTML = `${value.tokens}<small>M</small>`;
  document.querySelector('#demo-cost').innerHTML = `<small>¥</small>${value.cost}`;
  document.querySelector('#demo-cache').innerHTML = `${value.cache}<small>%</small>`;
  document.querySelector('#demo-sessions').textContent = LANG.demoSessions(value.sessions[0], value.sessions[1]);
  document.querySelectorAll('[data-period]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.period === period)));
  const bars = document.querySelector('#chart-bars');
  bars.replaceChildren(...value.bars.map((height, index) => {
    const column = document.createElement('div');
    column.className = `bar${index === value.flag ? ' flagged' : ''}`;
    const codex = 20 + ((index * 13) % 26);
    column.style.setProperty('--h', `${height}%`);
    column.style.setProperty('--codex', `${codex}%`);
    column.append(document.createElement('i'), document.createElement('b'));
    return column;
  }));
  document.querySelector('.chart').setAttribute('aria-label', LANG.chartAria(value.label));
  ['start', 'middle', 'end'].forEach((name, index) => { document.querySelector(`#axis-${name}`).textContent = value.axis[index]; });
}
document.querySelectorAll('[data-period]').forEach(button => button.addEventListener('click', () => renderPeriod(button.dataset.period)));
renderPeriod('month');

// 示例会话轨迹（虚构任务；只陈述记录，不推算浪费金额）
const dialog = document.querySelector('#session-dialog');
const trace = dialog.querySelector('.event-trace');
const evidence = dialog.querySelector('.trace-evidence');
const traceEvents = zh ? [
  ['09:41:02', '开始读取', '读取参考材料', '本地记录显示工具开始读取材料。事件存在不等于材料准确或任务已完成。'],
  ['09:41:08', '调用失败', '工具返回超时', '首次失败：记录的错误类型为 timeout。这里只显示分类，不展示原始参数。'],
  ['09:41:16', '重试失败', '相同调用再次失败', '第二次失败：相同调用指纹、相同错误分类。值得核对是否需要更换输入或等待。'],
  ['09:41:32', '再次失败', '连续三次失败', '第三次失败：这是一个检查线索，不据此推算浪费金额，也不自动判定 Agent 有问题。'],
  ['09:42:10', '恢复执行', '工具返回成功', '记录显示后续调用成功。工具成功不代表最终研究结论正确，结果仍需人工验收。'],
] : [
  ['09:41:02', 'Read started', 'Reading reference material', 'The local record shows the tool started reading material. An event existing does not mean the material is accurate or the task is done.'],
  ['09:41:08', 'Call failed', 'Tool returned a timeout', 'First failure: the recorded error type is timeout. Only the category is shown here, never the raw arguments.'],
  ['09:41:16', 'Retry failed', 'Same call failed again', 'Second failure: same call fingerprint, same error category. Worth checking whether the input should change or to wait.'],
  ['09:41:32', 'Failed again', 'Three failures in a row', 'Third failure: this is a lead to check — it does not estimate wasted money and does not judge the agent as faulty.'],
  ['09:42:10', 'Resumed', 'Tool returned success', 'The record shows later calls succeeded. A tool succeeding does not mean the final research conclusion is correct; the result still needs human review.'],
];
function selectEvent(index) {
  trace.querySelectorAll('button').forEach((button, position) => button.setAttribute('aria-pressed', String(position === index)));
  const title = document.createElement('strong');
  title.textContent = traceEvents[index][2];
  const description = document.createElement('p');
  description.textContent = traceEvents[index][3];
  evidence.replaceChildren(title, description);
}
traceEvents.forEach((event, index) => {
  const button = document.createElement('button');
  button.type = 'button';
  const time = document.createElement('small');
  time.textContent = event[0];
  button.append(time, document.createTextNode(event[1]));
  if (index > 0 && index < 4) button.dataset.failed = '';
  button.addEventListener('click', () => selectEvent(index));
  trace.append(button);
});
selectEvent(3);

const inspectButton = document.querySelector('#inspect-session');
inspectButton.addEventListener('click', () => dialog.showModal());
dialog.querySelectorAll('.close-button, .dialog-done').forEach(button => button.addEventListener('click', () => dialog.close()));
dialog.addEventListener('click', event => {
  const bounds = dialog.getBoundingClientRect();
  if (event.target === dialog && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) dialog.close();
});
dialog.addEventListener('close', () => inspectButton.focus({ preventScroll: true }));

// 动效开关：ascii-scenes.js 监听 body.motion-paused
const motionButton = document.querySelector('#motion-toggle');
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
let pausedByUser = false;
function updateMotion() {
  const paused = pausedByUser || reducedMotion.matches;
  document.body.classList.toggle('motion-paused', paused || document.hidden);
  motionButton.setAttribute('aria-pressed', String(paused));
  motionButton.textContent = reducedMotion.matches ? pick('Reduced motion on', '已减少动效') : paused ? pick('Resume motion', '播放动效') : pick('Pause motion', '暂停动效');
  motionButton.disabled = reducedMotion.matches;
}
motionButton.addEventListener('click', () => { pausedByUser = !pausedByUser; updateMotion(); });
reducedMotion.addEventListener('change', updateMotion);
document.addEventListener('visibilitychange', updateMotion);
updateMotion();
