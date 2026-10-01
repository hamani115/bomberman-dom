package server

import (
	"errors"
	"math"
	"sort"
	"strings"
	"time"

	"github.com/gorilla/websocket"
)

const maxPlayers = 4

const gameOverCountdown = 10

func NewLobby() *Lobby {
	return &Lobby{
		players:       make(map[int]*Player),
		nextID:        1,
		phase:         "waiting",
		bombs:         make(map[int]*Bomb),
		nextBombID:    1,
		powerUps:      make(map[int]*PowerUp),
		nextPowerUpID: 1,
	}
}

var lobby = NewLobby()

func (p *Player) Send(message ServerMessage) error {
	p.writeMu.Lock()
	defer p.writeMu.Unlock()

	return p.Conn.WriteJSON(message)
}

func (l *Lobby) AddPlayer(conn *websocket.Conn, nickname string) (*Player, error) {
	nickname = strings.TrimSpace(nickname)

	if nickname == "" {
		return nil, errors.New("nickname is required")
	}

	l.mu.Lock()
	defer l.mu.Unlock()

	if l.phase == "game" || l.phase == "game_over" {
		return nil, errors.New("the game is not accepting new players")
	}

	if len(l.players) >= maxPlayers {
		return nil, errors.New("the game is full")
	}

	for _, player := range l.players {
		if strings.EqualFold(player.Nickname, nickname) {
			return nil, errors.New("nickname is already in use")
		}
	}

	player := &Player{
		ID:       l.nextID,
		Nickname: nickname,
		Conn:     conn,
	}

	l.nextID++
	l.players[player.ID] = player

	return player, nil
}

func (l *Lobby) RemovePlayer(playerID int) {
	l.mu.Lock()
	defer l.mu.Unlock()

	delete(l.players, playerID)
}

func (l *Lobby) snapshot() ([]*Player, []PlayerInfo, string, int) {
	l.mu.Lock()
	defer l.mu.Unlock()

	ids := make([]int, 0, len(l.players))

	for id := range l.players {
		ids = append(ids, id)
	}

	sort.Ints(ids)

	players := make([]*Player, 0, len(l.players))
	playerInfos := make([]PlayerInfo, 0, len(l.players))

	for _, id := range ids {
		player := l.players[id]

		players = append(players, player)

		playerInfos = append(playerInfos, PlayerInfo{
			ID:       player.ID,
			Nickname: player.Nickname,
		})
	}

	return players, playerInfos, l.phase, l.countdown
}

func (l *Lobby) BroadcastState() {
	players, playerInfos, phase, countdown := l.snapshot()

	message := ServerMessage{
		Type:        "lobby",
		PlayerCount: len(playerInfos),
		Players:     playerInfos,
		Phase:       phase,
		Countdown:   countdown,
	}

	for _, player := range players {
		err := player.Send(message)

		if err != nil {
			continue
		}
	}
}

func (l *Lobby) Broadcast(message ServerMessage) {
	players, _, _, _ := l.snapshot()

	for _, player := range players {
		err := player.Send(message)

		if err != nil {
			continue
		}
	}
}

func (l *Lobby) stopWaitTimerLocked() {
	if l.waitTimer == nil {
		return
	}

	l.waitTimer.Stop()
	l.waitTimer = nil
}

func (l *Lobby) cancelCountdownLocked() {
	if l.countdownCancel != nil {
		close(l.countdownCancel)
		l.countdownCancel = nil
	}

	l.countdown = 0

	if l.phase == "countdown" {
		l.phase = "waiting"
	}
}

func (l *Lobby) PlayerCountChanged() {
	l.mu.Lock()

	playerCount := len(l.players)

	if l.phase == "game" || l.phase == "game_over" {
		l.mu.Unlock()
		l.BroadcastState()
		return
	}

	if playerCount < 2 {
		l.stopWaitTimerLocked()
		l.cancelCountdownLocked()

		l.phase = "waiting"

		l.mu.Unlock()
		l.BroadcastState()
		return
	}

	if l.phase == "countdown" {
		l.mu.Unlock()
		l.BroadcastState()
		return
	}

	if playerCount == maxPlayers {
		l.stopWaitTimerLocked()

		l.mu.Unlock()

		l.startCountdown()
		return
	}

	if l.waitTimer == nil {
		// run startCountdown() 20 seconds from now
		l.waitTimer = time.AfterFunc(20*time.Second, func() {
			l.startCountdown()
		})
	}

	l.mu.Unlock()

	l.BroadcastState()
}

func (l *Lobby) startCountdown() {
	l.mu.Lock()

	if l.phase != "waiting" || len(l.players) < 2 {
		l.mu.Unlock()
		return
	}

	l.stopWaitTimerLocked()

	l.phase = "countdown"
	l.countdown = 10
	// to stop the timer
	cancel := make(chan struct{})
	l.countdownCancel = cancel

	l.mu.Unlock()

	l.BroadcastState()

	go l.runCountdown(cancel)
}

func (l *Lobby) runCountdown(cancel <-chan struct{}) {
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-cancel:
			return

		case <-ticker.C:
			l.mu.Lock()

			if l.phase != "countdown" {
				l.mu.Unlock()
				return
			}

			if len(l.players) < 2 {
				l.phase = "waiting"
				l.countdown = 0
				l.countdownCancel = nil

				l.mu.Unlock()

				l.BroadcastState()
				return
			}

			l.countdown--

			if l.countdown <= 0 {
				gameMap := GenerateMap()
				gamePlayers := l.assignSpawnPositionsLocked()

				l.phase = "game"
				l.countdown = 0
				l.countdownCancel = nil
				l.gameMap = gameMap
				l.bombs = make(map[int]*Bomb)
				l.nextBombID = 1
				l.powerUps = make(map[int]*PowerUp)
				l.nextPowerUpID = 1

				l.mu.Unlock()

				l.Broadcast(ServerMessage{
					Type:        "game_start",
					Map:         gameMap,
					GamePlayers: gamePlayers,
				})

				return
			}

			l.mu.Unlock()

			l.BroadcastState()
		}
	}
}

func (l *Lobby) assignSpawnPositionsLocked() []GamePlayerInfo {
	ids := make([]int, 0, len(l.players))

	for id := range l.players {
		ids = append(ids, id)
	}

	sort.Ints(ids)

	spawnIndexes := []int{0, 1, 2, 3}

	if len(ids) == 2 {
		spawnIndexes = []int{0, 3}
	}

	gamePlayers := make([]GamePlayerInfo, 0, len(ids))

	for index, id := range ids {
		player := l.players[id]
		spawn := spawnPositions[spawnIndexes[index]]

		player.X = spawn.X
		player.Y = spawn.Y
		player.SpawnX = spawn.X
		player.SpawnY = spawn.Y
		player.Lives = 3
		player.Alive = true
		player.MaxBombs = 1
		player.ActiveBombs = 0
		player.BombRange = 1
		player.Speed = playerSpeed
		player.LastMoveAt = time.Now()

		gamePlayers = append(gamePlayers, GamePlayerInfo{
			ID:       player.ID,
			Nickname: player.Nickname,
			X:        player.X,
			Y:        player.Y,
			Lives:    player.Lives,
			Alive:    player.Alive,
		})
	}

	return gamePlayers
}

func (l *Lobby) MovePlayer(playerID int, x, y float64) (GamePlayerInfo, bool) {
	l.mu.Lock()
	defer l.mu.Unlock()

	player, exists := l.players[playerID]

	if !exists || l.phase != "game" || l.gameMap == nil {
		return GamePlayerInfo{}, false
	}

	if !player.Alive {
		return GamePlayerInfo{
			ID:       player.ID,
			Nickname: player.Nickname,
			X:        player.X,
			Y:        player.Y,
			Lives:    player.Lives,
			Alive:    player.Alive,
		}, false
	}

	if math.IsNaN(x) || math.IsNaN(y) || math.IsInf(x, 0) || math.IsInf(y, 0) {
		return GamePlayerInfo{}, false
	}

	if !l.canPlayerMoveToLocked(player, x, y) {
		return GamePlayerInfo{
			ID:       player.ID,
			Nickname: player.Nickname,
			X:        player.X,
			Y:        player.Y,
			Lives:    player.Lives,
			Alive:    player.Alive,
		}, false
	}

	elapsed := time.Since(player.LastMoveAt).Seconds()

	if elapsed > 0.25 {
		elapsed = 0.25
	}

	distance := math.Hypot(
		x-player.X,
		y-player.Y,
	)

	maxDistance := player.Speed*elapsed + 0.15

	if distance > maxDistance {
		return GamePlayerInfo{
			ID:       player.ID,
			Nickname: player.Nickname,
			X:        player.X,
			Y:        player.Y,
			Lives:    player.Lives,
			Alive:    player.Alive,
		}, false
	}

	player.X = x
	player.Y = y
	player.LastMoveAt = time.Now()

	return GamePlayerInfo{
		ID:       player.ID,
		Nickname: player.Nickname,
		X:        player.X,
		Y:        player.Y,
		Lives:    player.Lives,
		Alive:    player.Alive,
	}, true
}

func (l *Lobby) finishGameIfNeededLocked() (*PlayerInfo, bool) {
	if l.phase != "game" {
		return nil, false
	}

	alivePlayers := make([]*Player, 0)

	for _, player := range l.players {
		if player.Alive {
			alivePlayers = append(alivePlayers, player)
		}
	}

	if len(alivePlayers) > 1 {
		return nil, false
	}

	l.phase = "game_over"
	l.countdown = gameOverCountdown
	l.bombs = make(map[int]*Bomb)

	if len(alivePlayers) == 0 {
		return nil, true
	}

	winner := &PlayerInfo{
		ID:       alivePlayers[0].ID,
		Nickname: alivePlayers[0].Nickname,
	}

	return winner, true
}

func (l *Lobby) CheckGameOver() {
	l.mu.Lock()

	winner, gameOver := l.finishGameIfNeededLocked()

	l.mu.Unlock()

	if !gameOver {
		return
	}

	l.Broadcast(ServerMessage{
		Type:      "game_over",
		Winner:    winner,
		Countdown: gameOverCountdown,
	})

	l.scheduleLobbyReset()
}

func (l *Lobby) scheduleLobbyReset() {
	go func() {
		ticker := time.NewTicker(time.Second)
		defer ticker.Stop()

		for range ticker.C {
			l.mu.Lock()

			if l.phase != "game_over" {
				l.mu.Unlock()
				return
			}

			l.countdown--

			countdown := l.countdown

			l.mu.Unlock()

			if countdown <= 0 {
				l.resetLobby()
				return
			}

			l.Broadcast(ServerMessage{
				Type:      "game_over_countdown",
				Countdown: countdown,
			})
		}
	}()
}

func (l *Lobby) resetLobby() {
	l.mu.Lock()

	if l.phase != "game_over" {
		l.mu.Unlock()
		return
	}

	l.stopWaitTimerLocked()
	l.cancelCountdownLocked()

	l.phase = "waiting"
	l.countdown = 0
	l.gameMap = nil
	l.bombs = make(map[int]*Bomb)
	l.nextBombID = 1
	l.powerUps = make(map[int]*PowerUp)
	l.nextPowerUpID = 1

	for _, player := range l.players {
		player.Alive = false
		player.Lives = 0
		player.ActiveBombs = 0
	}

	l.mu.Unlock()

	l.Broadcast(ServerMessage{
		Type: "lobby_reset",
	})

	l.PlayerCountChanged()
}
