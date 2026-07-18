package server

import (
	"strings"
	"testing"
)

// TestTemplateCatalog guards the invariants the prepare flow relies on: every template has
// an id/name/image and a dev command, ids are unique, and the port-dependent commands/files
// actually carry the preview port (so the dev server binds where the proxy looks).
func TestTemplateCatalog(t *testing.T) {
	port := previewPort()
	seen := map[string]bool{}
	for _, tmpl := range templateCatalog {
		if tmpl.ID == "" || tmpl.Name == "" || tmpl.Image == "" || tmpl.Dev == "" {
			t.Fatalf("template %+v missing a required field (id/name/image/dev)", tmpl)
		}
		if seen[tmpl.ID] {
			t.Fatalf("duplicate template id %q", tmpl.ID)
		}
		seen[tmpl.ID] = true

		got, ok := templateByID(tmpl.ID)
		if !ok || got.ID != tmpl.ID {
			t.Fatalf("templateByID(%q) failed to round-trip", tmpl.ID)
		}
	}

	// The React template's dev command must bind the preview port.
	vite, ok := templateByID("vite-react")
	if !ok {
		t.Fatal("expected a vite-react template")
	}
	if !strings.Contains(vite.Dev, port) {
		t.Fatalf("vite dev command %q does not bind preview port %q", vite.Dev, port)
	}

	if _, ok := templateByID("does-not-exist"); ok {
		t.Fatal("templateByID returned ok for an unknown id")
	}
}
