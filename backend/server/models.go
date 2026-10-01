package server

import (
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

type ClientMessage struct {
	Type     string  `json:"type"`
	Nickname string  `json:"nickname,omitempty"`
	Message  string  `json:"message,omitempty"`
	X        float64 `json:"x,omitempty"`
	Y        float64 `json:"y,omitempty"`
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
	X           float64          `json:"x,omitempty"`
	Y           float64          `json:"y,omitempty"`
	Bomb        *BombInfo        `json:"bomb,omitempty"`
}

type Player struct {
	ID          int
	Nickname    string
	Conn        *websocket.Conn
	X           float64
	Y           float64
	Lives       int
	MaxBombs    int
	ActiveBombs int
	BombRange   int
	LastMoveAt  time.Time
	writeMu     sync.Mutex
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
	bombs           map[int]*Bomb
	nextBombID      int
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

// bomb
type Bomb struct {
	ID      int
	OwnerID int
	Row     int
	Col     int
	Range   int
}

type BombInfo struct {
	ID      int `json:"id"`
	OwnerID int `json:"ownerId"`
	Row     int `json:"row"`
	Col     int `json:"col"`
	Range   int `json:"range"`
}
