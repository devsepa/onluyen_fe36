// Clock & Greeting Widget (Tumadam style)
// Dynamic live clock with period styling, glowing borders, auto-sliding greetings, and floating weather icon

const PERIODS = [
  { id: 'midnight',  from:  0, to:  5, icon: '✨', greeting: 'Good Night! 🌙' },
  { id: 'dawn',      from:  5, to:  9, icon: '🌅', greeting: 'Good Morning! 🌿' },
  { id: 'morning',   from:  9, to: 12, icon: '☀️', greeting: 'Good Morning! ⚡' },
  { id: 'noon',      from: 12, to: 14, icon: '🍱', greeting: 'Good Noon! 🍱' },
  { id: 'afternoon', from: 14, to: 18, icon: '🌦️', greeting: 'Good Afternoon! 🌿' },
  { id: 'evening',   from: 18, to: 22, icon: '🌇', greeting: 'Good Evening! 🌿' },
  { id: 'night',     from: 22, to: 24, icon: '🌙', greeting: 'Good Night! ✨' },
];

export function getPeriod(h) {
  return PERIODS.find(p => h >= p.from && h < p.to) || PERIODS[4]; // default afternoon
}

export function formatTime(date = new Date()) {
  const pad = n => String(n).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function formatDateTooltip(date = new Date()) {
  const days = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
  const dayName = days[date.getDay()];
  const pad = n => String(n).padStart(2, '0');
  return `${dayName}, ${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

export function renderClockPillHtml(extraClass = '') {
  const now = new Date();
  const p = getPeriod(now.getHours());
  const timeStr = formatTime(now);
  const tooltip = formatDateTooltip(now);

  return `
    <div class="clock-widget tumadam-clock-pill period-${p.id} ${extraClass}" title="${tooltip}" role="timer" aria-label="Đồng hồ học tập">
      <div class="clock-greeting" id="clockGreeting">${p.greeting}</div>
      <div class="clock-time" id="clockTime">${timeStr}</div>
      <div class="clock-period-icon clock-weather" id="clockIcon">
        <span class="clock-icon-symbol">${p.icon}</span>
      </div>
    </div>
  `;
}

let delegationAttached = false;

export function setupClockWidget() {
  let lastPeriodId = null;
  let hideGreetingTimer = null;

  function getAllWidgets() {
    return document.querySelectorAll('.clock-widget, .tumadam-clock-pill');
  }

  function triggerGreetingSlide() {
    const widgets = getAllWidgets();
    widgets.forEach(w => {
      const g = w.querySelector('.clock-greeting');
      if (g) g.classList.remove('hide');
    });

    if (hideGreetingTimer) clearTimeout(hideGreetingTimer);
    hideGreetingTimer = setTimeout(() => {
      const activeWidgets = getAllWidgets();
      activeWidgets.forEach(w => {
        // Do not hide if currently hovered
        if (!w.matches(':hover')) {
          const g = w.querySelector('.clock-greeting');
          if (g) g.classList.add('hide');
        }
      });
    }, 8000);
  }

  function tick() {
    const now = new Date();
    const p = getPeriod(now.getHours());
    const timeStr = formatTime(now);
    const tooltip = formatDateTooltip(now);

    const widgets = getAllWidgets();
    widgets.forEach(w => {
      w.title = tooltip;

      // Update period class if changed
      if (p.id !== lastPeriodId) {
        PERIODS.forEach(item => w.classList.remove(`period-${item.id}`));
        w.classList.add(`period-${p.id}`);
      }

      const timeEl = w.querySelector('.clock-time');
      if (timeEl && timeEl.textContent !== timeStr) {
        timeEl.textContent = timeStr;
      }

      const greetEl = w.querySelector('.clock-greeting');
      if (greetEl && !greetEl.dataset.customized && greetEl.textContent !== p.greeting) {
        greetEl.textContent = p.greeting;
      }

      const iconEl = w.querySelector('.clock-period-icon, .clock-weather');
      if (iconEl) {
        const symbolEl = iconEl.querySelector('.clock-icon-symbol');
        if (symbolEl) {
          if (symbolEl.textContent !== p.icon) symbolEl.textContent = p.icon;
        } else if (iconEl.textContent !== p.icon) {
          iconEl.textContent = p.icon;
        }
      }
    });

    lastPeriodId = p.id;
  }

  // Event delegation: works seamlessly for any widgets added dynamically (e.g. during practice/quiz)
  if (!delegationAttached && typeof document !== 'undefined') {
    delegationAttached = true;

    document.addEventListener('mouseover', e => {
      const widget = e.target.closest('.clock-widget, .tumadam-clock-pill');
      if (widget) {
        const g = widget.querySelector('.clock-greeting');
        if (g) g.classList.remove('hide');
      }
    });

    document.addEventListener('mouseout', e => {
      const widget = e.target.closest('.clock-widget, .tumadam-clock-pill');
      if (widget && !widget.contains(e.relatedTarget)) {
        const g = widget.querySelector('.clock-greeting');
        if (g) g.classList.add('hide');
      }
    });

    document.addEventListener('click', e => {
      const widget = e.target.closest('.clock-widget, .tumadam-clock-pill');
      if (widget) {
        triggerGreetingSlide();
      }
    });
  }

  // Initial tick & start 8s greeting timer
  tick();
  triggerGreetingSlide();
  const timer = setInterval(tick, 1000);

  return () => {
    clearInterval(timer);
    if (hideGreetingTimer) clearTimeout(hideGreetingTimer);
  };
}
