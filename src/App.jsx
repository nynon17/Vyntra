import { useState } from 'react'
import GameCard from './components/GameCard'
import TowerStacker from './games/TowerStacker'
import './App.css'

function App() {
  const [view, setView] = useState('main')
  const [query, setQuery] = useState('')
  const games = [
    { title: 'Tower Stacker', emoji: '🧱', description: 'Stack perfectly to climb levels.' },
    { title: 'Neon Overdrive', emoji: '🏎️', description: 'Arcade racing challenge.' },
    { title: 'Quiet Hollow', emoji: '🌙', description: 'Atmospheric puzzle adventure.' },
    { title: 'Iron Vanguard', emoji: '⚔️', description: 'Tactical combat missions.' },
    { title: "Aurora's End", emoji: '❄️', description: 'Survive a frozen frontier.' },
    { title: 'Pixel Foundry', emoji: '🛠️', description: 'Build and automate worlds.' },
    { title: 'Deep Signal', emoji: '📡', description: 'Decode mysterious transmissions.' },
    { title: 'Last Ember', emoji: '🔥', description: 'Defend the final sanctuary.' },
  ]
  const filteredGames = games.filter((game) =>
    game.title.toLowerCase().includes(query.trim().toLowerCase()),
  )
  if (view === 'tower-stacker') {
    return <TowerStacker onBack={() => setView('main')} />
  }

  return (
    <main className="library">
      <input
        type="search"
        className="search-input"
        placeholder="Search games by title..."
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        aria-label="Search games by title"
      />
      <section className="grid" id="game-grid">
        {filteredGames.map((game) => (
          <GameCard
            key={game.title}
            game={game}
            onClick={
              game.title === 'Tower Stacker'
                ? () => setView('tower-stacker')
                : undefined
            }
          />
        ))}
      </section>
    </main>
  )
}

export default App
