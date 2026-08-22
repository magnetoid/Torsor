package server

import (
	"context"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/magnetoid/torsor/control-plane/internal/applog"
)

// The log console: a Postgres sink for applog, browser error ingestion, and the super-admin
// query API behind them.

// pgLogWriter persists applog entries. It is the only place that knows the table shape.
type pgLogWriter struct{ pool *pgxpool.Pool }

// Write inserts a batch. Failure is reported, never retried in place: the caller counts it and
// moves on, because a log sink that blocks on a sick database makes the outage worse.
func (w pgLogWriter) Write(ctx context.Context, batch []applog.Entry) error {
	rows := make([][]any, 0, len(batch))
	for _, e := range batch {
		rows = append(rows, []any{
			e.Time, e.Level, e.Source, truncate(e.Message, 4000), truncate(e.Logger, 128),
			truncate(e.RequestID, 128), nullUUID(e.UserID), nullUUID(e.ProjectID),
			truncate(e.Method, 10), truncate(e.Route, 1000), nullInt(e.Status), nullInt(e.Duration),
			truncate(e.Error, 8000), truncate(e.Stack, 16000), applog.MarshalFields(e.Fields),
			truncate(e.Release, 64), truncate(e.IP, 64), truncate(e.UserAgent, 512),
		})
	}
	_, err := w.pool.CopyFrom(ctx,
		pgx.Identifier{"app_logs"},
		[]string{"ts", "level", "source", "message", "logger", "request_id", "user_id", "project_id",
			"method", "route", "status", "duration_ms", "error", "stack", "fields", "release", "ip", "user_agent"},
		pgx.CopyFromRows(rows))
	return err
}

// truncate caps a value at n CHARACTERS so it fits a VARCHAR(n) column.
//
// Three things have to be right at once, and the first version got all three wrong:
//   - Postgres VARCHAR(n) counts characters, not bytes, so the limit must be measured in runes.
//   - The ellipsis is part of the result, so it must fit INSIDE n, not be appended after
//     slicing to n (that returned n+1 characters and overflowed every column it "protected").
//   - Slicing a UTF-8 string at a byte offset can split a rune and produce invalid UTF-8,
//     which Postgres rejects outright (SQLSTATE 22021).
//
// Getting this wrong is not a cosmetic bug: these values go through CopyFrom, so one oversized
// or malformed field aborts the whole batch of up to 64 log entries — and the failure is
// swallowed by design, so logging would silently stop working.
func truncate(s string, n int) string {
	if n <= 0 {
		return ""
	}
	if utf8.RuneCountInString(s) <= n {
		return s
	}
	if n == 1 {
		return "…"
	}
	// Reserve the last character for the ellipsis.
	count, cut := 0, len(s)
	for i := range s {
		if count == n-1 {
			cut = i
			break
		}
		count++
	}
	return s[:cut] + "…"
}

// nullUUID rejects anything that is not a real UUID, so a malformed id becomes NULL instead of
// killing the batch it rides in on. Length alone is not enough: a 36-character string of
// arbitrary text passes a length check and then fails the uuid column, taking every other log
// entry in the same CopyFrom with it. Both fields it guards (user_id, project_id) are
// attacker-influenced via POST /api/v1/logs.
func nullUUID(s string) any {
	if _, err := uuid.Parse(s); err != nil {
		return nil
	}
	return s
}

func nullInt(v int) any {
	if v == 0 {
		return nil
	}
	return v
}

// --- browser ingestion ---------------------------------------------------------------------

// handleClientLog accepts error reports from the browser.
//
// Authenticated on purpose: an unauthenticated ingest endpoint is a free write amplifier for
// anyone who finds it. Levels are clamped to warn/error so a chatty client cannot fill the
// table with debug noise, and the batch size is bounded.
func (s *Server) handleClientLog(w http.ResponseWriter, r *http.Request) {
	if s.applog == nil {
		// Logging tee not installed (e.g. tests): accept and discard rather than 500 — the
		// client must never see its own error reporting fail.
		w.WriteHeader(http.StatusNoContent)
		return
	}
	var body struct {
		Entries []struct {
			Level     string         `json:"level"`
			Message   string         `json:"message"`
			Logger    string         `json:"logger"`
			Error     string         `json:"error"`
			Stack     string         `json:"stack"`
			Route     string         `json:"route"`
			RequestID string         `json:"requestId"`
			ProjectID string         `json:"projectId"`
			Fields    map[string]any `json:"fields"`
		} `json:"entries"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	const maxEntries = 20
	if len(body.Entries) > maxEntries {
		body.Entries = body.Entries[:maxEntries]
	}
	uid := userID(r)
	ip, ua := clientIP(r), r.UserAgent()
	for _, in := range body.Entries {
		if strings.TrimSpace(in.Message) == "" {
			continue
		}
		level := "error"
		if strings.EqualFold(in.Level, "warn") {
			level = "warn"
		}
		s.applog.Ingest(applog.Entry{
			Time: time.Now(), Level: level, Source: "frontend",
			Message: in.Message, Logger: in.Logger, Error: in.Error, Stack: in.Stack,
			Route: in.Route, RequestID: in.RequestID, ProjectID: in.ProjectID,
			UserID: uid, Fields: in.Fields, IP: ip, UserAgent: ua,
		})
	}
	w.WriteHeader(http.StatusNoContent)
}

// --- super-admin query API -----------------------------------------------------------------

type logRow struct {
	ID         string         `json:"id"`
	TS         time.Time      `json:"ts"`
	Level      string         `json:"level"`
	Source     string         `json:"source"`
	Message    string         `json:"message"`
	Logger     string         `json:"logger"`
	RequestID  string         `json:"requestId"`
	UserID     *string        `json:"userId"`
	UserEmail  *string        `json:"userEmail"`
	ProjectID  *string        `json:"projectId"`
	Method     string         `json:"method"`
	Route      string         `json:"route"`
	Status     *int           `json:"status"`
	DurationMs *int           `json:"durationMs"`
	Error      string         `json:"error"`
	Stack      string         `json:"stack"`
	Fields     map[string]any `json:"fields"`
	Release    string         `json:"release"`
	IP         string         `json:"ip"`
	UserAgent  string         `json:"userAgent"`
}

// handleAdminLogs is the console's query endpoint: filter by level, source, free text, time
// window, user, or request id, newest first.
//
// Filters are composed as parameterized predicates — never string-interpolated — because this
// endpoint takes more user input than any other in the admin surface.
func (s *Server) handleAdminLogs(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	where := []string{"1=1"}
	args := []any{}
	add := func(pred string, val any) {
		args = append(args, val)
		where = append(where, strings.Replace(pred, "?", "$"+strconv.Itoa(len(args)), 1))
	}

	if v := q.Get("level"); v != "" && v != "all" {
		// "min level" semantics: asking for warnings should show errors too, since an operator
		// filtering for problems wants the worse ones included, not excluded.
		switch v {
		case "error":
			add("l.level = ?", "error")
		case "warn":
			where = append(where, "l.level IN ('warn','error')")
		case "info":
			where = append(where, "l.level IN ('info','warn','error')")
		default:
			add("l.level = ?", v)
		}
	}
	if v := q.Get("source"); v == "backend" || v == "frontend" {
		add("l.source = ?", v)
	}
	if v := strings.TrimSpace(q.Get("q")); v != "" {
		args = append(args, "%"+v+"%")
		p := "$" + strconv.Itoa(len(args))
		where = append(where, "(l.message ILIKE "+p+" OR l.error ILIKE "+p+" OR l.route ILIKE "+p+")")
	}
	if v := q.Get("requestId"); v != "" {
		add("l.request_id = ?", v)
	}
	if v := q.Get("userId"); len(v) == 36 {
		add("l.user_id = ?", v)
	}
	if v := q.Get("since"); v != "" {
		if d, err := time.ParseDuration(v); err == nil {
			add("l.ts > ?", time.Now().Add(-d))
		}
	}
	limit := 100
	if v, err := strconv.Atoi(q.Get("limit")); err == nil && v > 0 && v <= 500 {
		limit = v
	}
	args = append(args, limit)

	rows, err := s.pool.Query(r.Context(),
		`SELECT l.id, l.ts, l.level, l.source, l.message, l.logger, l.request_id,
		        l.user_id, u.email, l.project_id, l.method, l.route, l.status, l.duration_ms,
		        l.error, l.stack, l.fields, l.release, l.ip, l.user_agent
		   FROM app_logs l LEFT JOIN users u ON u.id = l.user_id
		  WHERE `+strings.Join(where, " AND ")+`
		  ORDER BY l.ts DESC LIMIT $`+strconv.Itoa(len(args)), args...)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	defer rows.Close()

	items := []logRow{}
	for rows.Next() {
		var it logRow
		var projectID *string
		if err := rows.Scan(&it.ID, &it.TS, &it.Level, &it.Source, &it.Message, &it.Logger,
			&it.RequestID, &it.UserID, &it.UserEmail, &projectID, &it.Method, &it.Route,
			&it.Status, &it.DurationMs, &it.Error, &it.Stack, &it.Fields, &it.Release,
			&it.IP, &it.UserAgent); err != nil {
			s.fail(w, r, err)
			return
		}
		it.ProjectID = projectID
		items = append(items, it)
	}
	if err := rows.Err(); err != nil {
		s.fail(w, r, err)
		return
	}

	// Report what the tee lost, so a truncated view is never presented as the whole story.
	var dropped, failed uint64
	if s.applog != nil {
		dropped, failed = s.applog.Stats()
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"items":   items,
		"limit":   limit,
		"dropped": dropped,
		"failed":  failed,
	})
}

// handleAdminLogStats powers the console's summary strip: counts by level and source over a
// window, plus the loudest routes — the fastest way to see what is actually broken.
func (s *Server) handleAdminLogStats(w http.ResponseWriter, r *http.Request) {
	since := 24 * time.Hour
	if d, err := time.ParseDuration(r.URL.Query().Get("since")); err == nil && d > 0 {
		since = d
	}
	cutoff := time.Now().Add(-since)

	counts := map[string]int{}
	rows, err := s.pool.Query(r.Context(),
		`SELECT level, source, count(*) FROM app_logs WHERE ts > $1 GROUP BY level, source`, cutoff)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	for rows.Next() {
		var level, source string
		var n int
		if err := rows.Scan(&level, &source, &n); err != nil {
			rows.Close()
			s.fail(w, r, err)
			return
		}
		counts[level] += n
		counts[source+":"+level] += n
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		s.fail(w, r, err)
		return
	}

	type topRoute struct {
		Route string `json:"route"`
		Count int    `json:"count"`
	}
	top := []topRoute{}
	trows, err := s.pool.Query(r.Context(),
		`SELECT route, count(*) AS n FROM app_logs
		  WHERE ts > $1 AND level = 'error' AND route <> ''
		  GROUP BY route ORDER BY n DESC LIMIT 10`, cutoff)
	if err == nil {
		for trows.Next() {
			var t topRoute
			if err := trows.Scan(&t.Route, &t.Count); err == nil {
				top = append(top, t)
			}
		}
		trows.Close()
	}

	var total int
	_ = s.pool.QueryRow(r.Context(), `SELECT count(*) FROM app_logs`).Scan(&total)

	writeJSON(w, http.StatusOK, map[string]any{
		"counts": counts, "topErrorRoutes": top, "total": total,
		"windowSeconds": int(since.Seconds()),
	})
}

// handleAdminPurgeLogs trims the table. Retention is an operator decision, so this is explicit
// rather than a silent background truncate: ?olderThan=720h keeps a month, no parameter clears
// everything. Audited, because deleting the diagnostic record is itself worth recording.
func (s *Server) handleAdminPurgeLogs(w http.ResponseWriter, r *http.Request) {
	var tag int64
	if v := r.URL.Query().Get("olderThan"); v != "" {
		d, err := time.ParseDuration(v)
		if err != nil || d <= 0 {
			writeError(w, http.StatusBadRequest, "olderThan must be a duration like 720h")
			return
		}
		ct, err := s.pool.Exec(r.Context(), `DELETE FROM app_logs WHERE ts < $1`, time.Now().Add(-d))
		if err != nil {
			s.fail(w, r, err)
			return
		}
		tag = ct.RowsAffected()
	} else {
		ct, err := s.pool.Exec(r.Context(), `DELETE FROM app_logs`)
		if err != nil {
			s.fail(w, r, err)
			return
		}
		tag = ct.RowsAffected()
	}
	s.auditFromRequest(r, "logs_purge", "platform", "", "", "Purged "+strconv.FormatInt(tag, 10)+" log rows")
	writeJSON(w, http.StatusOK, map[string]any{"deleted": tag})
}

// pruneAppLogs enforces a hard retention ceiling so an unattended instance cannot fill its disk
// with diagnostics. Runs alongside the other startup housekeeping.
func pruneAppLogs(ctx context.Context, pool *pgxpool.Pool, keep time.Duration) error {
	_, err := pool.Exec(ctx, `DELETE FROM app_logs WHERE ts < $1`, time.Now().Add(-keep))
	if err != nil && errors.Is(err, context.Canceled) {
		return nil
	}
	return err
}
