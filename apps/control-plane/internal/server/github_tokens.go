package server

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"strconv"
	"strings"
	"time"
)

// errSignedToken is returned for any invalid, tampered, or expired signed token.
var errSignedToken = errors.New("invalid or expired token")

// signSignedToken binds `data` under `purpose`, authenticated with the platform secret
// (TORSOR_SECRET_KEY) and valid for ttl. Output is URL-safe: base64(msg) + "." + base64(hmac).
func (s *Server) signSignedToken(purpose, data string, ttl time.Duration) string {
	exp := time.Now().Add(ttl).Unix()
	msg := purpose + "\x00" + data + "\x00" + strconv.FormatInt(exp, 10)
	return base64.RawURLEncoding.EncodeToString([]byte(msg)) + "." + s.signHMAC(msg)
}

func (s *Server) signHMAC(msg string) string {
	mac := hmac.New(sha256.New, []byte(s.cfg.SecretKey))
	mac.Write([]byte(msg))
	return base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
}

// verifySignedToken checks the signature, purpose, and expiry, returning the bound data.
func (s *Server) verifySignedToken(purpose, token string) (string, error) {
	dot := strings.LastIndexByte(token, '.')
	if dot < 0 {
		return "", errSignedToken
	}
	rawMsg, err := base64.RawURLEncoding.DecodeString(token[:dot])
	if err != nil {
		return "", errSignedToken
	}
	if !hmac.Equal([]byte(token[dot+1:]), []byte(s.signHMAC(string(rawMsg)))) {
		return "", errSignedToken
	}
	parts := strings.Split(string(rawMsg), "\x00")
	if len(parts) != 3 || parts[0] != purpose {
		return "", errSignedToken
	}
	exp, err := strconv.ParseInt(parts[2], 10, 64)
	if err != nil || time.Now().Unix() > exp {
		return "", errSignedToken
	}
	return parts[1], nil
}
