try {
  if (localStorage.getItem('mineradio-startup-fast-skip-v1') === '1') {
    document.documentElement.classList.add('startup-fast-skip-preload');
  }
  document.documentElement.classList.add(localStorage.getItem('mineradio-diy-player-mode-v1') === '0' ? 'simple-mode-preload' : 'diy-mode-preload');
} catch (e) {
  document.documentElement.classList.add('diy-mode-preload');
}
