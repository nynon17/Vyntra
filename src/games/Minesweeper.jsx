import { useEffect, useMemo, useRef, useState } from 'react'

const DIFFICULTY_CONFIG = {
  easy: { label: 'Easy', rows: 9, cols: 9, mines: 10 },
  medium: { label: 'Medium', rows: 16, cols: 16, mines: 40 },
  hard: { label: 'Hard', rows: 16, cols: 30, mines: 99 },
}

const NUMBER_COLORS = {
  1: '#1976d2',
  2: '#2e7d32',
  3: '#d32f2f',
  4: '#512da8',
  5: '#8d6e63',
  6: '#00838f',
  7: '#37474f',
  8: '#455a64',
}

function formatTime(totalSeconds) {
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0')
  const seconds = String(totalSeconds % 60).padStart(2, '0')
  return `${minutes}:${seconds}`
}

function createBoard(rows, cols) {
  return Array.from({ length: rows }, (_, row) =>
    Array.from({ length: cols }, (_, col) => ({
      row,
      col,
      mine: false,
      flagged: false,
      revealed: false,
      adjacentMines: 0,
      exploded: false,
      incorrectFlag: false,
      explosionOrder: -1,
    })),
  )
}

function countAdjacentMines(board, row, col) {
  let count = 0
  for (let r = row - 1; r <= row + 1; r += 1) {
    for (let c = col - 1; c <= col + 1; c += 1) {
      if (r === row && c === col) continue
      if (r < 0 || c < 0 || r >= board.length || c >= board[0].length) continue
      if (board[r][c].mine) count += 1
    }
  }
  return count
}

function updateAdjacency(board) {
  for (let row = 0; row < board.length; row += 1) {
    for (let col = 0; col < board[0].length; col += 1) {
      board[row][col].adjacentMines = board[row][col].mine
        ? -1
        : countAdjacentMines(board, row, col)
    }
  }
}

function placeMinesRandomly(board, mineCount) {
  const rows = board.length
  const cols = board[0].length
  const positions = []
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      positions.push([row, col])
    }
  }
  for (let i = positions.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[positions[i], positions[j]] = [positions[j], positions[i]]
  }
  for (let i = 0; i < mineCount; i += 1) {
    const [row, col] = positions[i]
    board[row][col].mine = true
  }
  updateAdjacency(board)
}

function cloneBoard(board) {
  return board.map((row) => row.map((cell) => ({ ...cell })))
}

function revealConnectedEmpties(board, startRow, startCol) {
  const queue = [[startRow, startCol]]
  const seen = new Set()

  while (queue.length > 0) {
    const [row, col] = queue.shift()
    const key = `${row}-${col}`
    if (seen.has(key)) continue
    seen.add(key)

    const cell = board[row][col]
    if (cell.revealed || cell.flagged) continue
    cell.revealed = true

    if (cell.adjacentMines !== 0) continue

    for (let r = row - 1; r <= row + 1; r += 1) {
      for (let c = col - 1; c <= col + 1; c += 1) {
        if (r === row && c === col) continue
        if (r < 0 || c < 0 || r >= board.length || c >= board[0].length) continue
        const next = board[r][c]
        if (!next.revealed && !next.flagged && !next.mine) {
          queue.push([r, c])
        }
      }
    }
  }
}

function allSafeCellsRevealed(board) {
  for (let row = 0; row < board.length; row += 1) {
    for (let col = 0; col < board[0].length; col += 1) {
      const cell = board[row][col]
      if (!cell.mine && !cell.revealed) return false
    }
  }
  return true
}

function moveMineIfNeeded(board, clickedRow, clickedCol) {
  const clicked = board[clickedRow][clickedCol]
  if (!clicked.mine) return

  const targets = []
  for (let row = 0; row < board.length; row += 1) {
    for (let col = 0; col < board[0].length; col += 1) {
      if (row === clickedRow && col === clickedCol) continue
      if (!board[row][col].mine) targets.push([row, col])
    }
  }

  if (targets.length === 0) return
  const [targetRow, targetCol] = targets[Math.floor(Math.random() * targets.length)]
  board[targetRow][targetCol].mine = true
  clicked.mine = false
  updateAdjacency(board)
}

export default function Minesweeper({ onBack }) {
  const [difficulty, setDifficulty] = useState('easy')
  const config = useMemo(() => DIFFICULTY_CONFIG[difficulty], [difficulty])
  const [board, setBoard] = useState(() => {
    const initialBoard = createBoard(DIFFICULTY_CONFIG.easy.rows, DIFFICULTY_CONFIG.easy.cols)
    placeMinesRandomly(initialBoard, DIFFICULTY_CONFIG.easy.mines)
    return initialBoard
  })
  const [hasStarted, setHasStarted] = useState(false)
  const [timerSeconds, setTimerSeconds] = useState(0)
  const [status, setStatus] = useState('idle') // idle | playing | won | exploding | lost
  const [showDifficultySelector, setShowDifficultySelector] = useState(true)
  const timerIntervalRef = useRef(null)


  const totalFlags = useMemo(
    () => board.flat().filter((cell) => cell.flagged).length,
    [board],
  )

  const minesLeft = Math.max(config.mines - totalFlags, 0)

  useEffect(() => {
    if (status !== 'playing') return undefined
    timerIntervalRef.current = setInterval(() => {
      setTimerSeconds((current) => current + 1)
    }, 1000)
    return () => {
      clearInterval(timerIntervalRef.current)
      timerIntervalRef.current = null
    }
  }, [status])

  useEffect(() => {
    return () => {
      clearInterval(timerIntervalRef.current)
    }
  }, [])

  const resetForDifficulty = (nextDifficulty) => {
    const nextConfig = DIFFICULTY_CONFIG[nextDifficulty]
    const nextBoard = createBoard(nextConfig.rows, nextConfig.cols)
    placeMinesRandomly(nextBoard, nextConfig.mines)
    clearInterval(timerIntervalRef.current)
    timerIntervalRef.current = null
    setDifficulty(nextDifficulty)
    setBoard(nextBoard)
    setTimerSeconds(0)
    setHasStarted(false)
    setStatus('idle')
    setShowDifficultySelector(true)
  }

  const restartToDifficultySelection = () => {
    resetForDifficulty(difficulty)
  }
  const handleBack = () => {
    resetForDifficulty(difficulty)
    onBack()
  }

  const handleDifficultyChange = (nextDifficulty) => {
    if (nextDifficulty === difficulty && status === 'idle') return
    resetForDifficulty(nextDifficulty)
  }

  const handleLeftClick = (row, col) => {
    if (status === 'exploding' || status === 'lost' || status === 'won') return

    const nextBoard = cloneBoard(board)
    const cell = nextBoard[row][col]
    if (cell.revealed || cell.flagged) return

    if (!hasStarted) {
      moveMineIfNeeded(nextBoard, row, col)
      setHasStarted(true)
      setStatus('playing')
      setShowDifficultySelector(false)
    }

    if (cell.mine) {
      let explosionIndex = 0
      for (let r = 0; r < nextBoard.length; r += 1) {
        for (let c = 0; c < nextBoard[0].length; c += 1) {
          const current = nextBoard[r][c]
          if (current.mine) {
            current.revealed = true
            current.explosionOrder = explosionIndex
            explosionIndex += 1
          }
          if (current.flagged && !current.mine) {
            current.incorrectFlag = true
          }
        }
      }
      cell.exploded = true
      setBoard(nextBoard)
      setStatus('exploding')
      clearInterval(timerIntervalRef.current)
      timerIntervalRef.current = null
      const endDelay = explosionIndex * 30 + 800
      window.setTimeout(() => setStatus('lost'), endDelay)
      return
    }

    if (cell.adjacentMines === 0) {
      revealConnectedEmpties(nextBoard, row, col)
    } else {
      cell.revealed = true
    }

    const hasWon = allSafeCellsRevealed(nextBoard)
    setBoard(nextBoard)
    if (hasWon) {
      setStatus('won')
      clearInterval(timerIntervalRef.current)
      timerIntervalRef.current = null
    }
  }

  const handleRightClick = (event, row, col) => {
    event.preventDefault()
    if (status === 'exploding' || status === 'lost' || status === 'won') return
    const nextBoard = cloneBoard(board)
    const cell = nextBoard[row][col]
    if (cell.revealed) return
    cell.flagged = !cell.flagged
    setBoard(nextBoard)
  }

  return (
    <section className="minesweeper-page">
      <div className="minesweeper-topbar">
        <button type="button" className="tower-btn" onClick={handleBack}>
          Back
        </button>
        <div className="minesweeper-timer">{formatTime(timerSeconds)}</div>
        <button type="button" className="tower-btn" onClick={restartToDifficultySelection}>
          Restart
        </button>
      </div>

      {showDifficultySelector && (
        <div className="minesweeper-difficulty-card">
          <p className="minesweeper-difficulty-title">Select Difficulty</p>
          <div className="minesweeper-difficulty-buttons">
            {Object.entries(DIFFICULTY_CONFIG).map(([key, value]) => (
              <button
                key={key}
                type="button"
                className={`tower-btn ${difficulty === key ? 'minesweeper-difficulty-active' : ''}`}
                onClick={() => handleDifficultyChange(key)}
              >
                {value.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="minesweeper-stats">
        <span>Mines: {config.mines}</span>
        <span>Flags: {totalFlags}</span>
        <span>Left: {minesLeft}</span>
      </div>

      <div className="minesweeper-board-wrap">
        <div
          className="minesweeper-board"
          style={{ gridTemplateColumns: `repeat(${config.cols}, minmax(0, 1fr))` }}
          onContextMenu={(event) => event.preventDefault()}
        >
          {board.map((row) =>
            row.map((cell) => {
              const classNames = ['minesweeper-cell']
              if (cell.revealed) classNames.push('is-revealed')
              if (cell.flagged) classNames.push('is-flagged')
              if (cell.mine && cell.revealed) classNames.push('is-mine')
              if (cell.exploded) classNames.push('is-triggered')
              if (cell.incorrectFlag) classNames.push('is-incorrect-flag')

              const content = (() => {
                if (!cell.revealed) return cell.flagged ? '🚩' : ''
                if (cell.mine) return '💣'
                if (cell.adjacentMines > 0) return cell.adjacentMines
                return ''
              })()

              const numberColor =
                cell.revealed && !cell.mine && cell.adjacentMines > 0
                  ? NUMBER_COLORS[cell.adjacentMines]
                  : undefined

              return (
                <button
                  key={`${cell.row}-${cell.col}`}
                  type="button"
                  className={classNames.join(' ')}
                  onClick={() => handleLeftClick(cell.row, cell.col)}
                  onContextMenu={(event) => handleRightClick(event, cell.row, cell.col)}
                  style={
                    cell.mine && cell.revealed && status !== 'won'
                      ? { animationDelay: `${cell.explosionOrder * 30}ms` }
                      : numberColor
                        ? { color: numberColor }
                        : undefined
                  }
                >
                  {content}
                  {cell.incorrectFlag && <span className="minesweeper-flag-x">✕</span>}
                </button>
              )
            }),
          )}
        </div>

        {status === 'won' && (
          <div className="minesweeper-overlay">
            <div className="minesweeper-overlay-card">
              <h2>You Win!</h2>
              <p>Time: {formatTime(timerSeconds)}</p>
              <button type="button" className="tower-btn" onClick={restartToDifficultySelection}>
                Restart
              </button>
            </div>
          </div>
        )}

        {status === 'lost' && (
          <div className="minesweeper-overlay">
            <div className="minesweeper-overlay-card">
              <h2>Game Over</h2>
              <button type="button" className="tower-btn" onClick={restartToDifficultySelection}>
                Restart
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
