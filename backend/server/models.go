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
	Type            string           `json:"type"`
	PlayerID        int              `json:"playerId,omitempty"`
	Nickname        string           `json:"nickname,omitempty"`
	Message         string           `json:"message,omitempty"`
	PlayerCount     int              `json:"playerCount,omitempty"`
	Players         []PlayerInfo     `json:"players,omitempty"`
	Phase           string           `json:"phase,omitempty"`
	Countdown       int              `json:"countdown,omitempty"`
	Map             *GameMap         `json:"map,omitempty"`
	GamePlayers     []GamePlayerInfo `json:"gamePlayers,omitempty"`
	X               float64          `json:"x,omitempty"`
	Y               float64          `json:"y,omitempty"`
	Bomb            *BombInfo        `json:"bomb,omitempty"`
	Explosion       []Cell           `json:"explosion,omitempty"`
	DestroyedBlocks []Cell           `json:"destroyedBlocks,omitempty"`
	DamagedPlayers  []GamePlayerInfo `json:"damagedPlayers,omitempty"`
	SpawnedPowerUps []PowerUp        `json:"spawnedPowerUps,omitempty"`
	PowerUp         *PowerUp         `json:"powerUp,omitempty"`
	MaxBombs        int              `json:"maxBombs,omitempty"`
	BombRange       int              `json:"bombRange,omitempty"`
	Speed           float64          `json:"speed,omitempty"`
	Winner          *PlayerInfo      `json:"winner,omitempty"`
}

type Player struct {
	ID          int
	Nickname    string
	Conn        *websocket.Conn
	X           float64
	Y           float64
	SpawnX      float64
	SpawnY      float64
	Alive       bool
	Lives       int
	MaxBombs    int
	ActiveBombs int
	BombRange   int
	Speed       float64
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
	powerUps        map[int]*PowerUp
	nextPowerUpID   int
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
	Alive    bool    `json:"alive"`
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

type Cell struct {
	Row int `json:"row"`
	Col int `json:"col"`
}
