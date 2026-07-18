window.GAMES = window.GAMES || {};

window.GAMES.wyr = (function () {
  let ctx = null;
  let myChoice = null;
  let revealed = false;

  const progressEl = document.getElementById('wyr-round-progress');
  const matchCountEl = document.getElementById('wyr-match-count');
  const btnA = document.getElementById('wyr-btn-a');
  const btnB = document.getElementById('wyr-btn-b');
  const statusEl = document.getElementById('wyr-status');
  const revealBox = document.getElementById('wyr-reveal-box');
  const revealText = document.getElementById('wyr-reveal-text');
  const btnNext = document.getElementById('wyr-btn-next');
  const btnBack = document.getElementById('wyr-btn-back');

  function resetCardUI() {
    [btnA, btnB].forEach((b) => {
      b.disabled = false;
      b.classList.remove('selected');
    });
    statusEl.textContent = '';
    revealBox.hidden = true;
    myChoice = null;
    revealed = false;
  }

  function chooseHandler(choice) {
    if (myChoice || revealed) return;
    myChoice = choice;
    ctx.socket.emit('wyr_choice', { choice });
    [btnA, btnB].forEach((b) => { b.disabled = true; });
    (choice === 'a' ? btnA : btnB).classList.add('selected');
    statusEl.textContent = 'Pilihan terkirim! Menunggu pasangan...';
  }

  function onEnterRoom(c) {
    ctx = c;

    btnA.addEventListener('click', () => chooseHandler('a'));
    btnB.addEventListener('click', () => chooseHandler('b'));
    btnNext.addEventListener('click', () => ctx.socket.emit('wyr_next'));
    btnBack.addEventListener('click', () => ctx.socket.emit('play_again'));

    ctx.socket.on('wyr_card', (data) => {
      ctx.showScreen('screen-wyr-play');
      resetCardUI();
      progressEl.textContent = `Ronde ${data.roundsPlayed + 1}`;
      matchCountEl.textContent = `Cocok: ${data.matchCount}x`;
      btnA.textContent = data.a;
      btnB.textContent = data.b;
    });

    ctx.socket.on('wyr_reveal', (data) => {
      revealed = true;
      const partnerId = Object.keys(data.choices).find((id) => id !== ctx.myId);
      const myPick = data.choices[ctx.myId];
      const partnerPick = data.choices[partnerId];
      const label = (v) => (v === 'a' ? btnA.textContent : btnB.textContent);

      revealText.textContent = data.match
        ? `🎉 Cocok! Kalian berdua pilih "${label(myPick)}"`
        : `Kamu pilih "${label(myPick)}", pasangan pilih "${label(partnerPick)}"`;

      revealBox.hidden = false;
      statusEl.textContent = '';
      if (data.match) window.fireConfetti?.(18);
      progressEl.textContent = `Ronde ${data.roundsPlayed}`;
      matchCountEl.textContent = `Cocok: ${data.matchCount}x`;
    });
  }

  return { onEnterRoom };
})();
