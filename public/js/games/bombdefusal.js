window.GAMES = window.GAMES || {};

window.GAMES.bombdefusal = (function () {
  let ctx = null;
  let countdownInterval = null;
  let lastClickedEl = null;

  const roleLabel = document.getElementById('bomb-role-label');
  const timerEl = document.getElementById('bomb-timer');
  const strikesEl = document.getElementById('bomb-strikes');

  const defuserView = document.getElementById('bomb-defuser-view');
  const expertView = document.getElementById('bomb-expert-view');

  const wiresRow = document.getElementById('bomb-wires-row');
  const symbolsRow = document.getElementById('bomb-symbols-row');
  const simonSequenceEl = document.getElementById('bomb-simon-sequence');
  const simonButtons = document.querySelectorAll('.bomb-simon-btn');

  const checkWires = document.getElementById('bomb-check-wires');
  const checkSymbols = document.getElementById('bomb-check-symbols');
  const checkSimon = document.getElementById('bomb-check-simon');

  const overBox = document.getElementById('bomb-over-box');
  const overText = document.getElementById('bomb-over-text');
  const btnAgain = document.getElementById('bomb-btn-again');
  const btnBack = document.getElementById('bomb-btn-back');

  const WIRE_LABEL = { red: 'Merah', blue: 'Biru', yellow: 'Kuning', black: 'Hitam', white: 'Putih' };
  const COLOR_LABEL = { red: 'Merah', blue: 'Biru', yellow: 'Kuning', green: 'Hijau' };

  function startTimer(deadline) {
    clearInterval(countdownInterval);
    function tick() {
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      const m = Math.floor(remaining / 60).toString().padStart(2, '0');
      const s = (remaining % 60).toString().padStart(2, '0');
      timerEl.textContent = `${m}:${s}`;
      if (remaining <= 0) clearInterval(countdownInterval);
    }
    tick();
    countdownInterval = setInterval(tick, 1000);
  }

  function findModule(modules, type) {
    return modules.find((m) => m.type === type);
  }

  function renderDefuser(data) {
    strikesEl.textContent = data.strikes;

    const wiresMod = findModule(data.modules, 'wires');
    const wiresModIdx = data.modules.indexOf(wiresMod);
    wiresRow.innerHTML = '';
    wiresRow.classList.toggle('bomb-module-solved', wiresMod.solved);
    wiresMod.wires.forEach((color, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `bomb-wire bomb-wire-${color}`;
      btn.textContent = WIRE_LABEL[color];
      const isCut = wiresMod.cutWires.includes(idx);
      btn.disabled = isCut || wiresMod.solved;
      if (isCut) btn.classList.add('bomb-wire-cut');
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        lastClickedEl = btn;
        ctx.socket.emit('bomb_cut_wire', { moduleIndex: wiresModIdx, wireIndex: idx });
      });
      wiresRow.appendChild(btn);
    });

    const symbolsMod = findModule(data.modules, 'symbols');
    const symbolsModIdx = data.modules.indexOf(symbolsMod);
    symbolsRow.innerHTML = '';
    symbolsRow.classList.toggle('bomb-module-solved', symbolsMod.solved);
    symbolsMod.displayOrder.forEach((sym) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'bomb-symbol-btn';
      btn.textContent = sym;
      btn.disabled = symbolsMod.solved;
      btn.addEventListener('click', () => {
        if (btn.disabled) return;
        lastClickedEl = btn;
        ctx.socket.emit('bomb_click', { moduleIndex: symbolsModIdx, value: sym });
      });
      symbolsRow.appendChild(btn);
    });

    const simonMod = findModule(data.modules, 'simon');
    const simonModIdx = data.modules.indexOf(simonMod);
    simonSequenceEl.innerHTML = '';
    simonSequenceEl.classList.toggle('bomb-module-solved', simonMod.solved);
    simonMod.sequence.forEach((color, i) => {
      const chip = document.createElement('span');
      chip.className = `bomb-simon-chip bomb-color-${color}`;
      chip.textContent = `${i + 1}. ${COLOR_LABEL[color]}`;
      simonSequenceEl.appendChild(chip);
    });
    simonButtons.forEach((btn) => {
      btn.disabled = simonMod.solved;
      btn.onclick = () => {
        if (btn.disabled) return;
        lastClickedEl = btn;
        ctx.socket.emit('bomb_click', { moduleIndex: simonModIdx, value: btn.dataset.color });
      };
    });
  }

  function renderExpert(data) {
    strikesEl.textContent = data.strikes;
    checkWires.hidden = !data.modulesSolved[0];
    checkSymbols.hidden = !data.modulesSolved[1];
    checkSimon.hidden = !data.modulesSolved[2];
  }

  function onEnterRoom(c) {
    ctx = c;

    btnAgain.addEventListener('click', () => ctx.socket.emit('play_again'));
    btnBack.addEventListener('click', () => ctx.socket.emit('play_again'));

    ctx.socket.on('bomb_state_defuser', (data) => {
      ctx.showScreen('screen-bomb-play');
      roleLabel.textContent = 'Kamu: Defuser 🔧';
      defuserView.hidden = false;
      expertView.hidden = true;
      overBox.hidden = true;
      startTimer(data.deadline);
      renderDefuser(data);
    });

    ctx.socket.on('bomb_state_expert', (data) => {
      ctx.showScreen('screen-bomb-play');
      roleLabel.textContent = 'Kamu: Expert 📖';
      defuserView.hidden = true;
      expertView.hidden = false;
      overBox.hidden = true;
      startTimer(data.deadline);
      renderExpert(data);
    });

    ctx.socket.on('bomb_action_feedback', ({ correct }) => {
      if (!lastClickedEl) return;
      const el = lastClickedEl;
      el.classList.add(correct ? 'bomb-flash-correct' : 'bomb-flash-wrong');
      setTimeout(() => el.classList.remove('bomb-flash-correct', 'bomb-flash-wrong'), 500);
    });

    ctx.socket.on('bomb_game_over', (data) => {
      clearInterval(countdownInterval);
      overBox.hidden = false;
      if (data.result === 'won') {
        overText.textContent = '🎉 Bom berhasil dijinakkan! Kerja sama kalian mantap.';
        window.fireConfetti?.();
      } else {
        overText.textContent = '💥 Yah, bomnya keburu meledak. Coba lagi yuk!';
      }
    });
  }

  return { onEnterRoom };
})();
