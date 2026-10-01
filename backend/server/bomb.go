package server

import (
	"errors"
	"math"
	"time"
)

const bombFuse = 3 * time.Second

func (l *Lobby) PlaceBomb(playerID int) (BombInfo, error) {
	l.mu.Lock()

	if l.phase != "game" || l.gameMap == nil {
		l.mu.Unlock()
		return BombInfo{}, errors.New("game is not running")
	}

	player, exists := l.players[playerID]

	if !exists {
		l.mu.Unlock()
		return BombInfo{}, errors.New("player does not exist")
	}

	if player.ActiveBombs >= player.MaxBombs {
		l.mu.Unlock()
		return BombInfo{}, errors.New("bomb limit reached")
	}

	row := int(math.Floor(player.Y))
	col := int(math.Floor(player.X))

	if l.gameMap.Tiles[row][col] != tileFloor {
		l.mu.Unlock()
		return BombInfo{}, errors.New("bomb cannot be placed here")
	}

	for _, existingBomb := range l.bombs {
		if existingBomb.Row == row && existingBomb.Col == col {
			l.mu.Unlock()
			return BombInfo{}, errors.New("there is already a bomb here")
		}
	}

	bomb := &Bomb{
		ID:      l.nextBombID,
		OwnerID: player.ID,
		Row:     row,
		Col:     col,
		Range:   player.BombRange,
	}

	l.nextBombID++
	l.bombs[bomb.ID] = bomb
	player.ActiveBombs++

	bombInfo := BombInfo{
		ID:      bomb.ID,
		OwnerID: bomb.OwnerID,
		Row:     bomb.Row,
		Col:     bomb.Col,
		Range:   bomb.Range,
	}

	l.mu.Unlock()

	time.AfterFunc(bombFuse, func() {
		l.removeBomb(bomb.ID)
	})

	return bombInfo, nil
}

func (l *Lobby) removeBomb(bombID int) {
	l.mu.Lock()

	bomb, exists := l.bombs[bombID]

	if !exists {
		l.mu.Unlock()
		return
	}

	delete(l.bombs, bombID)

	if owner, exists := l.players[bomb.OwnerID]; exists && owner.ActiveBombs > 0 {
		owner.ActiveBombs--
	}

	bombInfo := BombInfo{
		ID:      bomb.ID,
		OwnerID: bomb.OwnerID,
		Row:     bomb.Row,
		Col:     bomb.Col,
		Range:   bomb.Range,
	}

	l.mu.Unlock()

	l.Broadcast(ServerMessage{
		Type: "bomb_removed",
		Bomb: &bombInfo,
	})
}
