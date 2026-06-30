(function () {
  const canvas = document.getElementById('rain');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let W, H, cols, drops;
  const fontSize = 15;

  function resize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
    cols = Math.floor(W / fontSize);
    drops = new Array(cols).fill(0).map(() => Math.floor(Math.random() * -50));
  }
  function draw() {
    ctx.fillStyle = 'rgba(2,8,5,0.13)';
    ctx.fillRect(0, 0, W, H);
    ctx.font = fontSize + 'px monospace';
    for (let i = 0; i < cols; i++) {
      ctx.fillStyle = Math.random() > 0.96 ? '#aaffcc' : 'rgba(0,255,102,0.5)';
      ctx.fillText(Math.random() > 0.5 ? '1' : '0', i * fontSize, drops[i] * fontSize);
      if (drops[i] * fontSize > H && Math.random() > 0.975) drops[i] = 0;
      drops[i]++;
    }
  }
  resize();
  window.addEventListener('resize', resize);
  setInterval(draw, 50);
})();
