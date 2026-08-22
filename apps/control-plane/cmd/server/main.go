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
	// `control-plane -health` is a self-contained HTTP probe of /health, so the distroless
	// image (no shell/curl) can still define a container healthcheck.
	if len(os.Args) > 1 && os.Args[1] == "-health" {
		os.Exit(healthProbe())
	}

	cfg := config.Load()
	logger := newLogger(cfg)

	// Fail closed unless NODE_ENV is explicitly "development": require a strong JWT_SECRET
	// so a bare `docker run` (unset NODE_ENV) cannot boot with the well-known dev secret,
	// which would let anyone forge tokens for any user.
	if !cfg.IsDevelopment() {
		if s := cfg.JWTSecret; s == "" || s == "dev-secret-change-me" || len(s) < 32 {
			logger.Error("JWT_SECRET must be set to a strong value (>=32 chars) unless NODE_ENV=development")
			os.Exit(1)
		}
	} else if cfg.JWTSecret == "" {
		// Explicit local dev only: allow the well-known throwaway secret.
		cfg.JWTSecret = "dev-secret-change-me"
		logger.Warn("using well-known dev JWT secret (NODE_ENV=development); never do this in production")
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
	warnLeftoverDevSeed(ctx, logger, pool, cfg)

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
	for _, path := range cfg.WorkspaceRuntimePaths {
		info, err := host.LoadWorkspaceRuntime(ctx, path)
		if err != nil {
			logger.Warn("workspace runtime plugin failed to load", "path", path, "err", err)
			continue
		}
		logger.Info("workspace runtime plugin loaded", "name", info.Name, "version", info.Version)
	}

	am := auth.NewManager(pool, cfg.JWTSecret, cfg.JWTExpiry)
	srv := server.New(cfg, pool, rc, am, host, logger)

	// Route the process logger through the database tee. Every logger.Warn/Error already
	// written across the codebase becomes durable and queryable in the admin log console
	// without a single call site changing. Installed after migrations, since it writes to
	// app_logs; stdout logging continues regardless of the database's health.
	logger = srv.InstallLogTee(ctx, baseLogHandler(cfg), dbLogLevel(), os.Getenv("TORSOR_RELEASE"))
	logger.Info("log tee installed", "min_level", dbLogLevel().String(), "retention", logRetention().String())

	// Hard retention ceiling so an unattended instance cannot fill its disk with diagnostics.
	if err := srv.PruneLogs(ctx, logRetention()); err != nil {
		logger.Warn("log prune failed", "err", err)
	}

	// Background agent worker pool: drains the ai_tasks queue. Bound to workerCtx so
	// in-flight runs are cancelled (and requeued as pending) on shutdown.
	workerCtx, stopWorkers := context.WithCancel(context.Background())
	defer stopWorkers()
	srv.StartAgentWorkers(workerCtx)

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
	stopWorkers() // cancel in-flight background runs so they requeue for the next boot

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := httpServer.Shutdown(shutdownCtx); err != nil {
		logger.Warn("graceful shutdown failed", "err", err)
	}
}

func healthProbe() int {
	port := os.Getenv("PORT")
	if port == "" {
		port = os.Getenv("API_PORT")
	}
	if port == "" {
		port = "3001"
	}
	client := &http.Client{Timeout: 3 * time.Second}
	resp, err := client.Get("http://127.0.0.1:" + port + "/health")
	if err != nil {
		return 1
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusOK {
		return 0
	}
	return 1
}

func stdoutLevel(cfg config.Config) slog.Level {
	level := slog.LevelDebug
	if cfg.IsProduction() {
		level = slog.LevelInfo
	}
	if lv := os.Getenv("LOG_LEVEL"); lv != "" {
		_ = level.UnmarshalText([]byte(lv))
	}
	return level
}

// baseLogHandler is the stdout half of logging. Kept separate from newLogger so the database
// tee can wrap the same handler rather than building a second, subtly different one.
func baseLogHandler(cfg config.Config) slog.Handler {
	return slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: stdoutLevel(cfg)})
}

func newLogger(cfg config.Config) *slog.Logger { return slog.New(baseLogHandler(cfg)) }

// dbLogLevel is the threshold for PERSISTING a record, independent of what stdout prints.
// Warn by default: info-level request chatter would swamp app_logs and make it useless for
// the thing it exists for — finding faults. LOG_DB_LEVEL=info widens it when investigating.
func dbLogLevel() slog.Level {
	level := slog.LevelWarn
	if lv := os.Getenv("LOG_DB_LEVEL"); lv != "" {
		_ = level.UnmarshalText([]byte(lv))
	}
	return level
}

// logRetention bounds how long diagnostics are kept. 30 days by default; LOG_RETENTION accepts
// any Go duration.
func logRetention() time.Duration {
	if v := os.Getenv("LOG_RETENTION"); v != "" {
		if d, err := time.ParseDuration(v); err == nil && d > 0 {
			return d
		}
	}
	return 30 * 24 * time.Hour
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

// warnLeftoverDevSeed shouts about a dev-seed account that outlived the environment that
// created it. ensureDevSeed is gated on NODE_ENV=development, so a production instance can
// never *create* the demo user — but it can inherit one: run an instance in development,
// flip it to production, and the row survives with the documented dev password, reachable
// by anyone who has read the README. The seeder cannot clean that up (deleting a user with
// real projects is the operator's call), so the least we can do is say so on every boot.
func warnLeftoverDevSeed(ctx context.Context, logger *slog.Logger, pool *pgxpool.Pool, cfg config.Config) {
	if cfg.IsDevelopment() {
		return
	}
	var id string
	err := pool.QueryRow(ctx,
		`SELECT id FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1`, cfg.DevSeedEmail).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return
	}
	if err != nil {
		// Best-effort: a failed advisory check must never block startup.
		logger.Warn("dev-seed leftover check failed", "err", err)
		return
	}
	logger.Warn("SECURITY: dev-seed account exists on a non-development instance — it may still carry the documented default password. Delete it or rotate its password.",
		"email", cfg.DevSeedEmail, "user_id", id, "env", cfg.Env)
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
		`INSERT INTO users (email, username, password_hash, bio, onboarded) VALUES ($1, $2, $3, $4, true)`,
		cfg.DevSeedEmail, "demo", hash, "Local seeded demo user")
	return err
}
