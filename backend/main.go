package main

import (
	"bomberman-dom/backend/server"
	"log"
)

func main() {
	if err := server.Run(":8080"); err != nil {
		log.Fatal(err)
	}
}
