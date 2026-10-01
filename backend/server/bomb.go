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

	if !player.Alive {
		l.mu.Unlock()
		return BombInfo{}, errors.New("player is eliminated")
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
		l.explodeBomb(bomb.ID)
	})

	return bombInfo, nil
}

func (l *Lobby) bombAtLocked(row, col int) *Bomb {
	for _, bomb := range l.bombs {
		if bomb.Row == row && bomb.Col == col {
			return bomb
		}
	}

	return nil
}

func (l *Lobby) explodeBomb(bombID int) {
	l.mu.Lock()

	bomb, exists := l.bombs[bombID]

	if !exists || l.gameMap == nil || l.phase != "game" {
		l.mu.Unlock()
		return
	}

	delete(l.bombs, bombID)

	if owner, exists := l.players[bomb.OwnerID]; exists && owner.ActiveBombs > 0 {
		owner.ActiveBombs--
	}

	explosion := []Cell{
		{
			Row: bomb.Row,
			Col: bomb.Col,
		},
	}

	destroyedBlocks := []Cell{}
	spawnedPowerUps := []PowerUp{}
	chainBombIDs := []int{}

	directions := [][2]int{
		{-1, 0}, //up
		{1, 0},  //down
		{0, -1}, //left
		{0, 1},  //right
	}

	for _, direction := range directions {
		for distance := 1; distance <= bomb.Range; distance++ {
			row := bomb.Row + direction[0]*distance
			col := bomb.Col + direction[1]*distance

			if row < 0 || row >= l.gameMap.Rows || col < 0 || col >= l.gameMap.Cols {
				break
			}

			tile := l.gameMap.Tiles[row][col]

			if tile == tileWall {
				break
			}

			explosion = append(explosion, Cell{
				Row: row,
				Col: col,
			})

			if chainedBomb := l.bombAtLocked(row, col); chainedBomb != nil {
				chainBombIDs = append(chainBombIDs, chainedBomb.ID)
				break
			}

			if tile == tileBlock {
				l.gameMap.Tiles[row][col] = tileFloor

				destroyedBlocks = append(destroyedBlocks, Cell{
					Row: row,
					Col: col,
				})

				if powerUp := l.createPowerUpLocked(row, col); powerUp != nil {
					spawnedPowerUps = append(spawnedPowerUps, *powerUp)
				}

				break
			}
		}
	}

	bombInfo := BombInfo{
		ID:      bomb.ID,
		OwnerID: bomb.OwnerID,
		Row:     bomb.Row,
		Col:     bomb.Col,
		Range:   bomb.Range,
	}

	damagedPlayers := []GamePlayerInfo{}

	for _, player := range l.players {
		if !player.Alive {
			continue
		}

		if !playerHitByExplosion(player, explosion) {
			continue
		}

		player.Lives--

		if player.Lives <= 0 {
			player.Lives = 0
			player.Alive = false
		} else {
			player.X = player.SpawnX
			player.Y = player.SpawnY
			player.LastMoveAt = time.Now()
		}

		damagedPlayers = append(damagedPlayers, GamePlayerInfo{
			ID:       player.ID,
			Nickname: player.Nickname,
			X:        player.X,
			Y:        player.Y,
			Lives:    player.Lives,
			Alive:    player.Alive,
		})
	}

	winner, gameOver := l.finishGameIfNeededLocked()

	l.mu.Unlock()

	l.Broadcast(ServerMessage{
		Type:            "bomb_exploded",
		Bomb:            &bombInfo,
		Explosion:       explosion,
		DestroyedBlocks: destroyedBlocks,
		DamagedPlayers:  damagedPlayers,
		SpawnedPowerUps: spawnedPowerUps,
	})

	if !gameOver {
		for _, chainedBombID := range chainBombIDs {
			l.explodeBomb(chainedBombID)
		}
	}

	if gameOver {
		l.Broadcast(ServerMessage{
			Type:      "game_over",
			Winner:    winner,
			Countdown: gameOverCountdown,
		})

		l.scheduleLobbyReset()
	}
}

func playerHitByExplosion(player *Player, explosion []Cell) bool {
	halfSize := playerCollisionSize / 2
	epsilon := 0.001

	left := int(math.Floor(player.X - halfSize + epsilon))
	right := int(math.Floor(player.X + halfSize - epsilon))
	top := int(math.Floor(player.Y - halfSize + epsilon))
	bottom := int(math.Floor(player.Y + halfSize - epsilon))

	for _, cell := range explosion {
		if cell.Row >= top && cell.Row <= bottom &&
			cell.Col >= left && cell.Col <= right {
			return true
		}
	}

	return false
}

func (l *Lobby) canPlayerMoveToLocked(player *Player, x, y float64) bool {
	if !canPlayerCollide(l.gameMap, x, y) {
		return false
	}

	for _, bomb := range l.bombs {
		if !playerOverlapsTile(x, y, bomb.Row, bomb.Col) {
			continue
		}

		if playerOverlapsTile(
			player.X,
			player.Y,
			bomb.Row,
			bomb.Col,
		) {
			continue
		}

		return false
	}

	return true
}
