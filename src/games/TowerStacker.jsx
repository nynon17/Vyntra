import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const BOARD_WIDTH = 360
const BOARD_HEIGHT = 520
const BLOCK_HEIGHT = 28
const BASE_BLOCK_WIDTH = 180
const START_SPEED = 2.75
const SPEED_STEP = 0.1
const MAX_SPEED = 5.0
const PERFECT_SNAP_THRESHOLD = 5
const CAMERA_TRACK_TOP = 120

const getBlockColor = (blockIndex, lightness = 55) =>
  `hsl(${(blockIndex * 15) % 360} 70% ${lightness}%)`

const getMovingSpeed = (level) =>
  Math.min(MAX_SPEED, START_SPEED + level * SPEED_STEP)

const isPerfectAlignment = (moving, previous) => {
  const leftEdgeDiff = Math.abs(moving.x - previous.x)
  const widthMatch = Math.abs(moving.width - previous.width) < 0.01

  return leftEdgeDiff <= PERFECT_SNAP_THRESHOLD && widthMatch
}

const createInitialState = () => {
  const baseY = BOARD_HEIGHT - BLOCK_HEIGHT
  const baseX = (BOARD_WIDTH - BASE_BLOCK_WIDTH) / 2

  return {
    stack: [
      { x: baseX, y: baseY, width: BASE_BLOCK_WIDTH, level: 0, blockIndex: 0 },
    ],
    moving: {
      x: -BASE_BLOCK_WIDTH,
      y: baseY - BLOCK_HEIGHT,
      width: BASE_BLOCK_WIDTH,
      direction: 1,
      speed: START_SPEED,
      level: 1,
      blockIndex: 1,
    },
    fallingPiece: null,
    sparks: [],
    gameOver: false,
  }
}

function TowerStacker({ onBack }) {
  const [state, setState] = useState(createInitialState)
  const animationFrameRef = useRef(null)
  const sparkIdRef = useRef(0)
  const inputLockUntilRef = useRef(0)

  const spawnSparks = useCallback((block) => {
    return Array.from({ length: 12 }, () => {
      const angle = Math.random() * Math.PI * 2
      const distance = 40 + Math.random() * 40

      return {
        id: sparkIdRef.current++,
        x: block.x + Math.random() * block.width,
        y: block.y,
        dx: Math.cos(angle) * distance,
        dy: Math.sin(angle) * distance,
        color: getBlockColor(block.blockIndex, 80),
      }
    })
  }, [])

  const resolveDrop = useCallback(
    (current, { perfectSnap = false, overrideX = null } = {}) => {
      if (current.gameOver) return current

      const previous = current.stack[current.stack.length - 1]
      const moving =
        overrideX === null ? current.moving : { ...current.moving, x: overrideX }
      const overlapStart = Math.max(previous.x, moving.x)
      const overlapEnd = Math.min(previous.x + previous.width, moving.x + moving.width)
      const overlapWidth = overlapEnd - overlapStart

      if (overlapWidth <= 0) {
        return {
          ...current,
          gameOver: true,
          fallingPiece: {
            x: moving.x,
            y: moving.y,
            width: moving.width,
            drift: moving.direction * 2.4,
            velocityY: 2.8,
            opacity: 1,
            color: getBlockColor(moving.blockIndex),
          },
        }
      }

      const cutLeft = overlapStart - moving.x
      const cutRight = moving.x + moving.width - overlapEnd
      const cutWidth = cutLeft > 0 ? cutLeft : cutRight
      const cutX = cutLeft > 0 ? moving.x : overlapEnd

      const nextBlock = {
        x: overlapStart,
        y: moving.y,
        width: overlapWidth,
        level: moving.level,
        blockIndex: moving.blockIndex,
      }

      const nextMoving = {
        x: -overlapWidth,
        y: moving.y - BLOCK_HEIGHT,
        width: overlapWidth,
        direction: 1,
        speed: getMovingSpeed(moving.level),
        level: moving.level + 1,
        blockIndex: moving.blockIndex + 1,
      }

      return {
        ...current,
        stack: [...current.stack, nextBlock],
        moving: nextMoving,
        fallingPiece:
          cutWidth > 0
            ? {
                x: cutX,
                y: moving.y,
                width: cutWidth,
                drift: moving.direction > 0 ? 2 : -2,
                velocityY: 2.2,
                opacity: 1,
                color: getBlockColor(moving.blockIndex),
              }
            : null,
        sparks: perfectSnap
          ? [...current.sparks, ...spawnSparks(nextBlock)]
          : current.sparks,
        gameOver: false,
      }
    },
    [spawnSparks],
  )

  const restart = useCallback(() => {
    inputLockUntilRef.current = Date.now() + 300
    setState(createInitialState())
  }, [])

  const dropBlock = useCallback(() => {
    if (Date.now() < inputLockUntilRef.current) {
      return
    }
    setState((current) => {
      const previous = current.stack[current.stack.length - 1]
      const perfectSnap = isPerfectAlignment(current.moving, previous)
      const overrideX = perfectSnap ? previous.x : null

      return resolveDrop(current, { perfectSnap, overrideX })
    })
  }, [resolveDrop])

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.code === 'Space') {
        event.preventDefault()
        dropBlock()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [dropBlock])

  useEffect(() => {
    const tick = () => {
      setState((current) => {
        const next = { ...current }

        if (!current.gameOver) {
          let nextX = current.moving.x + current.moving.direction * current.moving.speed
          let nextDirection = current.moving.direction
          if (nextX <= -current.moving.width) {
            nextX = -current.moving.width
            nextDirection = 1
          } else if (nextX + current.moving.width >= BOARD_WIDTH) {
            nextX = BOARD_WIDTH - current.moving.width
            nextDirection = -1
          }

          next.moving = {
            ...current.moving,
            x: nextX,
            direction: nextDirection,
          }
        }

        if (current.fallingPiece) {
          const falling = current.fallingPiece
          const updatedFalling = {
            ...falling,
            x: falling.x + falling.drift,
            y: falling.y + falling.velocityY,
            velocityY: falling.velocityY + 0.22,
            opacity: Math.max(0, falling.opacity - 0.03),
          }

          next.fallingPiece =
            updatedFalling.y > BOARD_HEIGHT + BLOCK_HEIGHT || updatedFalling.opacity <= 0
              ? null
              : updatedFalling
        }

        return next
      })

      animationFrameRef.current = window.requestAnimationFrame(tick)
    }

    animationFrameRef.current = window.requestAnimationFrame(tick)
    return () => window.cancelAnimationFrame(animationFrameRef.current)
  }, [resolveDrop])

  const score = useMemo(() => Math.max(0, state.stack.length - 1), [state.stack.length])
  const cameraOffset = useMemo(
    () => Math.max(0, CAMERA_TRACK_TOP - state.moving.y),
    [state.moving.y],
  )

  return (
    <section className="tower-page">
      <div className="tower-topbar">
        <button type="button" className="tower-btn" onClick={onBack}>
          ← Back
        </button>
        <p className="tower-score">Score: {score}</p>
        <div className="tower-score-placeholder" />
      </div>

      <div className="tower-hint">Click anywhere in the game area or press Space to drop</div>

      <div
        className="tower-board"
        role="button"
        tabIndex={0}
        onClick={dropBlock}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            dropBlock()
          }
        }}
      >
        <div
          className="tower-world"
          style={{ transform: `translateY(${cameraOffset}px)` }}
        >
          {state.stack.map((block) => (
            <div
              key={`${block.level}-${block.y}`}
              className="tower-block tower-block-stack"
              style={{
                left: `${block.x}px`,
                width: `${block.width}px`,
                bottom: `${BOARD_HEIGHT - (block.y + BLOCK_HEIGHT)}px`,
                height: `${BLOCK_HEIGHT}px`,
                backgroundColor: getBlockColor(block.blockIndex),
              }}
            />
          ))}

          {!state.gameOver && (
            <div
              className="tower-block tower-block-moving"
              style={{
                left: `${state.moving.x}px`,
                width: `${state.moving.width}px`,
                bottom: `${BOARD_HEIGHT - (state.moving.y + BLOCK_HEIGHT)}px`,
                height: `${BLOCK_HEIGHT}px`,
                backgroundColor: getBlockColor(state.moving.blockIndex),
              }}
            />
          )}

          {state.fallingPiece && (
            <div
              className="tower-block tower-block-falling"
              style={{
                left: `${state.fallingPiece.x}px`,
                width: `${state.fallingPiece.width}px`,
                bottom: `${BOARD_HEIGHT - (state.fallingPiece.y + BLOCK_HEIGHT)}px`,
                height: `${BLOCK_HEIGHT}px`,
                opacity: state.fallingPiece.opacity,
                backgroundColor: state.fallingPiece.color,
              }}
            />
          )}

          {state.sparks.map((spark) => (
            <div
              key={spark.id}
              className="tower-spark"
              style={{
                left: `${spark.x}px`,
                top: `${spark.y}px`,
                backgroundColor: spark.color,
                '--dx': `${spark.dx}px`,
                '--dy': `${spark.dy}px`,
              }}
              onAnimationEnd={() => {
                setState((current) => ({
                  ...current,
                  sparks: current.sparks.filter((item) => item.id !== spark.id),
                }))
              }}
            />
          ))}
        </div>

        {state.gameOver && (
          <div className="tower-overlay">
            <div className="tower-overlay-content">
              <p>Game Over</p>
              <small>Final score: {score}</small>
              <button
                type="button"
                className="tower-btn"
                onClick={(event) => {
                  event.stopPropagation()
                  restart()
                }}
              >
                Restart
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}

export default TowerStacker
