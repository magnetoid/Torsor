package server

import (
	"encoding/base64"
	"net/http"
	"path"
	"strconv"
	"strings"
)

// App Storage — real per-project asset storage backed by the workspace
// container's filesystem under a fixed prefix. Files are managed via the same
// WorkspaceRuntime primitives the rest of the app uses (WriteFile / ReadFile /
// Exec). There is no public CDN: assets are served back through this
// ownership-scoped, auth-gated API, not a world-readable URL.

const storagePrefix = ".torsor/storage/"

type storageFile struct {
	ID         string `json:"id"` // relative path within the storage root (unique key)
	Name       string `json:"name"`
	Type       string `json:"type"` // image | video | document | other
	Size       int64  `json:"size"`
	UploadedAt int64  `json:"uploadedAt"` // ms since epoch
	Path       string `json:"path"`       // folder, e.g. "/" or "/assets"
}

// storageRel sanitizes a client-supplied relative path and joins it under the
// storage prefix. Rejects traversal and absolute escapes.
func storageRel(rel string) (string, bool) {
	rel = strings.TrimPrefix(strings.TrimSpace(rel), "/")
	if rel == "" {
		return "", false
	}
	clean := path.Clean(rel)
	if clean == "." || clean == ".." || strings.HasPrefix(clean, "../") || strings.Contains(clean, "/../") {
		return "", false
	}
	return storagePrefix + clean, true
}

func storageType(name string) string {
	switch strings.ToLower(path.Ext(name)) {
	case ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".avif", ".bmp", ".ico":
		return "image"
	case ".mp4", ".mov", ".webm", ".avi", ".mkv":
		return "video"
	case ".pdf", ".csv", ".txt", ".md", ".doc", ".docx", ".xls", ".xlsx", ".json":
		return "document"
	default:
		return "other"
	}
}

func (s *Server) handleStorageList(w http.ResponseWriter, r *http.Request) {
	ws, rt, ok := s.loadWorkspace(w, r)
	if !ok {
		return
	}
	// `find ... -exec stat` with busybox-compatible flags (works on Alpine and
	// GNU coreutils). Tab-separated: fullpath, size, mtime(seconds).
	cmd := "find " + storagePrefix + " -type f -exec stat -c '%n\t%s\t%Y' {} ';' 2>/dev/null"
	out, _, _, err := s.execOut(r.Context(), rt, ws.ProjectID, "sh", "-c", cmd)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": parseStorageList(out)})
}

// parseStorageList turns the `find -exec stat` output into storageFile rows.
func parseStorageList(out string) []storageFile {
	items := []storageFile{}
	for _, line := range strings.Split(strings.ReplaceAll(out, "\r\n", "\n"), "\n") {
		if line == "" {
			continue
		}
		parts := strings.SplitN(line, "\t", 3)
		if len(parts) < 3 {
			continue
		}
		full := parts[0]
		rel := strings.TrimPrefix(full, storagePrefix)
		if rel == full { // not under the prefix; skip
			continue
		}
		size, _ := strconv.ParseInt(parts[1], 10, 64)
		mtime, _ := strconv.ParseInt(parts[2], 10, 64)
		dir := "/" + strings.TrimSuffix(path.Dir(rel), ".")
		if dir == "/" || path.Dir(rel) == "." {
			dir = "/"
		}
		items = append(items, storageFile{
			ID:         rel,
			Name:       path.Base(rel),
			Type:       storageType(rel),
			Size:       size,
			UploadedAt: mtime * 1000,
			Path:       dir,
		})
	}
	return items
}

func (s *Server) handleStorageUpload(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Name          string `json:"name"`
		Path          string `json:"path"`          // destination folder, e.g. "/" or "/assets"
		ContentBase64 string `json:"contentBase64"` // raw file bytes, base64
	}
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, http.StatusBadRequest, "Invalid request body")
		return
	}
	if strings.TrimSpace(body.Name) == "" {
		writeError(w, http.StatusBadRequest, "file name is required")
		return
	}
	content, err := base64.StdEncoding.DecodeString(body.ContentBase64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "content must be base64")
		return
	}
	rel := path.Join(strings.TrimPrefix(body.Path, "/"), path.Base(body.Name))
	full, ok := storageRel(rel)
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid path")
		return
	}
	ws, rt, ok := s.loadWorkspace(w, r)
	if !ok {
		return
	}
	if err := rt.WriteFile(r.Context(), ws.ProjectID, full, content, true); err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusCreated, storageFile{
		ID:   strings.TrimPrefix(full, storagePrefix),
		Name: path.Base(body.Name),
		Type: storageType(body.Name),
		Size: int64(len(content)),
		Path: "/" + strings.Trim(strings.TrimPrefix(path.Dir(full), strings.TrimSuffix(storagePrefix, "/")), "/"),
	})
}

func (s *Server) handleStorageDelete(w http.ResponseWriter, r *http.Request) {
	full, ok := storageRel(r.URL.Query().Get("path"))
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid path")
		return
	}
	ws, rt, ok := s.loadWorkspace(w, r)
	if !ok {
		return
	}
	// rm via exec — the runtime has no delete primitive. Path is prefix-scoped
	// and traversal-checked above.
	if _, errOut, exit, err := s.execOut(r.Context(), rt, ws.ProjectID, "rm", "-f", "--", full); err != nil {
		s.fail(w, r, err)
		return
	} else if exit != 0 {
		writeError(w, http.StatusBadRequest, gitErr("delete failed", errOut))
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// handleStorageDownload returns a file's bytes (base64) for in-app preview or
// download — the auth-gated stand-in for a public asset URL.
func (s *Server) handleStorageDownload(w http.ResponseWriter, r *http.Request) {
	full, ok := storageRel(r.URL.Query().Get("path"))
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid path")
		return
	}
	ws, rt, ok := s.loadWorkspace(w, r)
	if !ok {
		return
	}
	content, err := rt.ReadFile(r.Context(), ws.ProjectID, full)
	if err != nil {
		s.fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"name":          path.Base(full),
		"type":          storageType(full),
		"size":          len(content),
		"contentBase64": base64.StdEncoding.EncodeToString(content),
	})
}
