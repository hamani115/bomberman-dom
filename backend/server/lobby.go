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

func NewLobby() *Lobby {
	return &Lobby{
		players:    make(map[int]*Player),
		nextID:     1,
		phase:      "waiting",
		bombs:      make(map[int]*Bomb),
		nextBombID: 1,
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

	if l.phase == "game" {
		return nil, errors.New("the game has already started")
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

	if l.phase == "game" {
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
		player.Lives = 3
		player.MaxBombs = 1
		player.ActiveBombs = 0
		player.BombRange = 1
		player.LastMoveAt = time.Now()

		gamePlayers = append(gamePlayers, GamePlayerInfo{
			ID:       player.ID,
			Nickname: player.Nickname,
			X:        player.X,
			Y:        player.Y,
			Lives:    player.Lives,
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

	if math.IsNaN(x) || math.IsNaN(y) || math.IsInf(x, 0) || math.IsInf(y, 0) {
		return GamePlayerInfo{}, false
	}

	if !canPlayerCollide(l.gameMap, x, y) {
		return GamePlayerInfo{
			ID:       player.ID,
			Nickname: player.Nickname,
			X:        player.X,
			Y:        player.Y,
			Lives:    player.Lives,
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

	maxDistance := playerSpeed*elapsed + 0.15

	if distance > maxDistance {
		return GamePlayerInfo{
			ID:       player.ID,
			Nickname: player.Nickname,
			X:        player.X,
			Y:        player.Y,
			Lives:    player.Lives,
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
	}, true
}
