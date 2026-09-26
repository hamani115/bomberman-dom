package server

type ClientMessage struct {
	Type     string `json:"type"`
	Nickname string `json:"nickname,omitempty"`
}

type ServerMessage struct {
	Type     string `json:"type"`
	Nickname string `json:"nickname,omitempty"`
	Message  string `json:"message,omitempty"`
}
