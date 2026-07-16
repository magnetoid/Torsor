// Package secrets encrypts small user-scoped secret values (e.g. BYO API keys) at rest
// with AES-256-GCM. The 32-byte key is derived from the configured passphrase
// (TORSOR_SECRET_KEY) via SHA-256, so any non-empty passphrase works. Stored ciphertext
// is base64(nonce || ciphertext||tag) — authenticated, so tampering is detected on read.
package secrets

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
)

// ErrDisabled is returned by NewCipher when no passphrase is configured. Callers should
// treat this as "the secrets feature is turned off" and respond accordingly (not 500).
var ErrDisabled = errors.New("secrets: TORSOR_SECRET_KEY is not configured")

// Cipher seals and opens secret values with a single AES-256-GCM key.
type Cipher struct {
	aead cipher.AEAD
}

// NewCipher derives the encryption key from passphrase and returns a Cipher. Returns
// ErrDisabled if the passphrase is empty (the feature must be explicitly configured).
func NewCipher(passphrase string) (*Cipher, error) {
	if passphrase == "" {
		return nil, ErrDisabled
	}
	sum := sha256.Sum256([]byte(passphrase))
	block, err := aes.NewCipher(sum[:])
	if err != nil {
		return nil, err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	return &Cipher{aead: aead}, nil
}

// Encrypt returns base64(nonce || sealed) for plaintext. Each call uses a fresh random
// nonce, so encrypting the same value twice yields different ciphertext.
func (c *Cipher) Encrypt(plaintext string) (string, error) {
	nonce := make([]byte, c.aead.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}
	sealed := c.aead.Seal(nonce, nonce, []byte(plaintext), nil)
	return base64.StdEncoding.EncodeToString(sealed), nil
}

// Decrypt reverses Encrypt, verifying the GCM tag. A wrong key or tampered ciphertext
// returns an error rather than garbage plaintext.
func (c *Cipher) Decrypt(encoded string) (string, error) {
	raw, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return "", err
	}
	ns := c.aead.NonceSize()
	if len(raw) < ns {
		return "", fmt.Errorf("secrets: ciphertext too short")
	}
	nonce, sealed := raw[:ns], raw[ns:]
	plaintext, err := c.aead.Open(nil, nonce, sealed, nil)
	if err != nil {
		return "", err
	}
	return string(plaintext), nil
}
