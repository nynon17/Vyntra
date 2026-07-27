import { useEffect, useMemo, useRef, useState } from 'react'
import './CarChase.css'

const DIFFICULTIES = {
  Easy: { baseSpeed: 100, maxSpeed: 160, spawnInterval: 900, crashSpeedPenalty: 40 },
  Medium: { baseSpeed: 150, maxSpeed: 240, spawnInterval: 600, crashSpeedPenalty: 65 },
  Hard: { baseSpeed: 180, maxSpeed: 280, spawnInterval: 350, crashSpeedPenalty: 90 },
}

function getRandomSpawnDelay(baseInterval) {
  const jitter = (Math.random() * 2 - 1) * SPAWN_JITTER_MS
  return Math.max(120, baseInterval + jitter)
}

const CAR_COLORS = [
  'red',
  'blue',
  'yellow',
  'green',
  'orange',
  'purple',
  'teal',
  'pink',
  'white',
  'brown',
]

const PLAYER_Y = 85
const PLAYER_WIDTH = 44
const PLAYER_HEIGHT = 74
const POLICE_HEIGHT = 78
const TRAFFIC_WIDTH = 46
const TRAFFIC_HEIGHT = 70
const PLAYER_HITBOX_FACTOR = 0.8
const TRAFFIC_HITBOX_FACTOR = 0.8
const MIN_SPEED = 35
const ACCELERATION = 8
const TRAFFIC_SPEED_FACTOR = 0.35
const SPAWN_JITTER_MS = 200

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function formatTime(seconds) {
  const mins = String(Math.floor(seconds / 60)).padStart(2, '0')
  const secs = String(seconds % 60).padStart(2, '0')
  return `${mins}:${secs}`
}

function getLaneCenterPercent(lane) {
  // plain rectangle road: fixed left/right
  const left = 15
  const right = 85
  const width = right - left
  return left + ((lane + 0.5) * width) / 3
}

export default function CarChase({ onBack }) {
  const [screen, setScreen] = useState('start') // start | playing | game-over
  const [difficulty, setDifficulty] = useState('Medium')
  const [playerLane, setPlayerLane] = useState(1)
  const [trafficCars, setTrafficCars] = useState([])
  const [timerSeconds, setTimerSeconds] = useState(0)
  const [playerFlash, setPlayerFlash] = useState(false)
  const [sirenFlashColor, setSirenFlashColor] = useState(null)
  const [laneChangeDirection, setLaneChangeDirection] = useState(0)
  const [showSpeedLines, setShowSpeedLines] = useState(false)
  const [speedLinesDirection, setSpeedLinesDirection] = useState(0)
  const [speedLinesSeed, setSpeedLinesSeed] = useState(0)
  const [finalTime, setFinalTime] = useState(0)
  const arenaRef = useRef(null)
  const touchStartXRef = useRef(null)
  const animationFrameRef = useRef(null)
  const flashTimeoutRef = useRef(null)
  const laneChangeFxTimeoutRef = useRef(null)
  const speedLinesTimeoutRef = useRef(null)

  const runtimeRef = useRef({
    playerLane: 1,
    playerSpeed: DIFFICULTIES.Medium.baseSpeed,
    elapsedSeconds: 0,
    nextSpawnInMs: DIFFICULTIES.Medium.spawnInterval,
    policeY: 112,
    policeLane: 1,
    policeFollowDelayMs: 0,
    sirenFlashElapsedMs: 0,
    sirenFlashBlueOn: true,
    sirenFlashColor: null,
    cars: [],
    nextCarId: 1,
    lastTimestamp: null,
    gameRunning: false,
    recentColors: [],
  })

  const settings = DIFFICULTIES[difficulty]

  const laneDividers = useMemo(() => {
    return [1, 2].map((dividerIndex) => 15 + (70 * dividerIndex) / 3)
  }, [])

  function setLaneByDelta(delta) {
    const currentLane = runtimeRef.current.playerLane
    const nextLane = clamp(currentLane + delta, 0, 2)
    const moved = nextLane !== currentLane
    if (moved) {
      runtimeRef.current.policeFollowDelayMs = 120
      setLaneChangeDirection(delta > 0 ? 1 : -1)
      if (laneChangeFxTimeoutRef.current) window.clearTimeout(laneChangeFxTimeoutRef.current)
      laneChangeFxTimeoutRef.current = window.setTimeout(() => setLaneChangeDirection(0), 150)

      setSpeedLinesDirection(delta > 0 ? 1 : -1)
      setShowSpeedLines(true)
      setSpeedLinesSeed((prev) => prev + 1)
      if (speedLinesTimeoutRef.current) window.clearTimeout(speedLinesTimeoutRef.current)
      speedLinesTimeoutRef.current = window.setTimeout(() => setShowSpeedLines(false), 200)
    }
    runtimeRef.current.playerLane = nextLane
    setPlayerLane(nextLane)
  }


  function pickCarColor() {
    const recent = runtimeRef.current.recentColors
    let candidates = [...CAR_COLORS]
    if (recent.length >= 2 && recent[recent.length - 1] === recent[recent.length - 2]) {
      candidates = candidates.filter((color) => color !== recent[recent.length - 1])
    }
    const color = candidates[Math.floor(Math.random() * candidates.length)]
    runtimeRef.current.recentColors = [...recent, color].slice(-3)
    return color
  }

  function createTrafficCar(roadHeightPx) {
    const lane = Math.floor(Math.random() * 3)
    const blocked = runtimeRef.current.cars.some((car) => {
      if (car.lane !== lane) return false
      const yPx = (car.y / 100) * roadHeightPx
      return yPx <= 120
    })
    if (blocked) return null
    const color = pickCarColor()
    const useBlackDetails = Math.random() < 0.3 || ['white', 'yellow', 'pink'].includes(color)
    const car = {
      id: runtimeRef.current.nextCarId,
      lane,
      y: -12,
      color,
      useBlackDetails,
      collided: false,
    }
    runtimeRef.current.nextCarId += 1
    return car
  }

  function getWorldRect(centerXPercent, yPercent, widthPx, heightPx, scale, arenaRect) {
    const centerX = (centerXPercent / 100) * arenaRect.width
    const centerY = (yPercent / 100) * arenaRect.height
    const width = widthPx * scale
    const height = heightPx * scale
    return {
      left: centerX - width / 2,
      right: centerX + width / 2,
      top: centerY - height / 2,
      bottom: centerY + height / 2,
      width,
      height,
    }
  }

  function intersects(a, b) {
    return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
  }

  function runFrame(timestamp) {
    const runtime = runtimeRef.current
    if (!runtime.gameRunning) return

    if (runtime.lastTimestamp === null) {
      runtime.lastTimestamp = timestamp
      animationFrameRef.current = window.requestAnimationFrame(runFrame)
      return
    }

    const frameMs = Math.min(48, timestamp - runtime.lastTimestamp)
    const delta = frameMs / 1000
    runtime.lastTimestamp = timestamp

    runtime.playerSpeed = clamp(
      runtime.playerSpeed + ACCELERATION * delta,
      MIN_SPEED,
      settings.maxSpeed,
    )

    runtime.cars = runtime.cars.map((car) => ({
      ...car,
      y: car.y + runtime.playerSpeed * TRAFFIC_SPEED_FACTOR * delta,
    }))

    const arenaRect = arenaRef.current?.getBoundingClientRect()
    if (arenaRect) {
      const playerCenterX = getLaneCenterPercent(runtime.playerLane)
      const playerRectRaw = getWorldRect(
        playerCenterX,
        PLAYER_Y,
        PLAYER_WIDTH,
        PLAYER_HEIGHT,
        1,
        arenaRect,
      )
      const playerInsetX = (playerRectRaw.width * (1 - PLAYER_HITBOX_FACTOR)) / 2
      const playerInsetY = (playerRectRaw.height * (1 - PLAYER_HITBOX_FACTOR)) / 2
      const playerHit = {
        left: playerRectRaw.left + playerInsetX,
        right: playerRectRaw.right - playerInsetX,
        top: playerRectRaw.top + playerInsetY,
        bottom: playerRectRaw.bottom - playerInsetY,
      }

      runtime.cars = runtime.cars.map((car) => {
        if (car.collided) return car
        const carCenterX = getLaneCenterPercent(car.lane)
        const carRectRaw = getWorldRect(
          carCenterX,
          car.y,
          TRAFFIC_WIDTH,
          TRAFFIC_HEIGHT,
          1,
          arenaRect,
        )
        const carInsetX = (carRectRaw.width * (1 - TRAFFIC_HITBOX_FACTOR)) / 2
        const carInsetY = (carRectRaw.height * (1 - TRAFFIC_HITBOX_FACTOR)) / 2
        const carHit = {
          left: carRectRaw.left + carInsetX,
          right: carRectRaw.right - carInsetX,
          top: carRectRaw.top + carInsetY,
          bottom: carRectRaw.bottom - carInsetY,
        }
        if (!intersects(playerHit, carHit)) return car

        runtime.playerSpeed = clamp(
          runtime.playerSpeed - settings.crashSpeedPenalty,
          MIN_SPEED,
          settings.maxSpeed,
        )
        if (flashTimeoutRef.current) {
          window.clearTimeout(flashTimeoutRef.current)
        }
        setPlayerFlash(true)
        flashTimeoutRef.current = window.setTimeout(() => setPlayerFlash(false), 300)
        return { ...car, collided: true }
      })
    }

    const policeAdvance =
      runtime.playerSpeed < settings.baseSpeed
        ? (settings.baseSpeed - runtime.playerSpeed) * 1.5
        : -2
    runtime.policeY -= policeAdvance * delta
    if (runtime.policeFollowDelayMs > 0) {
      runtime.policeFollowDelayMs = Math.max(0, runtime.policeFollowDelayMs - frameMs)
    } else {
      const laneGap = runtime.playerLane - runtime.policeLane
      const laneStep = Math.sign(laneGap) * Math.min(Math.abs(laneGap), delta * 5)
      runtime.policeLane += laneStep
    }
    const playerHalfPercent = arenaRect ? ((PLAYER_HEIGHT / 2) / arenaRect.height) * 100 : 0
    const policeHalfPercent = arenaRect ? ((POLICE_HEIGHT / 2) / arenaRect.height) * 100 : 0
    const playerBottomY = PLAYER_Y + playerHalfPercent
    const policeTopY = runtime.policeY - policeHalfPercent
    const bumperDistancePx = arenaRect
      ? ((policeTopY - playerBottomY) / 100) * arenaRect.height
      : Number.POSITIVE_INFINITY
    const shouldFlash = bumperDistancePx < 150

    if (shouldFlash) {
      runtime.sirenFlashElapsedMs += frameMs
      while (runtime.sirenFlashElapsedMs >= 250) {
        runtime.sirenFlashElapsedMs -= 250
        runtime.sirenFlashBlueOn = !runtime.sirenFlashBlueOn
      }
      const nextSirenColor = runtime.sirenFlashBlueOn ? 'blue' : 'red'
      if (runtime.sirenFlashColor !== nextSirenColor) {
        runtime.sirenFlashColor = nextSirenColor
        setSirenFlashColor(nextSirenColor)
      }
    } else if (
      runtime.sirenFlashColor !== null ||
      runtime.sirenFlashElapsedMs !== 0 ||
      runtime.sirenFlashBlueOn !== true
    ) {
      runtime.sirenFlashElapsedMs = 0
      runtime.sirenFlashBlueOn = true
      runtime.sirenFlashColor = null
      setSirenFlashColor(null)
    }

    if (policeTopY <= playerBottomY) {
      if (Math.abs(runtime.policeLane - runtime.playerLane) < 0.03) {
        runtime.policeLane = runtime.playerLane
        runtime.policeY = playerBottomY + policeHalfPercent
        runtime.sirenFlashElapsedMs = 0
        runtime.sirenFlashBlueOn = true
        runtime.sirenFlashColor = null
        setSirenFlashColor(null)
        runtime.gameRunning = false
        setFinalTime(Math.floor(runtime.elapsedSeconds))
        setScreen('game-over')
        return
      }
      runtime.policeY = playerBottomY + policeHalfPercent + 0.5
    }

    runtime.nextSpawnInMs -= frameMs
    if (runtime.nextSpawnInMs <= 0) {
      const roadHeightPx = arenaRect?.height ?? 700
      const newCar = createTrafficCar(roadHeightPx)
      if (newCar) runtime.cars = [...runtime.cars, newCar]
      runtime.nextSpawnInMs = getRandomSpawnDelay(settings.spawnInterval)
    }

    runtime.elapsedSeconds += delta
    runtime.cars = runtime.cars.filter((car) => car.y < 120)

    setTimerSeconds(Math.floor(runtime.elapsedSeconds))
    setTrafficCars(runtime.cars)
    animationFrameRef.current = window.requestAnimationFrame(runFrame)
  }

  function startGame() {
    const runtime = runtimeRef.current
    runtime.playerLane = 1
    runtime.playerSpeed = settings.baseSpeed
    runtime.elapsedSeconds = 0
    runtime.nextSpawnInMs = getRandomSpawnDelay(settings.spawnInterval)
    runtime.policeY = 112
    runtime.policeLane = runtime.playerLane
    runtime.policeFollowDelayMs = 0
    runtime.sirenFlashElapsedMs = 0
    runtime.sirenFlashBlueOn = true
    runtime.sirenFlashColor = null
    runtime.cars = []
    runtime.nextCarId = 1
    runtime.lastTimestamp = null
    runtime.gameRunning = true
    runtime.recentColors = []

    setTimerSeconds(0)
    setPlayerLane(1)
    setPlayerFlash(false)
    setSirenFlashColor(null)
    setLaneChangeDirection(0)
    setShowSpeedLines(false)
    setSpeedLinesDirection(0)
    setTrafficCars([])
    setScreen('playing')

    if (animationFrameRef.current) {
      window.cancelAnimationFrame(animationFrameRef.current)
    }
    animationFrameRef.current = window.requestAnimationFrame(runFrame)
  }

  function goToStart() {
    runtimeRef.current.gameRunning = false
    if (animationFrameRef.current) {
      window.cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
    if (flashTimeoutRef.current) {
      window.clearTimeout(flashTimeoutRef.current)
      flashTimeoutRef.current = null
    }
    if (laneChangeFxTimeoutRef.current) {
      window.clearTimeout(laneChangeFxTimeoutRef.current)
      laneChangeFxTimeoutRef.current = null
    }
    if (speedLinesTimeoutRef.current) {
      window.clearTimeout(speedLinesTimeoutRef.current)
      speedLinesTimeoutRef.current = null
    }
    setPlayerFlash(false)
    setSirenFlashColor(null)
    setLaneChangeDirection(0)
    setShowSpeedLines(false)
    setSpeedLinesDirection(0)
    setScreen('start')
  }

  function resetAndExit() {
    runtimeRef.current.gameRunning = false
    if (animationFrameRef.current) {
      window.cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }
    if (flashTimeoutRef.current) {
      window.clearTimeout(flashTimeoutRef.current)
      flashTimeoutRef.current = null
    }
    if (laneChangeFxTimeoutRef.current) {
      window.clearTimeout(laneChangeFxTimeoutRef.current)
      laneChangeFxTimeoutRef.current = null
    }
    if (speedLinesTimeoutRef.current) {
      window.clearTimeout(speedLinesTimeoutRef.current)
      speedLinesTimeoutRef.current = null
    }
    runtimeRef.current = {
      playerLane: 1,
      playerSpeed: DIFFICULTIES.Medium.baseSpeed,
      elapsedSeconds: 0,
      nextSpawnInMs: DIFFICULTIES.Medium.spawnInterval,
      policeY: 112,
      policeLane: 1,
      policeFollowDelayMs: 0,
      sirenFlashElapsedMs: 0,
      sirenFlashBlueOn: true,
      sirenFlashColor: null,
      cars: [],
      nextCarId: 1,
      lastTimestamp: null,
      gameRunning: false,
      recentColors: [],
    }
    setDifficulty('Medium')
    setTimerSeconds(0)
    setPlayerLane(1)
    setPlayerFlash(false)
    setSirenFlashColor(null)
    setLaneChangeDirection(0)
    setShowSpeedLines(false)
    setSpeedLinesDirection(0)
    setTrafficCars([])
    setFinalTime(0)
    setScreen('start')
    onBack()
  }

  useEffect(() => {
    function onKeyDown(event) {
      if (screen !== 'playing') return
      if (event.key === 'ArrowLeft' || event.key === 'a' || event.key === 'A') {
        event.preventDefault()
        setLaneByDelta(-1)
      } else if (event.key === 'ArrowRight' || event.key === 'd' || event.key === 'D') {
        event.preventDefault()
        setLaneByDelta(1)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [screen])

  useEffect(() => {
    const arena = arenaRef.current
    if (!arena) return undefined
    const onTouchStart = (event) => {
      if (screen !== 'playing') return
      touchStartXRef.current = event.touches[0]?.clientX ?? null
    }
    const onTouchEnd = (event) => {
      if (screen !== 'playing') return
      if (touchStartXRef.current === null) return
      const endX = event.changedTouches[0]?.clientX
      if (typeof endX !== 'number') return
      const deltaX = endX - touchStartXRef.current
      if (deltaX >= 30) {
        setLaneByDelta(1)
      } else if (deltaX <= -30) {
        setLaneByDelta(-1)
      }
      touchStartXRef.current = null
    }
    arena.addEventListener('touchstart', onTouchStart, { passive: true })
    arena.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      arena.removeEventListener('touchstart', onTouchStart)
      arena.removeEventListener('touchend', onTouchEnd)
    }
  }, [screen])

  useEffect(() => {
    return () => {
      runtimeRef.current.gameRunning = false
      if (animationFrameRef.current) window.cancelAnimationFrame(animationFrameRef.current)
      if (flashTimeoutRef.current) window.clearTimeout(flashTimeoutRef.current)
      if (laneChangeFxTimeoutRef.current) window.clearTimeout(laneChangeFxTimeoutRef.current)
      if (speedLinesTimeoutRef.current) window.clearTimeout(speedLinesTimeoutRef.current)
    }
  }, [])


  const playerLeftPercent = getLaneCenterPercent(playerLane)
  const policeLane = runtimeRef.current.policeLane
  const policeLeftPercent = getLaneCenterPercent(policeLane)

  return (
    <section className="car-chase-page">
      <div className="car-chase-topbar">
        <button type="button" className="tower-btn" onClick={resetAndExit}>
          Back
        </button>
      </div>
      <div className="car-chase-game-wrap">
        <div className="car-chase-timer">{formatTime(timerSeconds)}</div>
        <div className="car-chase-road" ref={arenaRef}>
          {sirenFlashColor && (
            <div
              className={`car-chase-siren-overlay ${
                sirenFlashColor === 'blue'
                  ? 'car-chase-siren-overlay-blue'
                  : 'car-chase-siren-overlay-red'
              }`}
            />
          )}

          <div className="car-chase-divider" style={{ left: `${laneDividers[0]}%` }} />
          <div className="car-chase-divider" style={{ left: `${laneDividers[1]}%` }} />

          {trafficCars.map((car) => {
            const laneLeft = getLaneCenterPercent(car.lane)
            return (
              <div
                key={car.id}
                className="car-chase-traffic-car"
                style={{
                  left: `${laneLeft}%`,
                  top: `${car.y}%`,
                  transform: 'translate(-50%, -50%)',
                  '--car-base': car.color,
                  '--detail-color': car.useBlackDetails ? '#000000' : 'rgba(240, 248, 255, 0.9)',
                  '--roof-color': car.useBlackDetails
                    ? '#000000'
                    : `color-mix(in srgb, ${car.color} 75%, white 25%)`,
                  opacity: car.collided ? 0.65 : 1,
                }}
              >
                <div className="car-chase-car-roof" />
                <div className="car-chase-car-windshield car-chase-car-windshield-front" />
                <div className="car-chase-car-windshield car-chase-car-windshield-rear" />
                <div className="car-chase-car-mirror car-chase-car-mirror-left" />
                <div className="car-chase-car-mirror car-chase-car-mirror-right" />
              </div>
            )
          })}

          <div
            className="car-chase-police"
            style={{
              left: `${policeLeftPercent}%`,
              top: `${runtimeRef.current.policeY}%`,
              transform: 'translate(-50%, -50%)',
            }}
          >
            <div className="car-chase-car-roof" />
            <div className="car-chase-car-windshield car-chase-car-windshield-front" />
            <div className="car-chase-car-windshield car-chase-car-windshield-rear" />
            <div className="car-chase-car-mirror car-chase-car-mirror-left" />
            <div className="car-chase-car-mirror car-chase-car-mirror-right" />
            <div className="car-chase-police-lights">
              <div className="car-chase-police-light car-chase-police-light-red" />
              <div className="car-chase-police-light car-chase-police-light-blue" />
            </div>
            <div className="car-chase-police-label">POLICE</div>
          </div>

          <div
            className={`car-chase-player ${playerFlash ? 'car-chase-player-flash' : ''} ${
              laneChangeDirection === 0 ? '' : laneChangeDirection > 0 ? 'car-chase-player-lane-shift-right' : 'car-chase-player-lane-shift-left'
            }`}
            style={{
              left: `${playerLeftPercent}%`,
              top: `${PLAYER_Y}%`,
            }}
          >
            <div className="car-chase-player-shell">
              <div className="car-chase-player-windshield" />
              <div className="car-chase-player-spoiler" />
              <div className="car-chase-player-vent car-chase-player-vent-left-1" />
              <div className="car-chase-player-vent car-chase-player-vent-left-2" />
              <div className="car-chase-player-vent car-chase-player-vent-right-1" />
              <div className="car-chase-player-vent car-chase-player-vent-right-2" />
            </div>
            <div className="car-chase-player-wheel car-chase-player-wheel-front-left" />
            <div className="car-chase-player-wheel car-chase-player-wheel-front-right" />
            <div className="car-chase-player-wheel car-chase-player-wheel-rear-left" />
            <div className="car-chase-player-wheel car-chase-player-wheel-rear-right" />
          </div>
          {showSpeedLines && (
            <div
              key={speedLinesSeed}
              className={`car-chase-speed-lines ${
                speedLinesDirection > 0
                  ? 'car-chase-speed-lines-from-left'
                  : 'car-chase-speed-lines-from-right'
              }`}
              style={{
                left: `${playerLeftPercent}%`,
                top: `${PLAYER_Y}%`,
              }}
            >
              <div className="car-chase-speed-line car-chase-speed-line-1" />
              <div className="car-chase-speed-line car-chase-speed-line-2" />
              <div className="car-chase-speed-line car-chase-speed-line-3" />
              <div className="car-chase-speed-line car-chase-speed-line-4" />
            </div>
          )}

          {screen === 'game-over' && (
            <div className="car-chase-overlay">
              <h3>Game Over</h3>
              <p>Survived: {formatTime(finalTime)}</p>
              <button type="button" className="tower-btn" onClick={goToStart}>
                Restart
              </button>
            </div>
          )}

          {screen === 'start' && (
            <div className="car-chase-overlay">
              <h3>Car Chase</h3>
              <div className="car-chase-start-buttons">
                {Object.keys(DIFFICULTIES).map((level) => (
                  <button
                    key={level}
                    type="button"
                    className={`tower-btn ${difficulty === level ? 'car-chase-active' : ''}`}
                    onClick={() => setDifficulty(level)}
                  >
                    {level}
                  </button>
                ))}
              </div>
              <button type="button" className="tower-btn" onClick={startGame}>
                Play
              </button>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
