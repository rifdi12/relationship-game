window.GAMES = window.GAMES || {};

window.GAMES.truthordare = (function () {
  let ctx = null;

  const roundProgress = document.getElementById('tod-round-progress');
  const turnHeading = document.getElementById('tod-turn-heading');
  const waitingNote = document.getElementById('tod-waiting-note');
  const chooseButtons = document.getElementById('tod-choose-buttons');
  const btnTruth = document.getElementById('tod-btn-truth');
  const btnDare = document.getElementById('tod-btn-dare');
  const cardBox = document.getElementById('tod-card-box');
  const cardType = document.getElementById('tod-card-type');
  const cardText = document.getElementById('tod-card-text');
  const btnDone = document.getElementById('tod-btn-done');
  const btnBack = document.getElementById('tod-btn-back');

  function onEnterRoom(c) {
    ctx = c;

    btnTruth.addEventListener('click', () => ctx.socket.emit('tod_choose', { type: 'truth' }));
    btnDare.addEventListener('click', () => ctx.socket.emit('tod_choose', { type: 'dare' }));
    btnDone.addEventListener('click', () => ctx.socket.emit('tod_done'));
    btnBack.addEventListener('click', () => ctx.socket.emit('play_again'));

    ctx.socket.on('tod_turn', (data) => {
      ctx.showScreen('screen-tod-play');
      cardBox.hidden = true;
      roundProgress.textContent = `Ronde ${data.roundsPlayed + 1}`;
      const isMe = data.turnPlayerId === ctx.myId;
      turnHeading.textContent = isMe ? 'Giliran kamu!' : `Giliran ${data.turnName}`;
      waitingNote.hidden = isMe;
      chooseButtons.hidden = !isMe;
    });

    ctx.socket.on('tod_card', (data) => {
      chooseButtons.hidden = true;
      waitingNote.hidden = true;
      cardBox.hidden = false;
      cardType.textContent = data.type === 'truth'
        ? `🗣️ Truth untuk ${data.targetName}`
        : `🔥 Dare untuk ${data.targetName}`;
      cardText.textContent = data.text;
    });
  }

  return { onEnterRoom };
})();
