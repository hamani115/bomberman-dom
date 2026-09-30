package server

import (
	"encoding/json"
	"log"
	"net/http"
	"strings"

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

	var player *Player

	defer func() {
		if player != nil {
			lobby.RemovePlayer(player.ID)
			lobby.BroadcastState()

			log.Printf("Player disconnected: %s\n", player.Nickname)
		}

		conn.Close()
	}()

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
			if player != nil {
				continue
			}

			newPlayer, err := lobby.AddPlayer(conn, clientMessage.Nickname)

			if err != nil {
				err = conn.WriteJSON(ServerMessage{
					Type:    "error",
					Message: err.Error(),
				})

				if err != nil {
					break
				}

				continue
			}

			player = newPlayer

			err = player.Send(ServerMessage{
				Type:     "joined",
				PlayerID: player.ID,
				Nickname: player.Nickname,
			})

			if err != nil {
				break
			}

			log.Printf("Player joined: %s (ID %d)\n", player.Nickname, player.ID)

			lobby.BroadcastState()
		}

		if clientMessage.Type == "chat" {
			if player == nil {
				continue
			}

			message := strings.TrimSpace(clientMessage.Message)

			if message == "" {
				continue
			}

			lobby.Broadcast(ServerMessage{
				Type:     "chat",
				PlayerID: player.ID,
				Nickname: player.Nickname,
				Message:  message,
			})

			log.Printf("%s: %s\n", player.Nickname, message)
		}
	}
}
