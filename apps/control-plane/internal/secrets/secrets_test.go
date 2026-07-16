package secrets

import (
	"errors"
	"testing"
)

func TestNewCipherDisabledOnEmpty(t *testing.T) {
	if _, err := NewCipher(""); !errors.Is(err, ErrDisabled) {
		t.Fatalf("NewCipher(\"\") err = %v; want ErrDisabled", err)
	}
}

func TestEncryptDecryptRoundTrip(t *testing.T) {
	c, err := NewCipher("a-reasonably-long-passphrase")
	if err != nil {
		t.Fatalf("NewCipher: %v", err)
	}
	for _, pt := range []string{"", "sk-ant-123", "unicode: ключ 🔑", "with\nnewlines\tand tabs"} {
		enc, err := c.Encrypt(pt)
		if err != nil {
			t.Fatalf("Encrypt(%q): %v", pt, err)
		}
		got, err := c.Decrypt(enc)
		if err != nil {
			t.Fatalf("Decrypt: %v", err)
		}
		if got != pt {
			t.Errorf("round-trip = %q; want %q", got, pt)
		}
	}
}

func TestEncryptIsNondeterministic(t *testing.T) {
	c, _ := NewCipher("pass")
	a, _ := c.Encrypt("same")
	b, _ := c.Encrypt("same")
	if a == b {
		t.Error("expected distinct ciphertexts for repeated encryption (random nonce)")
	}
}

func TestDecryptWrongKeyFails(t *testing.T) {
	c1, _ := NewCipher("key-one")
	c2, _ := NewCipher("key-two")
	enc, _ := c1.Encrypt("secret")
	if _, err := c2.Decrypt(enc); err == nil {
		t.Error("Decrypt with wrong key should fail, not return garbage")
	}
}

func TestDecryptTamperedFails(t *testing.T) {
	c, _ := NewCipher("pass")
	enc, _ := c.Encrypt("secret")
	// Flip the last base64 char to corrupt the tag/ciphertext.
	b := []byte(enc)
	if b[len(b)-2] == 'A' {
		b[len(b)-2] = 'B'
	} else {
		b[len(b)-2] = 'A'
	}
	if _, err := c.Decrypt(string(b)); err == nil {
		t.Error("Decrypt of tampered ciphertext should fail")
	}
}
