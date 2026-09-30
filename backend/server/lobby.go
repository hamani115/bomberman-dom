package server

import (
	"errors"
	"strings"

	"github.com/gorilla/websocket"
)

const maxPlayers = 4

func NewLobby() *Lobby {
	return &Lobby{
		players: make(map[int]*Player),
		nextID:  1,
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

func (l *Lobby) snapshot() ([]*Player, []PlayerInfo) {
	l.mu.Lock()
	defer l.mu.Unlock()

	players := make([]*Player, 0, len(l.players))
	playerInfos := make([]PlayerInfo, 0, len(l.players))

	for _, player := range l.players {
		players = append(players, player)

		playerInfos = append(playerInfos, PlayerInfo{
			ID:       player.ID,
			Nickname: player.Nickname,
		})
	}

	return players, playerInfos
}

func (l *Lobby) BroadcastState() {
	players, playerInfos := l.snapshot()

	message := ServerMessage{
		Type:        "lobby",
		PlayerCount: len(playerInfos),
		Players:     playerInfos,
	}

	for _, player := range players {
		err := player.Send(message)

		if err != nil {
			continue
		}
	}
}

func (l *Lobby) Broadcast(message ServerMessage) {
	players, _ := l.snapshot()

	for _, player := range players {
		err := player.Send(message)

		if err != nil {
			continue
		}
	}
}
