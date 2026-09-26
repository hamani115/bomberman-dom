package server

import (
	"log"
	"net/http"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

func handleWebSocket(w http.ResponseWriter, r *http.Request) {
	log.Println("WebSocket request received")

	conn, err := upgrader.Upgrade(w, r, nil)

	if err != nil {
		log.Println("WebSocket upgrade error:", err)
		return
	}

	defer conn.Close()

	log.Println("WebSocket client connected")

	for {
		messageType, message, err := conn.ReadMessage()

		if err != nil {
			log.Println("WebSocket client disconnected")
			break
		}

		log.Printf("Received: %s\n", message)

		err = conn.WriteMessage(messageType, []byte("hello client"))

		if err != nil {
			log.Println("WebSocket write error:", err)
			break
		}
	}
}
