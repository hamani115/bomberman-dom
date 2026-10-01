package server

import (
	"math"
	"math/rand"
)

const (
	mapRows = 13
	mapCols = 15
)

const (
	tileFloor = "floor"
	tileWall  = "wall"
	tileBlock = "block"
)

const (
	playerSpeed         = 3.0
	playerCollisionSize = 0.64
)

var safeSpawnTiles = map[[2]int]bool{
	// {row, col}
	// corner left-top
	{1, 1}: true,
	{1, 2}: true,
	{2, 1}: true,
	// corner left-bottom
	{1, 13}: true,
	{1, 12}: true,
	{2, 13}: true,
	// corner right-top
	{11, 1}: true,
	{11, 2}: true,
	{10, 1}: true,
	// corner right-bottom
	{11, 13}: true,
	{11, 12}: true,
	{10, 13}: true,
}

var spawnPositions = []Position{
	{X: 1.5, Y: 1.5},
	{X: 13.5, Y: 1.5},
	{X: 1.5, Y: 11.5},
	{X: 13.5, Y: 11.5},
}

func isWall(row, col int) bool {
	if row == 0 || row == mapRows-1 {
		return true
	}

	if col == 0 || col == mapCols-1 {
		return true
	}

	return row%2 == 0 && col%2 == 0
}

func isSafeSpawnTile(row, col int) bool {
	return safeSpawnTiles[[2]int{row, col}]
}

func GenerateMap() *GameMap {
	tiles := make([][]string, mapRows)

	for row := 0; row < mapRows; row++ {
		tiles[row] = make([]string, mapCols)

		for col := 0; col < mapCols; col++ {
			if isWall(row, col) {
				tiles[row][col] = tileWall
				continue
			}

			if isSafeSpawnTile(row, col) {
				tiles[row][col] = tileFloor
				continue
			}

			if rand.Intn(100) < 65 {
				tiles[row][col] = tileBlock
				continue
			}

			tiles[row][col] = tileFloor
		}
	}

	return &GameMap{
		Rows:  mapRows,
		Cols:  mapCols,
		Tiles: tiles,
	}
}

func playerOverlapsTile(x, y float64, row, col int) bool {
	halfSize := playerCollisionSize / 2
	epsilon := 0.001

	left := int(math.Floor(x - halfSize + epsilon))
	right := int(math.Floor(x + halfSize - epsilon))
	top := int(math.Floor(y - halfSize + epsilon))
	bottom := int(math.Floor(y + halfSize - epsilon))

	return col >= left &&
		col <= right &&
		row >= top &&
		row <= bottom
}

func canPlayerCollide(gameMap *GameMap, x, y float64) bool {
	halfSize := playerCollisionSize / 2
	epsilon := 0.001

	left := int(math.Floor(x - halfSize + epsilon))
	right := int(math.Floor(x + halfSize - epsilon))
	top := int(math.Floor(y - halfSize + epsilon))
	bottom := int(math.Floor(y + halfSize - epsilon))

	for row := top; row <= bottom; row++ {
		for col := left; col <= right; col++ {
			if row < 0 || row >= gameMap.Rows || col < 0 || col >= gameMap.Cols {
				return false
			}

			if gameMap.Tiles[row][col] != tileFloor {
				return false
			}
		}
	}

	return true
}
