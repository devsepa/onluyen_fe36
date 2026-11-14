// Clock & Greeting Widget (Tumadam style)
// Displays: Good Afternoon! 🌿 17:30:03 🌦️ on desktop, and 17:31:05 🌦️ on mobile

function getGreeting(date = new Date()) {
  const h = date.getHours();
  if (h >= 5 && h < 12) {
    return { text: "Good Morning!", leaf: "🌿", icon: "⛅" };
  } else if (h >= 12 && h < 18) {
    return { text: "Good Afternoon!", leaf: "🌿", icon: "🌦️" };
  } else if (h >= 18 && h < 22) {
    return { text: "Good Evening!", leaf: "🌿", icon: "🌙" };
  } else {
    return { text: "Good Night!", leaf: "🌿", icon: "✨" };
  }
}

function formatTime(date = new Date()) {
  const pad = n => String(n).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function formatDateTooltip(date = new Date()) {
  const days = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
  const dayName = days[date.getDay()];
  const pad = n => String(n).padStart(2, '0');
  return `${dayName}, ${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
}

export function renderClockPillHtml() {
  const now = new Date();
  const info = getGreeting(now);
  const timeStr = formatTime(now);
  const tooltip = formatDateTooltip(now);

  return `
    <div class="tumadam-clock-pill" title="${tooltip}">
      <span class="clock-greeting">${info.text} ${info.leaf}</span>
      <span class="clock-time">${timeStr}</span>
      <span class="clock-weather">${info.icon}</span>
    </div>
  `;
}

export function setupClockWidget() {
  function tick() {
    const now = new Date();
    const info = getGreeting(now);
    const timeStr = formatTime(now);
    const tooltip = formatDateTooltip(now);

    document.querySelectorAll('.tumadam-clock-pill').forEach(pill => {
      pill.title = tooltip;
      const greetingEl = pill.querySelector('.clock-greeting');
      if (greetingEl) greetingEl.textContent = `${info.text} ${info.leaf}`;
      const timeEl = pill.querySelector('.clock-time');
      if (timeEl) timeEl.textContent = timeStr;
      const weatherEl = pill.querySelector('.clock-weather');
      if (weatherEl) weatherEl.textContent = info.icon;
    });
  }

  // Initial tick & interval
  tick();
  const timer = setInterval(tick, 1000);
  return () => clearInterval(timer);
}
