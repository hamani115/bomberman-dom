package server

import "math/rand"

const (
	mapRows = 13
	mapCols = 15
)

const (
	tileFloor = "floor"
	tileWall  = "wall"
	tileBlock = "block"
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
