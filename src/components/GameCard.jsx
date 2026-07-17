function GameCard({ game, onClick }) {
  const isClickable = typeof onClick === 'function'

  const handleKeyDown = (event) => {
    if (!isClickable) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      onClick()
    }
  }
  return (
    <article
      className={`card ${isClickable ? 'card-clickable' : ''}`}
      onClick={onClick}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onKeyDown={handleKeyDown}
      aria-label={isClickable ? `Open ${game.title}` : game.title}
    >
      <div className="card-emoji" aria-hidden="true">
        {game.emoji || '🎮'}
      </div>
      <h2 className="card-title">{game.title}</h2>
      {game.description && <p className="card-description">{game.description}</p>}
    </article>
  )
}

export default GameCard
