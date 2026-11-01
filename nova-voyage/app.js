const body = document.body;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const scene = document.querySelector('#scene');
const dialog = document.querySelector('#contact-dialog');
const announcement = document.querySelector('#journey-announcement');
const returnLink = document.querySelector('#return-home');
let travelTimer;
let previousFocus;
let localNavigationCount = 0;

const routeCopy = {
  lost: {
    title: '404 · 迷失在星图之外 — 新航 Nova Voyage',
    status: '航线偏离', english: 'OFF COURSE', sector: 'N—404',
    sectorLabel: '星图之外', location: '你在这里', locationEnglish: 'SOMEWHERE OUT THERE',
    reassurance: '偶尔迷航，也是探索的一部分。', destination: '未知星域', code: 'NV—404',
  },
  earth: {
    title: '地球站 · 欢迎归航 — 新航 Nova Voyage',
    status: '已抵达地球', english: 'WELCOME HOME', sector: 'SOL—03',
    sectorLabel: '太阳系 · 地球', location: '欢迎回家', locationEnglish: 'OUR PALE BLUE DOT',
    reassurance: '每一次归来，都是下一次出发的起点。', destination: '地球轨道', code: 'NV—001',
  },
};

function cancelTravel() {
  clearTimeout(travelTimer);
  delete body.dataset.traveling;
  returnLink.removeAttribute('aria-disabled');
  document.querySelector('#return-label').textContent = '返回地球';
}

function renderRoute({ focus = false } = {}) {
  cancelTravel();
  const view = location.hash === '#earth' ? 'earth' : 'lost';
  const copy = routeCopy[view];
  body.dataset.view = view;
  document.title = copy.title;
  document.querySelector('#status-label').textContent = copy.status;
  document.querySelector('#status-english').textContent = copy.english;
  document.querySelector('#sector-code').textContent = copy.sector;
  document.querySelector('#sector-label').textContent = copy.sectorLabel;
  document.querySelector('#location-label').textContent = copy.location;
  document.querySelector('#location-english').textContent = copy.locationEnglish;
  document.querySelector('#footer-destination').textContent = copy.destination;
  document.querySelector('.flight-code').textContent = copy.code;
  document.querySelector('#reassurance-text').textContent = copy.reassurance;
  if (focus) {
    document.querySelector(view === 'earth' ? '#home-title' : '#error-title').focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'instant' });
    announcement.textContent = view === 'earth' ? '航线已恢复，欢迎抵达地球站。' : '你来到了星图之外，当前页面为 404。';
  }
}

function navigate(hash) {
  if (dialog.open) closeContact();
  if (location.hash !== hash) {
    history.pushState({ novaVoyage: true }, '', hash);
    localNavigationCount += 1;
  }
  renderRoute({ focus: true });
}

document.querySelectorAll('a[href="#earth"], a[href="#lost"]').forEach(link => {
  link.addEventListener('click', event => {
    if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (body.dataset.traveling === 'true') return;
    const hash = link.getAttribute('href');
    if (hash === '#earth' && body.dataset.view === 'lost' && !reducedMotion.matches) {
      if (dialog.open) closeContact();
      body.dataset.traveling = 'true';
      returnLink.setAttribute('aria-disabled', 'true');
      document.querySelector('#return-label').textContent = '正在归航';
      document.querySelector('#status-label').textContent = '正在校准航线';
      document.querySelector('#status-english').textContent = 'RECONNECTING';
      announcement.textContent = '正在校准航线，返回地球。';
      travelTimer = setTimeout(() => navigate(hash), 800);
    } else {
      navigate(hash);
    }
  });
});

document.querySelector('#go-back').addEventListener('click', () => {
  if (localNavigationCount > 0) {
    history.back();
  } else {
    returnLink.click();
  }
});

window.addEventListener('popstate', () => {
  localNavigationCount = Math.max(0, localNavigationCount - 1);
  if (dialog.open) closeContact();
  renderRoute({ focus: true });
});
window.addEventListener('hashchange', () => renderRoute());
window.addEventListener('pagehide', cancelTravel);
reducedMotion.addEventListener('change', () => {
  if (reducedMotion.matches && body.dataset.traveling === 'true') navigate('#earth');
  resetParallax();
});

function openContact(trigger) {
  previousFocus = trigger;
  document.querySelector('#current-location').textContent = `${routeCopy[body.dataset.view].code} · ${location.href}`;
  document.querySelector('#copy-status').textContent = '';
  document.querySelector('#copy-location span').textContent = '复制航行信息';
  dialog.showModal();
}

function closeContact() {
  dialog.close();
  previousFocus?.focus({ preventScroll: true });
}

document.querySelectorAll('[data-contact]').forEach(button => button.addEventListener('click', () => openContact(button)));
document.querySelector('#close-contact').addEventListener('click', closeContact);
dialog.addEventListener('click', event => {
  if (event.target !== dialog) return;
  const rect = dialog.getBoundingClientRect();
  if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeContact();
});

document.querySelector('#copy-location').addEventListener('click', async () => {
  const status = document.querySelector('#copy-status');
  const record = `新航 Nova Voyage\n航行状态：${routeCopy[body.dataset.view].status}\n航行编号：${routeCopy[body.dataset.view].code}\n当前位置：${location.href}`;
  try {
    await navigator.clipboard.writeText(record);
    status.textContent = '航行信息已复制，记得保存这段奇遇。';
    document.querySelector('#copy-location span').textContent = '已复制航行信息';
  } catch (error) {
    status.textContent = '请长按或选中上方航行记录，手动复制。';
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(document.querySelector('#current-location'));
    selection.removeAllRanges();
    selection.addRange(range);
  }
});

let seed = 404;
const random = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};
const stars = document.createDocumentFragment();
for (let i = 0; i < 90; i += 1) {
  const star = document.createElement('i');
  star.className = i % 21 === 0 ? 'star star-cross' : 'star';
  star.style.setProperty('--left', `${random() * 100}%`);
  star.style.setProperty('--top', `${8 + random() * 81}%`);
  star.style.setProperty('--size', `${random() > .91 ? 2 : 1}px`);
  star.style.setProperty('--opacity', `${.11 + random() * .43}`);
  stars.append(star);
}
document.querySelector('#starfield').append(stars);

let parallaxFrame = 0;
function resetParallax() {
  cancelAnimationFrame(parallaxFrame);
  parallaxFrame = 0;
  scene.style.setProperty('--pointer-x', '0px');
  scene.style.setProperty('--pointer-y', '0px');
}
scene.addEventListener('pointermove', event => {
  if (reducedMotion.matches || event.pointerType !== 'mouse' || body.dataset.traveling === 'true' || document.hidden) return;
  cancelAnimationFrame(parallaxFrame);
  parallaxFrame = requestAnimationFrame(() => {
    const rect = scene.getBoundingClientRect();
    scene.style.setProperty('--pointer-x', `${((event.clientX - rect.left) / rect.width - .5) * 10}px`);
    scene.style.setProperty('--pointer-y', `${((event.clientY - rect.top) / rect.height - .5) * 7}px`);
  });
});
scene.addEventListener('pointerleave', resetParallax);
document.addEventListener('visibilitychange', () => { if (document.hidden) resetParallax(); });

renderRoute();
