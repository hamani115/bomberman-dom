package server

import (
	"encoding/json"
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
		_, message, err := conn.ReadMessage()

		if err != nil {
			log.Println("WebSocket client disconnected")
			break
		}

		var clientMessage ClientMessage

		err = json.Unmarshal(message, &clientMessage)

		if err != nil {
			log.Println("Invalid WebSocket message:", err)
			continue
		}

		if clientMessage.Type == "join" {
			log.Printf("Player joined: %s\n", clientMessage.Nickname)

			response := ServerMessage{
				Type:     "joined",
				Nickname: clientMessage.Nickname,
			}

			err = conn.WriteJSON(response)

			if err != nil {
				log.Println("WebSocket write error:", err)
				break
			}
		}
	}
}
