/* ---------------------------------------------------------
   CONSTANTS & STATE
--------------------------------------------------------- */
const ROWS = 6;
const COLS = 5;
let WORDS = [];
let VALID = new Set();
let ANSWER = "";
let puzzleIndex = 0;

let grid = Array.from({ length: ROWS }, () => Array(COLS).fill(""));
let curRow = 0;
let curCol = 0;
let gameOver = false;

let STORAGE_KEY = "";
const STATS_KEY = "dailyfive_stats";

/* ---------------------------------------------------------
   INITIALIZATION & ASYNC DATA LOADING
--------------------------------------------------------- */
async function initGame() {
  buildBoard();
  buildKeyboard();
  setupPhysicalKeyboard();

  try {
    const response = await fetch("words.txt");
    if (!response.ok) throw new Error("Network response was not ok");
    const rawText = await response.text();

    // Parse words, clean whitespace and filter out non 5-letter entries
    WORDS = rawText
      .split(/\r?\n/)
      .map(w => w.trim().toLowerCase())
      .filter(w => w.length === 5);

    VALID = new Set(WORDS);

    // Calculate deterministic daily index
    puzzleIndex = getDailyIndex(WORDS.length);
    ANSWER = WORDS[puzzleIndex];
    STORAGE_KEY = `dailyfive_${puzzleIndex}`;

    document.getElementById("puzzleNum").textContent = puzzleIndex + 1;

    restoreSavedGame();
  } catch (error) {
    console.error("Error loading words.txt:", error);
    showMessage("Failed to load dictionary");
  }
}

function getDailyIndex(totalWords) {
  const now = new Date();
  const utcNow = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const utcEpoch = Date.UTC(2024, 0, 1);
  const dayIndex = Math.floor((utcNow - utcEpoch) / 86400000);
  return ((dayIndex % totalWords) + totalWords) % totalWords;
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
   INPUT HANDLING
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
  if (msg) setTimeout(() => { if (m.textContent === msg) m.textContent = ""; }, 1800);
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

  const result = scoreGuess(guess, ANSWER);
  revealRow(curRow, result, guess);

  if (guess === ANSWER) {
    gameOver = true;
    setTimeout(() => endGame(true), 1400);
  } else if (curRow === ROWS - 1) {
    gameOver = true;
    setTimeout(() => endGame(false), 1400);
  } else {
    curRow++;
    curCol = 0;
  }
  persistProgress(guess === ANSWER || curRow > ROWS - 1);
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
   PERSISTENCE & STATS
--------------------------------------------------------- */
function loadStats() {
  return JSON.parse(localStorage.getItem(STATS_KEY) || '{"played":0,"streak":0,"best":0,"lastWin":-1}');
}

function saveStats(s) {
  localStorage.setItem(STATS_KEY, JSON.stringify(s));
}

function persistProgress(finished) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      grid,
      curRow,
      curCol,
      gameOver: finished,
      won: grid.some(row => row.join("") === ANSWER)
    })
  );
}

function endGame(won) {
  const stats = loadStats();
  stats.played++;
  if (won) {
    if (stats.lastWin === puzzleIndex - 1) stats.streak++;
    else stats.streak = 1;
    stats.lastWin = puzzleIndex;
    stats.best = Math.max(stats.best, stats.streak);
  } else {
    stats.streak = 0;
  }
  saveStats(stats);
  showResult(won, stats);
}

function showResult(won, stats) {
  const el = document.getElementById("result");
  el.classList.add("show");
  document.getElementById("resultTitle").textContent = won ? "Solved it." : `The word was ${ANSWER.toUpperCase()}`;
  document.getElementById("statPlayed").textContent = stats.played;
  document.getElementById("statStreak").textContent = stats.streak;
  document.getElementById("statBest").textContent = stats.best;

  const emojiRows = [];
  for (let r = 0; r <= curRow && r < ROWS; r++) {
    if (grid[r].every(l => l === "")) continue;
    const result = scoreGuess(grid[r].join(""), ANSWER);
    emojiRows.push(result.map(s => s === "correct" ? "🟩" : s === "present" ? "🟨" : "⬛").join(""));
  }
  const shareText = `Daily Five #${puzzleIndex + 1} ${won ? curRow + 1 : "X"}/6\n\n${emojiRows.join("\n")}`;
  document.getElementById("shareGrid").textContent = emojiRows.join("\n");

  document.getElementById("shareBtn").onclick = () => {
    navigator.clipboard.writeText(shareText).then(() => showMessage("Copied to clipboard"));
  };
}

function restoreSavedGame() {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
  if (!saved) return;

  grid = saved.grid;
  curRow = saved.curRow;
  curCol = saved.curCol;

  for (let r = 0; r < ROWS; r++) {
    if (grid[r].every(l => l === "")) continue;
    const guess = grid[r].join("");
    const result = scoreGuess(guess, ANSWER);
    for (let c = 0; c < COLS; c++) {
      const tile = document.getElementById(`tile-${r}-${c}`);
      tile.textContent = guess[c].toUpperCase();
      tile.classList.add("filled", "reveal", result[c]);
      updateKey(guess[c], result[c]);
    }
  }

  if (saved.gameOver) {
    gameOver = true;
    const won = grid.some(row => row.join("") === ANSWER);
    const stats = loadStats();
    showResult(won, stats);
  }
}

/* ---------------------------------------------------------
   PHYSICAL KEYBOARD
--------------------------------------------------------- */
function setupPhysicalKeyboard() {
  document.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleInput("ENTER");
    else if (e.key === "Backspace") handleInput("DEL");
    else if (/^[a-zA-Z]$/.test(e.key)) handleInput(e.key);
  });
}

// Start game on load
initGame();