const periods = {
  month: { tokens: '127.4', cost: '38.60', cache: '96.8', sessions: '42 个会话 · 2 个工具', label: '本月', axis: ['09.01', '09.15', '09.28'], bars: [25, 34, 21, 49, 42, 68, 38, 57, 84, 46, 37, 65, 51, 94, 73, 54, 69, 41, 59, 76, 52] },
  week: { tokens: '32.8', cost: '9.40', cache: '97.2', sessions: '11 个会话 · 2 个工具', label: '本周', axis: ['09.22', '09.25', '09.28'], bars: [35, 54, 83, 42, 63, 91, 49] },
};

function renderPeriod(period) {
  const value = periods[period];
  if (!value) return;
  document.querySelector('#demo-tokens').innerHTML = `${value.tokens}<span>M</span>`;
  document.querySelector('#demo-cost').innerHTML = `<span>¥</span>${value.cost}`;
  document.querySelector('#demo-cache').innerHTML = `${value.cache}<span>%</span>`;
  document.querySelector('#demo-sessions').textContent = value.sessions;
  document.querySelectorAll('[data-period]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.period === period)));
  const bars = document.querySelector('#chart-bars');
  bars.replaceChildren(...value.bars.map((height, index) => {
    const column = document.createElement('div');
    column.className = `chart-column${height > 90 ? ' highlight' : ''}`;
    const codex = 20 + ((index * 13) % 26);
    column.style.setProperty('--height', `${height}%`);
    column.style.setProperty('--claude', `${100 - codex}%`);
    column.style.setProperty('--codex', `${codex}%`);
    column.append(document.createElement('b'), document.createElement('i'));
    column.setAttribute('aria-hidden', 'true');
    return column;
  }));
  document.querySelector('.chart').setAttribute('aria-label', `${value.label}示例用量趋势，柱状图中绿色为 Claude Code、浅绿色为 Codex`);
  ['start', 'middle', 'end'].forEach((name, index) => { document.querySelector(`#axis-${name}`).textContent = value.axis[index]; });
}

document.querySelectorAll('[data-period]').forEach(button => button.addEventListener('click', () => renderPeriod(button.dataset.period)));
renderPeriod('month');

const dialog = document.querySelector('#session-dialog');
const inspectButton = document.querySelector('#inspect-session');
inspectButton.addEventListener('click', () => { dialog.showModal(); });
dialog.querySelectorAll('.close-button, .dialog-done').forEach(button => button.addEventListener('click', () => dialog.close()));
dialog.addEventListener('click', event => {
  const bounds = dialog.getBoundingClientRect();
  if (event.target === dialog && (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom)) dialog.close();
});
dialog.addEventListener('close', () => inspectButton.focus({ preventScroll: true }));
