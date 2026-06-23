import './style.css';

// ─── Types ────────────────────────────────────────────────────────────────────

type Difficulty = 'easy' | 'medium' | 'hard';
type InputMode = 'normal' | 'pencil';

interface HistoryEntry {
  userGrid: number[][];
  pencilMarks: Record<string, number[]>;
}

interface GameState {
  puzzle: number[][];
  solution: number[][];
  userGrid: number[][];
  pencilMarks: Record<string, Set<number>>;
  selectedCell: [number, number] | null;
  highlightedNumber: number | null;
  difficulty: Difficulty;
  inputMode: InputMode;
  timerSeconds: number;
  isComplete: boolean;
  history: HistoryEntry[];
}

// ─── Puzzle Generation ────────────────────────────────────────────────────────

const CLUE_COUNTS: Record<Difficulty, number> = { easy: 35, medium: 28, hard: 22 };

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function isValid(grid: number[][], row: number, col: number, num: number): boolean {
  for (let i = 0; i < 9; i++) if (grid[row][i] === num) return false;
  for (let i = 0; i < 9; i++) if (grid[i][col] === num) return false;
  const br = Math.floor(row / 3) * 3;
  const bc = Math.floor(col / 3) * 3;
  for (let r = br; r < br + 3; r++)
    for (let c = bc; c < bc + 3; c++)
      if (grid[r][c] === num) return false;
  return true;
}

function solveFill(grid: number[][]): boolean {
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++)
      if (grid[r][c] === 0) {
        for (const num of shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9])) {
          if (isValid(grid, r, c, num)) {
            grid[r][c] = num;
            if (solveFill(grid)) return true;
            grid[r][c] = 0;
          }
        }
        return false;
      }
  return true;
}

function generateSolution(): number[][] {
  const grid = Array.from({ length: 9 }, () => Array<number>(9).fill(0));
  solveFill(grid);
  return grid;
}

function countSolutions(grid: number[][], limit: number): number {
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++)
      if (grid[r][c] === 0) {
        let count = 0;
        for (let num = 1; num <= 9; num++) {
          if (isValid(grid, r, c, num)) {
            grid[r][c] = num;
            count += countSolutions(grid, limit - count);
            grid[r][c] = 0;
            if (count >= limit) return count;
          }
        }
        return count;
      }
  return 1;
}

function hasUniqueSolution(grid: number[][]): boolean {
  return countSolutions(grid.map(r => [...r]), 2) === 1;
}

function generatePuzzle(difficulty: Difficulty): { puzzle: number[][]; solution: number[][] } {
  const solution = generateSolution();
  const puzzle = solution.map(r => [...r]);
  const targetClues = CLUE_COUNTS[difficulty];
  const positions = shuffle(Array.from({ length: 81 }, (_, i): [number, number] => [Math.floor(i / 9), i % 9]));
  let remaining = 81;
  for (const [r, c] of positions) {
    if (remaining <= targetClues) break;
    const val = puzzle[r][c];
    puzzle[r][c] = 0;
    if (hasUniqueSolution(puzzle)) {
      remaining--;
    } else {
      puzzle[r][c] = val;
    }
  }
  return { puzzle, solution };
}

// ─── State Management ─────────────────────────────────────────────────────────

function initGame(difficulty: Difficulty): GameState {
  const { puzzle, solution } = generatePuzzle(difficulty);
  return {
    puzzle,
    solution,
    userGrid: puzzle.map(r => [...r]),
    pencilMarks: {},
    selectedCell: null,
    highlightedNumber: null,
    difficulty,
    inputMode: 'normal',
    timerSeconds: 0,
    isComplete: false,
    history: [],
  };
}

function snapshotHistory(state: GameState): HistoryEntry {
  return {
    userGrid: state.userGrid.map(r => [...r]),
    pencilMarks: Object.fromEntries(
      Object.entries(state.pencilMarks).map(([k, v]) => [k, [...v]])
    ),
  };
}

function selectCell(state: GameState, row: number, col: number): GameState {
  const value = state.userGrid[row][col];
  return {
    ...state,
    selectedCell: [row, col],
    highlightedNumber: value !== 0 ? value : state.highlightedNumber,
  };
}

function enterOrHighlight(state: GameState, value: number): GameState {
  if (!state.selectedCell) return { ...state, highlightedNumber: value };
  const [row, col] = state.selectedCell;
  if (state.puzzle[row][col] !== 0) return { ...state, highlightedNumber: value };

  if (state.inputMode === 'pencil') {
    return togglePencilMark({ ...state, highlightedNumber: value }, row, col, value);
  }

  const entry = snapshotHistory(state);
  const userGrid = state.userGrid.map(r => [...r]);
  userGrid[row][col] = value;

  const pencilMarks = { ...state.pencilMarks };
  delete pencilMarks[`${row},${col}`];

  // Feature 3: clear pencil marks of 'value' from the same row and column
  for (let i = 0; i < 9; i++) {
    const rowKey = `${row},${i}`;
    if (pencilMarks[rowKey]?.has(value)) {
      const next = new Set(pencilMarks[rowKey]);
      next.delete(value);
      if (next.size === 0) delete pencilMarks[rowKey];
      else pencilMarks[rowKey] = next;
    }
    const colKey = `${i},${col}`;
    if (pencilMarks[colKey]?.has(value)) {
      const next = new Set(pencilMarks[colKey]);
      next.delete(value);
      if (next.size === 0) delete pencilMarks[colKey];
      else pencilMarks[colKey] = next;
    }
  }

  return checkCompletion({
    ...state,
    userGrid,
    pencilMarks,
    highlightedNumber: value,
    history: [...state.history, entry],
  });
}

function eraseCell(state: GameState): GameState {
  if (!state.selectedCell) return state;
  const [row, col] = state.selectedCell;
  if (state.puzzle[row][col] !== 0) return state;

  const entry = snapshotHistory(state);
  const userGrid = state.userGrid.map(r => [...r]);
  userGrid[row][col] = 0;
  const pencilMarks = { ...state.pencilMarks };
  delete pencilMarks[`${row},${col}`];

  return {
    ...state,
    userGrid,
    pencilMarks,
    highlightedNumber: null,
    history: [...state.history, entry],
  };
}

function togglePencilMark(state: GameState, row: number, col: number, value: number): GameState {
  if (state.puzzle[row][col] !== 0 || state.userGrid[row][col] !== 0) return state;

  const entry = snapshotHistory(state);
  const key = `${row},${col}`;
  const marks = state.pencilMarks[key] ? new Set(state.pencilMarks[key]) : new Set<number>();
  if (marks.has(value)) marks.delete(value);
  else marks.add(value);

  return {
    ...state,
    pencilMarks: { ...state.pencilMarks, [key]: marks },
    history: [...state.history, entry],
  };
}

function toggleInputMode(state: GameState): GameState {
  return { ...state, inputMode: state.inputMode === 'normal' ? 'pencil' : 'normal' };
}

function undoMove(state: GameState): GameState {
  if (state.history.length === 0) return state;
  const history = [...state.history];
  const entry = history.pop()!;
  const pencilMarks: Record<string, Set<number>> = {};
  for (const [k, v] of Object.entries(entry.pencilMarks)) {
    pencilMarks[k] = new Set(v);
  }
  return {
    ...state,
    userGrid: entry.userGrid.map(r => [...r]),
    pencilMarks,
    history,
    isComplete: false,
  };
}

function checkCompletion(state: GameState): GameState {
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++)
      if (state.userGrid[r][c] !== state.solution[r][c]) return state;
  return { ...state, isComplete: true };
}

function moveSelection(state: GameState, dr: number, dc: number): GameState {
  if (!state.selectedCell) return selectCell(state, 0, 0);
  const [r, c] = state.selectedCell;
  return selectCell(state, Math.max(0, Math.min(8, r + dr)), Math.max(0, Math.min(8, c + dc)));
}

// ─── Board Helpers ────────────────────────────────────────────────────────────

function findConflicts(state: GameState): Set<string> {
  const conflicts = new Set<string>();
  const grid = state.userGrid;
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++) {
      const v = grid[r][c];
      if (v === 0) continue;
      for (let i = 0; i < 9; i++) {
        if (i !== c && grid[r][i] === v) { conflicts.add(`${r},${c}`); conflicts.add(`${r},${i}`); }
        if (i !== r && grid[i][c] === v) { conflicts.add(`${r},${c}`); conflicts.add(`${i},${c}`); }
      }
      const br = Math.floor(r / 3) * 3;
      const bc = Math.floor(c / 3) * 3;
      for (let br2 = br; br2 < br + 3; br2++)
        for (let bc2 = bc; bc2 < bc + 3; bc2++)
          if ((br2 !== r || bc2 !== c) && grid[br2][bc2] === v) {
            conflicts.add(`${r},${c}`); conflicts.add(`${br2},${bc2}`);
          }
    }
  return conflicts;
}

// Feature 1: count how many times each digit appears in the user grid
function countPlacedNumbers(state: GameState): Record<number, number> {
  const counts: Record<number, number> = {};
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++) {
      const v = state.userGrid[r][c];
      if (v !== 0) counts[v] = (counts[v] ?? 0) + 1;
    }
  return counts;
}

// Feature 4: collect cells that belong to rows/columns of every placed highlightedNumber
function getCrossHighlightCells(state: GameState): Set<string> {
  const set = new Set<string>();
  const num = state.highlightedNumber;
  if (!num) return set;
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++)
      if (state.userGrid[r][c] === num) {
        for (let i = 0; i < 9; i++) {
          set.add(`${r},${i}`);
          set.add(`${i},${c}`);
        }
      }
  return set;
}

// ─── Rendering ────────────────────────────────────────────────────────────────

function renderBoard(
  state: GameState,
  container: HTMLElement,
  onCellClick: (r: number, c: number) => void,
): void {
  container.innerHTML = '';
  const conflicts = findConflicts(state);
  const [selR, selC] = state.selectedCell ?? [-1, -1];
  const crossHighlight = getCrossHighlightCells(state);

  const grid = document.createElement('div');
  grid.className = 'grid grid-cols-9 border-2 border-gray-800 w-full aspect-square select-none';

  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const cell = document.createElement('div');
      const isGiven = state.puzzle[r][c] !== 0;
      const isSelected = r === selR && c === selC;
      const isSameRowCol = !isSelected && (r === selR || c === selC);
      const isCrossHighlight = !isSelected && !isSameRowCol && crossHighlight.has(`${r},${c}`);
      const isConflict = conflicts.has(`${r},${c}`);
      const value = state.userGrid[r][c];
      const marks = state.pencilMarks[`${r},${c}`];

      const borderB = (r + 1) % 3 === 0 && r !== 8
        ? 'border-b-2 border-b-gray-800'
        : 'border-b border-b-gray-300';
      const borderR = (c + 1) % 3 === 0 && c !== 8
        ? 'border-r-2 border-r-gray-800'
        : 'border-r border-r-gray-300';

      let bg = 'bg-white';
      if (isSelected) bg = 'bg-blue-300';
      else if (isSameRowCol) bg = 'bg-blue-100';
      else if (isCrossHighlight) bg = 'bg-amber-100';
      else if (isGiven) bg = 'bg-gray-50';

      cell.className = [
        'flex items-center justify-center relative cursor-pointer overflow-hidden',
        borderB, borderR, bg,
        'transition-colors',
      ].join(' ');

      if (value !== 0) {
        const span = document.createElement('span');
        span.textContent = String(value);
        // Feature 2: larger font so the number fills the cell
        const colorClass = isGiven
          ? 'text-gray-900 font-bold'
          : isConflict
          ? 'text-red-600 font-semibold'
          : 'text-blue-700 font-semibold';
        span.className = `${colorClass} text-xl sm:text-2xl leading-none`;
        cell.appendChild(span);
      } else if (marks && marks.size > 0) {
        const marksDiv = document.createElement('div');
        marksDiv.className = 'grid grid-cols-3 w-full h-full p-px gap-0';
        for (let i = 1; i <= 9; i++) {
          const mark = document.createElement('span');
          mark.className = 'flex items-center justify-center text-gray-500 leading-none';
          mark.style.fontSize = '0.45em';
          mark.textContent = marks.has(i) ? String(i) : '';
          marksDiv.appendChild(mark);
        }
        cell.appendChild(marksDiv);
      }

      cell.addEventListener('click', () => onCellClick(r, c));
      grid.appendChild(cell);
    }
  }

  container.appendChild(grid);
}

function renderControls(
  state: GameState,
  onNumber: (n: number) => void,
  onErase: () => void,
  onTogglePencil: () => void,
  onUndo: () => void,
): HTMLElement {
  // Feature 1: count placed numbers to know which to gray out
  const counts = countPlacedNumbers(state);

  const wrap = document.createElement('div');
  wrap.className = 'flex flex-col items-center gap-2 w-full';

  // Number buttons grid
  const numGrid = document.createElement('div');
  numGrid.className = 'grid grid-cols-9 gap-1 w-full';

  for (let n = 1; n <= 9; n++) {
    const fullyPlaced = (counts[n] ?? 0) >= 9;
    const btn = document.createElement('button');
    btn.textContent = String(n);
    btn.disabled = fullyPlaced;
    btn.className = [
      'flex items-center justify-center rounded border shadow-sm font-semibold text-lg h-10 sm:h-12 transition-colors',
      fullyPlaced
        ? 'bg-gray-100 text-gray-300 border-gray-200 cursor-not-allowed'
        : 'bg-white text-gray-800 border-gray-300 hover:bg-gray-50 active:bg-blue-100',
    ].join(' ');
    if (!fullyPlaced) btn.addEventListener('click', () => onNumber(n));
    numGrid.appendChild(btn);
  }
  wrap.appendChild(numGrid);

  // Action buttons row
  const row = document.createElement('div');
  row.className = 'flex gap-2 w-full';

  const pencilBtn = document.createElement('button');
  pencilBtn.textContent = '✏️ Pencil';
  pencilBtn.className = [
    'flex-1 rounded py-2 font-medium text-sm border shadow-sm transition-colors',
    state.inputMode === 'pencil'
      ? 'bg-yellow-300 border-yellow-500 text-yellow-900'
      : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50',
  ].join(' ');
  pencilBtn.addEventListener('click', onTogglePencil);

  const eraseBtn = document.createElement('button');
  eraseBtn.textContent = '⌫ Erase';
  eraseBtn.className = 'flex-1 rounded py-2 font-medium text-sm border shadow-sm transition-colors bg-white border-gray-300 text-gray-700 hover:bg-gray-50 active:bg-red-50';
  eraseBtn.addEventListener('click', onErase);

  // Feature 5: undo button
  const canUndo = state.history.length > 0;
  const undoBtn = document.createElement('button');
  undoBtn.textContent = '↩ Undo';
  undoBtn.disabled = !canUndo;
  undoBtn.className = [
    'flex-1 rounded py-2 font-medium text-sm border shadow-sm transition-colors',
    canUndo
      ? 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50 active:bg-orange-50'
      : 'bg-gray-100 border-gray-200 text-gray-300 cursor-not-allowed',
  ].join(' ');
  if (canUndo) undoBtn.addEventListener('click', onUndo);

  row.appendChild(pencilBtn);
  row.appendChild(eraseBtn);
  row.appendChild(undoBtn);
  wrap.appendChild(row);

  return wrap;
}

function formatTime(seconds: number): string {
  return `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${(seconds % 60).toString().padStart(2, '0')}`;
}

function renderHeader(
  state: GameState,
  bestTime: number | null,
  onNewGame: () => void,
  onDifficulty: (d: Difficulty) => void,
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'flex flex-col gap-3 w-full';

  const title = document.createElement('h1');
  title.textContent = 'Sudoku';
  title.className = 'text-2xl font-bold text-gray-800 text-center tracking-tight';
  wrap.appendChild(title);

  const diffRow = document.createElement('div');
  diffRow.className = 'flex gap-1 w-full';
  for (const d of ['easy', 'medium', 'hard'] as Difficulty[]) {
    const btn = document.createElement('button');
    btn.textContent = d.charAt(0).toUpperCase() + d.slice(1);
    btn.className = [
      'flex-1 py-1.5 rounded text-sm font-semibold border transition-colors',
      d === state.difficulty
        ? 'bg-blue-600 text-white border-blue-700'
        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50',
    ].join(' ');
    btn.addEventListener('click', () => { if (d !== state.difficulty) onDifficulty(d); });
    diffRow.appendChild(btn);
  }
  wrap.appendChild(diffRow);

  const statsRow = document.createElement('div');
  statsRow.className = 'flex items-center justify-between px-1';

  const timerWrap = document.createElement('div');
  timerWrap.className = 'flex flex-col items-center';
  const timerLabel = document.createElement('span');
  timerLabel.textContent = 'Time';
  timerLabel.className = 'text-xs text-gray-500 uppercase tracking-wide';
  const timerVal = document.createElement('span');
  timerVal.textContent = formatTime(state.timerSeconds);
  timerVal.className = 'text-xl font-mono font-bold text-gray-800';
  timerVal.dataset.timer = '';
  timerWrap.appendChild(timerLabel);
  timerWrap.appendChild(timerVal);

  const newGameBtn = document.createElement('button');
  newGameBtn.textContent = 'New Game';
  newGameBtn.className = 'px-3 py-1.5 rounded text-sm font-semibold border transition-colors bg-green-600 text-white border-green-700 hover:bg-green-700 active:bg-green-800';
  newGameBtn.addEventListener('click', onNewGame);

  const bestWrap = document.createElement('div');
  bestWrap.className = 'flex flex-col items-center';
  const bestLabel = document.createElement('span');
  bestLabel.textContent = 'Best';
  bestLabel.className = 'text-xs text-gray-500 uppercase tracking-wide';
  const bestVal = document.createElement('span');
  bestVal.textContent = bestTime === null ? '--:--' : formatTime(bestTime);
  bestVal.className = 'text-xl font-mono font-bold text-gray-400';
  bestWrap.appendChild(bestLabel);
  bestWrap.appendChild(bestVal);

  statsRow.appendChild(timerWrap);
  statsRow.appendChild(newGameBtn);
  statsRow.appendChild(bestWrap);
  wrap.appendChild(statsRow);

  return wrap;
}

function renderCompletionModal(
  seconds: number,
  isNewBest: boolean,
  onNewGame: () => void,
): HTMLElement {
  const overlay = document.createElement('div');
  overlay.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50';

  const card = document.createElement('div');
  card.className = 'bg-white rounded-2xl shadow-2xl p-8 flex flex-col items-center gap-4 mx-4 max-w-sm w-full';

  const emoji = document.createElement('div');
  emoji.textContent = '🎉';
  emoji.className = 'text-5xl';

  const heading = document.createElement('h2');
  heading.textContent = 'Puzzle Solved!';
  heading.className = 'text-2xl font-bold text-gray-800';

  const timeP = document.createElement('p');
  timeP.textContent = `Your time: ${formatTime(seconds)}`;
  timeP.className = 'text-lg font-mono text-gray-600';

  const bestP = document.createElement('p');
  bestP.textContent = isNewBest ? '🏆 New best time!' : '';
  bestP.className = 'text-yellow-600 font-semibold text-sm';

  const btn = document.createElement('button');
  btn.textContent = 'New Game';
  btn.className = 'mt-2 px-6 py-2 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700 transition-colors';
  btn.addEventListener('click', () => { overlay.remove(); onNewGame(); });

  card.append(emoji, heading, timeP, bestP, btn);
  overlay.appendChild(card);
  return overlay;
}

// ─── Persistence ──────────────────────────────────────────────────────────────

const BEST_TIMES_KEY = 'sudoku-best-times';

function loadBestTimes(): Record<Difficulty, number | null> {
  try {
    const raw = localStorage.getItem(BEST_TIMES_KEY);
    if (!raw) return { easy: null, medium: null, hard: null };
    const parsed = JSON.parse(raw) as Record<string, number | null>;
    return {
      easy: parsed.easy ?? null,
      medium: parsed.medium ?? null,
      hard: parsed.hard ?? null,
    };
  } catch {
    return { easy: null, medium: null, hard: null };
  }
}

function saveBestTime(difficulty: Difficulty, seconds: number): boolean {
  const times = loadBestTimes();
  const current = times[difficulty];
  if (current === null || seconds < current) {
    times[difficulty] = seconds;
    localStorage.setItem(BEST_TIMES_KEY, JSON.stringify(times));
    return true;
  }
  return false;
}

// ─── App ──────────────────────────────────────────────────────────────────────

const appEl = document.getElementById('app')!;
let gameState = initGame('easy');
let bestTimes = loadBestTimes();
let stopTimer: (() => void) | null = null;

function render(): void {
  appEl.innerHTML = '';

  const page = document.createElement('div');
  page.className = 'min-h-screen bg-gray-100 flex flex-col items-center justify-start px-4 py-4 gap-4';

  page.appendChild(
    renderHeader(gameState, bestTimes[gameState.difficulty], () => startGame(gameState.difficulty), d => startGame(d))
  );

  const boardWrap = document.createElement('div');
  boardWrap.className = 'w-full max-w-sm sm:max-w-md';
  renderBoard(gameState, boardWrap, (r, c) => {
    gameState = selectCell(gameState, r, c);
    render();
  });
  page.appendChild(boardWrap);

  const controlsWrap = document.createElement('div');
  controlsWrap.className = 'w-full max-w-sm sm:max-w-md';
  controlsWrap.appendChild(
    renderControls(
      gameState,
      n => { gameState = enterOrHighlight(gameState, n); afterMove(); },
      () => { gameState = eraseCell(gameState); render(); },
      () => { gameState = toggleInputMode(gameState); render(); },
      () => { gameState = undoMove(gameState); render(); },
    )
  );
  page.appendChild(controlsWrap);

  appEl.appendChild(page);
}

function afterMove(): void {
  if (gameState.isComplete) {
    stopTimer?.();
    stopTimer = null;
    const isNewBest = saveBestTime(gameState.difficulty, gameState.timerSeconds);
    bestTimes = loadBestTimes();
    render();
    document.body.appendChild(renderCompletionModal(gameState.timerSeconds, isNewBest, () => startGame(gameState.difficulty)));
  } else {
    render();
  }
}

function startGame(difficulty: Difficulty): void {
  stopTimer?.();
  gameState = initGame(difficulty);
  bestTimes = loadBestTimes();
  render();

  stopTimer = (() => {
    const id = setInterval(() => {
      if (!gameState.isComplete) {
        gameState = { ...gameState, timerSeconds: gameState.timerSeconds + 1 };
        const el = document.querySelector<HTMLElement>('[data-timer]');
        if (el) el.textContent = formatTime(gameState.timerSeconds);
      }
    }, 1000);
    return () => clearInterval(id);
  })();
}

document.addEventListener('keydown', e => {
  if (e.key >= '1' && e.key <= '9') {
    gameState = enterOrHighlight(gameState, parseInt(e.key));
    afterMove();
  } else if (e.key === 'Backspace' || e.key === 'Delete') {
    gameState = eraseCell(gameState);
    render();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault(); gameState = moveSelection(gameState, -1, 0); render();
  } else if (e.key === 'ArrowDown') {
    e.preventDefault(); gameState = moveSelection(gameState, 1, 0); render();
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault(); gameState = moveSelection(gameState, 0, -1); render();
  } else if (e.key === 'ArrowRight') {
    e.preventDefault(); gameState = moveSelection(gameState, 0, 1); render();
  } else if (e.key === 'p' || e.key === 'P' || e.key === 'Tab') {
    e.preventDefault(); gameState = toggleInputMode(gameState); render();
  } else if (e.ctrlKey && e.key === 'z') {
    e.preventDefault(); gameState = undoMove(gameState); render();
  }
});

startGame('easy');
