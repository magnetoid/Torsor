// Command server is the Torsor Go control plane. It is a 1:1 port of the legacy
// apps/api Express service (auth, projects, files, tasks) intended to replace it while
// sharing the same Postgres database and JWT/session model.
package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/magnetoid/torsor/control-plane/internal/auth"
	"github.com/magnetoid/torsor/control-plane/internal/config"
	"github.com/magnetoid/torsor/control-plane/internal/db"
	"github.com/magnetoid/torsor/control-plane/internal/migrations"
	"github.com/magnetoid/torsor/control-plane/internal/plugin"
	"github.com/magnetoid/torsor/control-plane/internal/redisx"
	"github.com/magnetoid/torsor/control-plane/internal/server"
)

func main() {
	cfg := config.Load()
	logger := newLogger(cfg)

	if cfg.IsProduction() {
		if s := cfg.JWTSecret; s == "" || s == "dev-secret-change-me" || len(s) < 32 {
			logger.Error("JWT_SECRET must be a strong value (>=32 chars) in production")
			os.Exit(1)
		}
	}
	if cfg.JWTSecret == "" {
		cfg.JWTSecret = "dev-secret-change-me"
	}

	ctx := context.Background()

	pool, err := db.New(ctx, cfg.DatabaseURL, cfg.DBPoolMax)
	if err != nil {
		logger.Error("database init failed", "err", err)
		os.Exit(1)
	}
	defer pool.Close()

	rc, err := redisx.New(cfg.RedisURL)
	if err != nil {
		logger.Error("redis init failed", "err", err)
		os.Exit(1)
	}
	defer rc.Close()

	// Wait for dependencies and apply migrations, retrying forever (mirrors apps/api).
	retryForever(logger, "postgres connect", func() error { return pool.Ping(ctx) })
	retryForever(logger, "redis connect", func() error { return rc.Ping(ctx) })
	retryForever(logger, "migrations", func() error { return migrations.Run(ctx, pool) })
	retryForever(logger, "super-admin sync", func() error { return syncSuperAdmins(ctx, pool, cfg.SuperAdminEmails) })
	retryForever(logger, "dev seed", func() error { return ensureDevSeed(ctx, pool, cfg) })

	// Load capability plugins out-of-process (best-effort: a bad plugin must not stop
	// the control plane from serving).
	host := plugin.NewHost()
	defer host.Close()
	for _, path := range cfg.ModelPluginPaths {
		info, err := host.LoadModelProvider(ctx, path)
		if err != nil {
			logger.Warn("model provider plugin failed to load", "path", path, "err", err)
			continue
		}
		logger.Info("model provider plugin loaded", "name", info.Name, "version", info.Version)
	}

	am := auth.NewManager(pool, cfg.JWTSecret, cfg.JWTExpiry)
	srv := server.New(cfg, pool, rc, am, host, logger)

	httpServer := &http.Server{
		Addr:              ":" + strconv.Itoa(cfg.Port),
		Handler:           srv.Handler(),
		ReadHeaderTimeout: 10 * time.Second,
	}

	// Periodically reap expired session rows so the table stays bounded.
	cleanup := time.NewTicker(time.Hour)
	defer cleanup.Stop()
	go func() {
		for range cleanup.C {
			if _, err := pool.Exec(ctx, `DELETE FROM sessions WHERE expires_at <= NOW()`); err != nil {
				logger.Warn("expired session cleanup failed", "err", err)
			}
		}
	}()

	go func() {
		logger.Info("torsor-control-plane listening", "port", cfg.Port)
		if err := httpServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Error("http server error", "err", err)
			os.Exit(1)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	sig := <-stop
	logger.Info("shutting down", "signal", sig.String())

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := httpServer.Shutdown(shutdownCtx); err != nil {
		logger.Warn("graceful shutdown failed", "err", err)
	}
}

func newLogger(cfg config.Config) *slog.Logger {
	level := slog.LevelDebug
	if cfg.IsProduction() {
		level = slog.LevelInfo
	}
	if lv := os.Getenv("LOG_LEVEL"); lv != "" {
		_ = level.UnmarshalText([]byte(lv))
	}
	return slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: level}))
}

func retryForever(logger *slog.Logger, label string, fn func() error) {
	delay := 500 * time.Millisecond
	for attempt := 1; ; attempt++ {
		if err := fn(); err == nil {
			return
		} else {
			logger.Warn(label+" failed, retrying", "attempt", attempt, "err", err)
		}
		time.Sleep(delay)
		if delay = time.Duration(float64(delay) * 1.5); delay > 15*time.Second {
			delay = 15 * time.Second
		}
	}
}

func syncSuperAdmins(ctx context.Context, pool *pgxpool.Pool, emails []string) error {
	if len(emails) == 0 {
		return nil
	}
	_, err := pool.Exec(ctx,
		`UPDATE users SET role = 'super_admin', updated_at = NOW()
		 WHERE LOWER(email) = ANY($1::text[]) AND role <> 'super_admin'`, emails)
	return err
}

func ensureDevSeed(ctx context.Context, pool *pgxpool.Pool, cfg config.Config) error {
	if !cfg.IsDevelopment() {
		return nil
	}
	var id string
	err := pool.QueryRow(ctx, `SELECT id FROM users WHERE email = $1 LIMIT 1`, cfg.DevSeedEmail).Scan(&id)
	if err == nil {
		return nil
	}
	if err != pgx.ErrNoRows {
		return err
	}
	hash, err := auth.HashPassword(cfg.DevSeedPassword)
	if err != nil {
		return err
	}
	_, err = pool.Exec(ctx,
		`INSERT INTO users (email, username, password_hash, bio) VALUES ($1, $2, $3, $4)`,
		cfg.DevSeedEmail, "demo", hash, "Local seeded demo user")
	return err
}
