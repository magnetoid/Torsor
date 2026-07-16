package server

import (
	"net/http"
	"time"
)

// Usage reads the usage_events rows written on every model call (Phase 4: "usage, finally
// read"). Every query is scoped to the caller's user_id — usage is per-user, like all data.

type usageTotals struct {
	TokensIn  int64 `json:"tokensIn"`
	TokensOut int64 `json:"tokensOut"`
	Events    int64 `json:"events"`
}

type usageDayBucket struct {
	Day       string `json:"day"`
	TokensIn  int64  `json:"tokensIn"`
	TokensOut int64  `json:"tokensOut"`
	Events    int64  `json:"events"`
}

type usageModelBucket struct {
	Model     string `json:"model"`
	Provider  string `json:"provider"`
	TokensIn  int64  `json:"tokensIn"`
	TokensOut int64  `json:"tokensOut"`
	Events    int64  `json:"events"`
}

// handleUsageSummary aggregates the caller's usage: overall totals, a 30-day daily series
// (for the chart), and a per-model breakdown.
func (s *Server) handleUsageSummary(w http.ResponseWriter, r *http.Request) {
	uid := userID(r)

	var totals usageTotals
	if err := s.pool.QueryRow(r.Context(),
		`SELECT COALESCE(SUM(tokens_in),0), COALESCE(SUM(tokens_out),0), COUNT(*)
		   FROM usage_events WHERE user_id = $1`, uid).
		Scan(&totals.TokensIn, &totals.TokensOut, &totals.Events); err != nil {
		s.fail(w, r, err)
		return
	}

	byDay := []usageDayBucket{}
	dayRows, err := s.pool.Query(r.Context(),
		`SELECT to_char(date_trunc('day', created_at), 'YYYY-MM-DD') AS day,
		        COALESCE(SUM(tokens_in),0), COALESCE(SUM(tokens_out),0), COUNT(*)
		   FROM usage_events
		  WHERE user_id = $1 AND created_at >= NOW() - INTERVAL '30 days'
		  GROUP BY day
		  ORDER BY day`, uid)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	defer dayRows.Close()
	for dayRows.Next() {
		var b usageDayBucket
		if err := dayRows.Scan(&b.Day, &b.TokensIn, &b.TokensOut, &b.Events); err != nil {
			s.fail(w, r, err)
			return
		}
		byDay = append(byDay, b)
	}
	if err := dayRows.Err(); err != nil {
		s.fail(w, r, err)
		return
	}

	byModel := []usageModelBucket{}
	modelRows, err := s.pool.Query(r.Context(),
		`SELECT COALESCE(NULLIF(model,''),'(unknown)'), provider,
		        COALESCE(SUM(tokens_in),0), COALESCE(SUM(tokens_out),0), COUNT(*)
		   FROM usage_events
		  WHERE user_id = $1
		  GROUP BY model, provider
		  ORDER BY SUM(tokens_out) DESC
		  LIMIT 20`, uid)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	defer modelRows.Close()
	for modelRows.Next() {
		var b usageModelBucket
		if err := modelRows.Scan(&b.Model, &b.Provider, &b.TokensIn, &b.TokensOut, &b.Events); err != nil {
			s.fail(w, r, err)
			return
		}
		byModel = append(byModel, b)
	}
	if err := modelRows.Err(); err != nil {
		s.fail(w, r, err)
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"totals":  totals,
		"byDay":   byDay,
		"byModel": byModel,
	})
}

type usageEvent struct {
	ID        string    `json:"id"`
	Provider  string    `json:"provider"`
	Model     string    `json:"model"`
	TokensIn  int       `json:"tokensIn"`
	TokensOut int       `json:"tokensOut"`
	CreatedAt time.Time `json:"createdAt"`
}

// handleUsageEvents returns the caller's most recent raw usage events.
func (s *Server) handleUsageEvents(w http.ResponseWriter, r *http.Request) {
	rows, err := s.pool.Query(r.Context(),
		`SELECT id, provider, model, tokens_in, tokens_out, created_at
		   FROM usage_events
		  WHERE user_id = $1
		  ORDER BY created_at DESC
		  LIMIT 100`, userID(r))
	if err != nil {
		s.fail(w, r, err)
		return
	}
	defer rows.Close()

	items := []usageEvent{}
	for rows.Next() {
		var e usageEvent
		if err := rows.Scan(&e.ID, &e.Provider, &e.Model, &e.TokensIn, &e.TokensOut, &e.CreatedAt); err != nil {
			s.fail(w, r, err)
			return
		}
		items = append(items, e)
	}
	if err := rows.Err(); err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": items})
}
