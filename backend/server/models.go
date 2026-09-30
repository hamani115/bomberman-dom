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
	Type        string           `json:"type"`
	PlayerID    int              `json:"playerId,omitempty"`
	Nickname    string           `json:"nickname,omitempty"`
	Message     string           `json:"message,omitempty"`
	PlayerCount int              `json:"playerCount,omitempty"`
	Players     []PlayerInfo     `json:"players,omitempty"`
	Phase       string           `json:"phase,omitempty"`
	Countdown   int              `json:"countdown,omitempty"`
	Map         *GameMap         `json:"map,omitempty"`
	GamePlayers []GamePlayerInfo `json:"gamePlayers,omitempty"`
}

type Player struct {
	ID       int
	Nickname string
	Conn     *websocket.Conn
	X        float64
	Y        float64
	Lives    int
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
	gameMap         *GameMap
}

type PlayerInfo struct {
	ID       int    `json:"id"`
	Nickname string `json:"nickname"`
}

type GamePlayerInfo struct {
	ID       int     `json:"id"`
	Nickname string  `json:"nickname"`
	X        float64 `json:"x"`
	Y        float64 `json:"y"`
	Lives    int     `json:"lives"`
}

// game map
type GameMap struct {
	Rows  int        `json:"rows"`
	Cols  int        `json:"cols"`
	Tiles [][]string `json:"tiles"`
}

type Position struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}
