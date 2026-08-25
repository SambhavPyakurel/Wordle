/* ---------------------------------------------------------
   CONSTANTS & STATE
--------------------------------------------------------- */
const ROWS = 6;
const COLS = 5;
let WORDS = [];
let VALID = new Set();
let ANSWER = "";
let grid = Array.from({ length: ROWS }, () => Array(COLS).fill(""));
let curRow = 0;
let curCol = 0;
let gameOver = false;
let isDailyGame = true; // First game of session is daily

// Hard mode tracking
let confirmedGreen = Array(COLS).fill(null);
let confirmedPresent = new Set();

// User Settings
const settings = {
  hardMode: false,
  darkMode: false,
  fontSize: 'normal'
};

const STATS_KEY = "dailyfive_unlimited_stats";
const SETTINGS_KEY = "dailyfive_settings";

/* ---------------------------------------------------------
   INITIALIZATION & DATA LOADING
--------------------------------------------------------- */
async function initGame() {
  loadSettings();
  buildBoard();
  buildKeyboard();
  setupPhysicalKeyboard();
  setupActionButtons();
  setupSettingsModal();

  try {
    // 1. Fetch full allowed guess list (~14.8k words)
    const validRes = await fetch("https://raw.githubusercontent.com/tabatkins/wordle-list/main/words");
    if (!validRes.ok) throw new Error("Could not fetch valid words list");
    const validText = await validRes.text();
    VALID = new Set(
      validText.split(/\r?\n/).map(w => w.trim().toLowerCase()).filter(w => w.length === 5)
    );

    // 2. Fetch curated mystery words list (from words.txt)
    const answersRes = await fetch("words.txt");
    if (!answersRes.ok) throw new Error("Could not fetch words.txt");
    const answersText = await answersRes.text();
    WORDS = answersText
      .split(/\r?\n/)
      .map(w => w.trim().toLowerCase())
      .filter(w => w.length === 5);

    WORDS.forEach(w => VALID.add(w));

    startNewRound();
  } catch (error) {
    console.error("Error loading dictionaries:", error);
    showMessage("Failed to load dictionary");
  }
}

/* ---------------------------------------------------------
   SETTINGS MANAGEMENT
--------------------------------------------------------- */
function loadSettings() {
  const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null");
  if (saved) {
    settings.hardMode = !!saved.hardMode;
    settings.darkMode = !!saved.darkMode;
    settings.fontSize = saved.fontSize || 'normal';
  }
  applyTheme();
  applyFontSize();
}

function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function applyTheme() {
  document.body.classList.toggle("dark-mode", settings.darkMode);
  const toggle = document.getElementById("themeToggle");
  if (toggle) toggle.checked = settings.darkMode;
}

function applyFontSize() {
  document.body.classList.remove("font-large", "font-xlarge");
  if (settings.fontSize === "large") document.body.classList.add("font-large");
  if (settings.fontSize === "xlarge") document.body.classList.add("font-xlarge");
  const select = document.getElementById("fontSizeSelect");
  if (select) select.value = settings.fontSize;
}

function setupSettingsModal() {
  const modal = document.getElementById("settingsModal");
  const openBtn = document.getElementById("settingsBtn");
  const closeBtn = document.getElementById("closeSettingsBtn");
  const hardToggle = document.getElementById("hardModeToggle");
  const themeToggle = document.getElementById("themeToggle");
  const fontSelect = document.getElementById("fontSizeSelect");

  openBtn.addEventListener("click", () => modal.showModal());
  closeBtn.addEventListener("click", () => modal.close());
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.close();
  });

  hardToggle.checked = settings.hardMode;
  hardToggle.addEventListener("change", (e) => {
    if (curRow > 0 && !gameOver) {
      showMessage("Hard mode can only be toggled at start of round");
      e.target.checked = settings.hardMode;
      return;
    }
    settings.hardMode = e.target.checked;
    saveSettings();
  });

  themeToggle.checked = settings.darkMode;
  themeToggle.addEventListener("change", (e) => {
    settings.darkMode = e.target.checked;
    applyTheme();
    saveSettings();
  });

  fontSelect.value = settings.fontSize;
  fontSelect.addEventListener("change", (e) => {
    settings.fontSize = e.target.value;
    applyFontSize();
    saveSettings();
  });
}

/* ---------------------------------------------------------
   ROUND MANAGEMENT (DAILY FIRST, THEN FREE PLAY)
--------------------------------------------------------- */
function getDailyWord() {
  const epochStart = new Date("2024-01-01T00:00:00Z").getTime();
  const now = new Date().getTime();
  const dayIndex = Math.floor((now - epochStart) / (1000 * 60 * 60 * 24));
  return WORDS[dayIndex % WORDS.length];
}

function startNewRound() {
  if (isDailyGame) {
    ANSWER = getDailyWord();
    const eyebrow = document.querySelector(".eyebrow");
    if (eyebrow) eyebrow.textContent = "Daily Challenge";
  } else {
    const randomIndex = Math.floor(Math.random() * WORDS.length);
    ANSWER = WORDS[randomIndex];
    const eyebrow = document.querySelector(".eyebrow");
    if (eyebrow) eyebrow.textContent = "Free Play";
  }

  grid = Array.from({ length: ROWS }, () => Array(COLS).fill(""));
  curRow = 0;
  curCol = 0;
  gameOver = false;
  confirmedGreen = Array(COLS).fill(null);
  confirmedPresent.clear();

  document.getElementById("result").classList.remove("show");
  document.getElementById("message").textContent = "";

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const tile = document.getElementById(`tile-${r}-${c}`);
      tile.textContent = "";
      tile.className = "tile";
    }
  }

  const keys = document.querySelectorAll(".key");
  keys.forEach(key => {
    key.classList.remove("correct", "present", "absent");
    delete key.dataset.state;
  });
}

/* ---------------------------------------------------------
   BUILD BOARD & KEYBOARD
--------------------------------------------------------- */
function buildBoard() {
  const board = document.getElementById("board");
  board.innerHTML = "";
  for (let r = 0; r < ROWS; r++) {
    const row = document.createElement("div");
    row.className = "row";
    row.id = "row-" + r;
    for (let c = 0; c < COLS; c++) {
      const tile = document.createElement("div");
      tile.className = "tile";
      tile.id = `tile-${r}-${c}`;
      row.appendChild(tile);
    }
    board.appendChild(row);
  }
}

function buildKeyboard() {
  const KEY_ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
  const keyboard = document.getElementById("keyboard");
  keyboard.innerHTML = "";

  KEY_ROWS.forEach((rowStr, i) => {
    const krow = document.createElement("div");
    krow.className = "krow";
    if (i === 2) {
      krow.appendChild(makeKey("ENTER", "wide"));
    }
    rowStr.split("").forEach(ch => krow.appendChild(makeKey(ch)));
    if (i === 2) {
      krow.appendChild(makeKey("⌫", "wide", "DEL"));
    }
    keyboard.appendChild(krow);
  });
}

function makeKey(label, extraClass, action) {
  const btn = document.createElement("button");
  btn.className = "key" + (extraClass ? " " + extraClass : "");
  btn.textContent = label;
  btn.id = "key-" + (action || label).toLowerCase();
  btn.addEventListener("click", () => handleInput(action || label));
  return btn;
}

/* ---------------------------------------------------------
   INPUT HANDLING & HARD MODE VALIDATION
--------------------------------------------------------- */
function handleInput(key) {
  if (gameOver || !ANSWER) return;
  if (key === "ENTER") return submitGuess();
  if (key === "DEL") return deleteLetter();

  if (/^[a-zA-Z]$/.test(key) && curCol < COLS) {
    grid[curRow][curCol] = key.toLowerCase();
    const tile = document.getElementById(`tile-${curRow}-${curCol}`);
    tile.textContent = key.toUpperCase();
    tile.classList.add("filled");
    curCol++;
  }
}

function deleteLetter() {
  if (curCol > 0) {
    curCol--;
    grid[curRow][curCol] = "";
    const tile = document.getElementById(`tile-${curRow}-${curCol}`);
    tile.textContent = "";
    tile.classList.remove("filled");
  }
}

function showMessage(msg) {
  const m = document.getElementById("message");
  m.textContent = msg;
  if (msg) setTimeout(() => { if (m.textContent === msg) m.textContent = ""; }, 2200);
}

function validateHardMode(guess) {
  for (let i = 0; i < COLS; i++) {
    if (confirmedGreen[i] && guess[i] !== confirmedGreen[i]) {
      const pos = ["1st", "2nd", "3rd", "4th", "5th"][i];
      showMessage(`${pos} letter must be ${confirmedGreen[i].toUpperCase()}`);
      return false;
    }
  }

  for (const letter of confirmedPresent) {
    if (!guess.includes(letter)) {
      showMessage(`Guess must contain ${letter.toUpperCase()}`);
      return false;
    }
  }
  return true;
}

function submitGuess() {
  if (curCol < COLS) {
    showMessage("Not enough letters");
    shakeRow(curRow);
    return;
  }

  const guess = grid[curRow].join("");

  if (!VALID.has(guess)) {
    showMessage("Not in word list");
    shakeRow(curRow);
    return;
  }

  if (settings.hardMode && !validateHardMode(guess)) {
    shakeRow(curRow);
    return;
  }

  const result = scoreGuess(guess, ANSWER);
  revealRow(curRow, result, guess);

  result.forEach((res, i) => {
    if (res === "correct") confirmedGreen[i] = guess[i];
    if (res === "present") confirmedPresent.add(guess[i]);
  });

  if (guess === ANSWER) {
    gameOver = true;
    setTimeout(() => endGame(true), 1500);
  } else if (curRow === ROWS - 1) {
    gameOver = true;
    setTimeout(() => endGame(false), 1500);
  } else {
    curRow++;
    curCol = 0;
  }
}

function scoreGuess(guess, answer) {
  const result = Array(COLS).fill("absent");
  const answerLetters = answer.split("");
  const used = Array(COLS).fill(false);

  for (let i = 0; i < COLS; i++) {
    if (guess[i] === answer[i]) {
      result[i] = "correct";
      used[i] = true;
    }
  }

  for (let i = 0; i < COLS; i++) {
    if (result[i] === "correct") continue;
    const gLetter = guess[i];
    for (let j = 0; j < COLS; j++) {
      if (!used[j] && answerLetters[j] === gLetter) {
        result[i] = "present";
        used[j] = true;
        break;
      }
    }
  }

  return result;
}

function revealRow(r, result, guess) {
  for (let c = 0; c < COLS; c++) {
    const tile = document.getElementById(`tile-${r}-${c}`);
    setTimeout(() => {
      tile.classList.add("reveal", result[c]);
      updateKey(guess[c], result[c]);
    }, c * 250);
  }
}

function updateKey(letter, state) {
  const key = document.getElementById("key-" + letter);
  if (!key) return;

  const rank = { absent: 0, present: 1, correct: 2 };
  const current = key.dataset.state || "absent";

  if (!key.dataset.state || rank[state] > rank[current]) {
    key.classList.remove("correct", "present", "absent");
    key.classList.add(state);
    key.dataset.state = state;
  }
}

function shakeRow(r) {
  const row = document.getElementById("row-" + r);
  row.classList.add("shake");
  setTimeout(() => row.classList.remove("shake"), 350);
}

/* ---------------------------------------------------------
   STATS & ENDGAME
--------------------------------------------------------- */
function loadStats() {
  return JSON.parse(localStorage.getItem(STATS_KEY) || '{"played":0,"streak":0,"best":0}');
}

function saveStats(s) {
  localStorage.setItem(STATS_KEY, JSON.stringify(s));
}

function endGame(won) {
  const stats = loadStats();
  stats.played++;
  if (won) {
    stats.streak++;
    stats.best = Math.max(stats.best, stats.streak);
  } else {
    stats.streak = 0;
  }
  saveStats(stats);
  showResult(won, stats);
  
  // Future rounds played in this session switch to random free play
  isDailyGame = false;
}

function showResult(won, stats) {
  const el = document.getElementById("result");
  document.getElementById("resultTitle").textContent = won ? "Solved it!" : `The word was ${ANSWER.toUpperCase()}`;
  document.getElementById("statPlayed").textContent = stats.played;
  document.getElementById("statStreak").textContent = stats.streak;
  document.getElementById("statBest").textContent = stats.best;

  const emojiRows = [];
  for (let r = 0; r <= curRow && r < ROWS; r++) {
    if (grid[r].every(l => l === "")) continue;
    const result = scoreGuess(grid[r].join(""), ANSWER);
    emojiRows.push(result.map(s => s === "correct" ? "🟨" : s === "present" ? "🟧" : "⬛").join(""));
  }

  const modeTitle = isDailyGame ? "Daily Five (Daily)" : "Daily Five (Free Play)";
  const shareText = `${modeTitle} ${won ? curRow + 1 : "X"}/6\n\n${emojiRows.join("\n")}`;
  document.getElementById("shareGrid").textContent = emojiRows.join("\n");
  document.getElementById("shareBtn").onclick = () => {
    navigator.clipboard.writeText(shareText).then(() => showMessage("Copied to clipboard"));
  };

  el.classList.add("show");
}

/* ---------------------------------------------------------
   EVENT LISTENERS
--------------------------------------------------------- */
function setupActionButtons() {
  document.getElementById("playAgainBtn").addEventListener("click", () => {
    startNewRound();
  });
}

function setupPhysicalKeyboard() {
  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleInput("ENTER");
    else if (e.key === "Backspace") handleInput("DEL");
    else if (/^[a-zA-Z]$/.test(e.key)) handleInput(e.key);
  });
}

initGame();