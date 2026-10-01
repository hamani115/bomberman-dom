package server

import (
	"math"
	"math/rand"
)

const powerUpDropChance = 35

const (
	powerUpBomb  = "bomb"
	powerUpFlame = "flame"
	powerUpSpeed = "speed"
)

type PowerUp struct {
	ID   int    `json:"id"`
	Type string `json:"type"`
	Row  int    `json:"row"`
	Col  int    `json:"col"`
}

func (l *Lobby) createPowerUpLocked(row, col int) *PowerUp {
	if rand.Intn(100) >= powerUpDropChance {
		return nil
	}

	types := []string{
		powerUpBomb,
		powerUpFlame,
		powerUpSpeed,
	}

	powerUp := &PowerUp{
		ID:   l.nextPowerUpID,
		Type: types[rand.Intn(len(types))],
		Row:  row,
		Col:  col,
	}

	l.nextPowerUpID++
	l.powerUps[powerUp.ID] = powerUp

	return powerUp
}

type PowerUpCollection struct {
	PowerUp   PowerUp
	MaxBombs  int
	BombRange int
	Speed     float64
}

func (l *Lobby) CollectPowerUp(playerID int) (PowerUpCollection, bool) {
	l.mu.Lock()
	defer l.mu.Unlock()

	if l.phase != "game" {
		return PowerUpCollection{}, false
	}

	player, exists := l.players[playerID]

	if !exists || !player.Alive {
		return PowerUpCollection{}, false
	}

	row := int(math.Floor(player.Y))
	col := int(math.Floor(player.X))

	for id, powerUp := range l.powerUps {
		if powerUp.Row != row || powerUp.Col != col {
			continue
		}

		switch powerUp.Type {
		case powerUpBomb:
			player.MaxBombs++

		case powerUpFlame:
			player.BombRange++

		case powerUpSpeed:
			player.Speed += 0.5
		}

		collectedPowerUp := *powerUp

		delete(l.powerUps, id)

		return PowerUpCollection{
			PowerUp:   collectedPowerUp,
			MaxBombs:  player.MaxBombs,
			BombRange: player.BombRange,
			Speed:     player.Speed,
		}, true
	}

	return PowerUpCollection{}, false
}
