package server

import (
	"log"
	"net/http"
)

func Run(addr string) error {
	router := http.NewServeMux()

	router.HandleFunc("/ws", handleWebSocket)

	fileServer := http.FileServer(http.Dir("../frontend"))
	router.Handle("/", fileServer)

	log.Printf("Backend running on http://localhost%s\n", addr)

	return http.ListenAndServe(addr, router)
}