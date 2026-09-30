package server

import (
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

type ClientMessage struct {
	Type     string `json:"type"`
	Nickname string `json:"nickname,omitempty"`
	Message  string `json:"message,omitempty"`
}

type ServerMessage struct {
	Type        string       `json:"type"`
	PlayerID    int          `json:"playerId,omitempty"`
	Nickname    string       `json:"nickname,omitempty"`
	Message     string       `json:"message,omitempty"`
	PlayerCount int          `json:"playerCount,omitempty"`
	Players     []PlayerInfo `json:"players,omitempty"`
}

type Player struct {
	ID       int
	Nickname string
	Conn     *websocket.Conn
	writeMu  sync.Mutex
}

type Lobby struct {
	mu              sync.Mutex
	players         map[int]*Player
	nextID          int
	phase           string
	countdown       int
	waitTimer       *time.Timer
	countdownCancel chan struct{}
}

type PlayerInfo struct {
	ID       int    `json:"id"`
	Nickname string `json:"nickname"`
}
