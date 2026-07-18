const quiz = require('./quiz');
const wyr = require('./wyr');
const truthordare = require('./truthordare');
const connect4 = require('./connect4');
const guessword = require('./guessword');
const pictionary = require('./pictionary');
const bombdefusal = require('./bombdefusal');

const registry = {
  [quiz.key]: quiz,
  [wyr.key]: wyr,
  [truthordare.key]: truthordare,
  [connect4.key]: connect4,
  [guessword.key]: guessword,
  [pictionary.key]: pictionary,
  [bombdefusal.key]: bombdefusal,
};

module.exports = registry;
