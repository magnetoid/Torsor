// Package config loads runtime configuration from the environment. It mirrors the
// variables understood by the legacy apps/api service so the two can share a database
// and be swapped without changing deployment env.
package config

import (
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Env                   string
	Port                  int
	AppURL                string
	APIURL                string
	CORSOrigins           []string // empty => reflect request origin (matches cors origin:true)
	DatabaseURL           string
	DBPoolMax             int32
	RedisURL              string
	JWTSecret             string
	JWTExpiry             time.Duration
	DevSeedEmail          string
	DevSeedPassword       string
	SuperAdminEmails      []string
	AuthRateLimit         int
	APIRateLimit          int
	JSONBodyLimit         int64
	ModelPluginPaths      []string // executables implementing the ModelProvider capability
	WorkspaceRuntimePaths []string // executables implementing the WorkspaceRuntime capability
	DefaultRuntime        string   // runtime name used when a request doesn't specify one
	SecretKey             string   // TORSOR_SECRET_KEY: passphrase for AES-256-GCM secret encryption (empty => secrets disabled)
}

func (c Config) IsProduction() bool { return c.Env == "production" }

// IsDevelopment is TRUE only when NODE_ENV is explicitly "development". An unset/blank
// NODE_ENV is deliberately NOT development — it is treated as production-grade so a bare
// `docker run` fails closed (strong-secret required, no dev seed, no creds leak) instead
// of silently booting with a well-known JWT secret. Dev conveniences require opting in.
func (c Config) IsDevelopment() bool { return c.Env == "development" }

// Load reads configuration from the process environment, applying the same defaults as
// the legacy Express service.
func Load() Config {
	port := envInt("PORT", envInt("API_PORT", 3001))
	return Config{
		// Blank default (not "development"): an unset NODE_ENV must fail closed, not
		// enable dev seeding + the well-known JWT secret. See IsDevelopment.
		Env:                   envStr("NODE_ENV", ""),
		Port:                  port,
		AppURL:                envStr("APP_URL", "http://localhost:3000"),
		APIURL:                envStr("VITE_API_URL", "http://localhost:"+strconv.Itoa(port)),
		CORSOrigins:           csv(os.Getenv("CORS_ORIGIN")),
		DatabaseURL:           os.Getenv("DATABASE_URL"),
		DBPoolMax:             int32(envInt("DATABASE_POOL_MAX", 10)),
		RedisURL:              envStr("REDIS_URL", "redis://localhost:6379"),
		JWTSecret:             os.Getenv("JWT_SECRET"),
		JWTExpiry:             parseExpiry(envStr("JWT_EXPIRES_IN", "7d"), 7*24*time.Hour),
		DevSeedEmail:          envStr("DEV_SEED_EMAIL", "demo@torsor.local"),
		DevSeedPassword:       envStr("DEV_SEED_PASSWORD", "demo12345"),
		SuperAdminEmails:      lowerAll(csv(os.Getenv("SUPER_ADMIN_EMAILS"))),
		AuthRateLimit:         envInt("AUTH_RATE_LIMIT", 20),
		APIRateLimit:          envInt("API_RATE_LIMIT", 300),
		JSONBodyLimit:         int64(envInt("JSON_BODY_LIMIT_BYTES", 2*1024*1024)),
		SecretKey:             os.Getenv("TORSOR_SECRET_KEY"),
		ModelPluginPaths:      csv(os.Getenv("TORSOR_MODEL_PLUGINS")),
		WorkspaceRuntimePaths: csv(os.Getenv("TORSOR_WORKSPACE_RUNTIME_PLUGINS")),
		DefaultRuntime:        os.Getenv("TORSOR_DEFAULT_RUNTIME"),
	}
}

func envStr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func envInt(key string, def int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(strings.TrimSpace(v)); err == nil {
			return n
		}
	}
	return def
}

func csv(v string) []string {
	if strings.TrimSpace(v) == "" {
		return nil
	}
	parts := strings.Split(v, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if t := strings.TrimSpace(p); t != "" {
			out = append(out, t)
		}
	}
	return out
}

func lowerAll(in []string) []string {
	out := make([]string, len(in))
	for i, s := range in {
		out[i] = strings.ToLower(s)
	}
	return out
}

// parseExpiry accepts Go durations plus the common "<n>d" day shorthand used by the
// existing JWT_EXPIRES_IN default.
func parseExpiry(v string, def time.Duration) time.Duration {
	v = strings.TrimSpace(v)
	if v == "" {
		return def
	}
	if strings.HasSuffix(v, "d") {
		if n, err := strconv.Atoi(strings.TrimSuffix(v, "d")); err == nil {
			return time.Duration(n) * 24 * time.Hour
		}
	}
	if d, err := time.ParseDuration(v); err == nil {
		return d
	}
	return def
}
