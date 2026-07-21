// Package appdetect turns an arbitrary project into a runnable plan without a template —
// the zero-config "how do I build+run this?" engine (the Railpack/Nixpacks idea adapted to
// Torsor's exec-in-container model). Given the project's files it detects the stack and
// produces the same Image/Setup/Dev/Build/Serve contract templates use, so template-less
// projects (imports, hand-rolled apps, agent-generated ones) get a live preview and a real
// deploy exactly like templated ones.
//
// Detection is deliberately small and high-confidence: the common stacks done well beat a
// hundred half-supported ones. Unknown projects return ok=false and an honest error
// upstream — never a guessed command that fails confusingly.
package appdetect

import (
	"encoding/json"
	"fmt"
	"strings"
)

// Plan mirrors the server's template contract (image + lifecycle commands).
type Plan struct {
	Kind  string // human-readable stack id, e.g. "vite", "nextjs", "node", "flask", "static"
	Image string // base container image
	Setup string // one-time install (sh -c), "" = none
	Dev   string // long-running dev server binding 0.0.0.0:<port>
	Build string // production build, "" = none
	Serve string // long-running production server binding 0.0.0.0:<port>
}

// packageJSON is the subset of package.json detection needs.
type packageJSON struct {
	Scripts         map[string]string `json:"scripts"`
	Dependencies    map[string]string `json:"dependencies"`
	DevDependencies map[string]string `json:"devDependencies"`
}

func (p packageJSON) has(dep string) bool {
	_, a := p.Dependencies[dep]
	_, b := p.DevDependencies[dep]
	return a || b
}

// Detect inspects the project's files (path → content; only well-known filenames are read)
// and returns the run plan. ok=false when no stack is recognized.
func Detect(files map[string]string, port string) (Plan, bool) {
	get := func(names ...string) (string, bool) {
		for _, n := range names {
			if c, ok := files[n]; ok {
				return c, true
			}
		}
		return "", false
	}

	// --- Node family (package.json is authoritative) ---
	if raw, ok := get("package.json"); ok {
		var pkg packageJSON
		if err := json.Unmarshal([]byte(raw), &pkg); err != nil {
			return Plan{}, false // malformed manifest: better honest failure than guesses
		}
		base := Plan{Image: "node:20-alpine", Setup: "npm install"}

		switch {
		case pkg.has("next"):
			base.Kind = "nextjs"
			base.Dev = fmt.Sprintf("npx next dev -H 0.0.0.0 -p %s", port)
			base.Build = "npx next build"
			base.Serve = fmt.Sprintf("npx next start -H 0.0.0.0 -p %s", port)
		case pkg.has("vite"):
			base.Kind = "vite"
			base.Dev = fmt.Sprintf("npx vite --host 0.0.0.0 --port %s", port)
			base.Build = "npx vite build"
			base.Serve = fmt.Sprintf("npx --yes serve -s dist -l %s", port)
		case pkg.has("react-scripts"):
			base.Kind = "cra"
			base.Dev = fmt.Sprintf("HOST=0.0.0.0 PORT=%s npx react-scripts start", port)
			base.Build = "npx react-scripts build"
			base.Serve = fmt.Sprintf("npx --yes serve -s build -l %s", port)
		default:
			// Generic node: prefer the project's own scripts; PORT/HOST env is the
			// ecosystem convention (express, fastify, hono all honor PORT).
			base.Kind = "node"
			env := fmt.Sprintf("HOST=0.0.0.0 PORT=%s ", port)
			if _, ok := pkg.Scripts["dev"]; ok {
				base.Dev = env + "npm run dev"
			} else if _, ok := pkg.Scripts["start"]; ok {
				base.Dev = env + "npm start"
			} else if _, ok := files["server.js"]; ok {
				base.Dev = env + "node server.js"
			} else if _, ok := files["index.js"]; ok {
				base.Dev = env + "node index.js"
			} else {
				return Plan{}, false
			}
			if _, ok := pkg.Scripts["build"]; ok {
				base.Build = "npm run build"
			}
			if _, ok := pkg.Scripts["start"]; ok {
				base.Serve = env + "npm start"
			} else {
				base.Serve = base.Dev
			}
		}
		return base, true
	}

	// --- Python ---
	if reqs, hasReqs := get("requirements.txt"); hasReqs || hasAny(files, "main.py", "app.py") {
		p := Plan{Image: "python:3.12-alpine"}
		if hasReqs {
			p.Setup = "pip install -r requirements.txt"
		}
		lower := strings.ToLower(reqs)
		switch {
		case strings.Contains(lower, "fastapi"):
			p.Kind = "fastapi"
			mod := pyModule(files)
			p.Dev = fmt.Sprintf("python -m uvicorn %s:app --host 0.0.0.0 --port %s", mod, port)
		case strings.Contains(lower, "flask"):
			p.Kind = "flask"
			p.Dev = fmt.Sprintf("python -m flask --app %s run --host 0.0.0.0 --port %s", pyModule(files), port)
		default:
			p.Kind = "python"
			entry := "main.py"
			if _, ok := files["main.py"]; !ok {
				if _, ok := files["app.py"]; ok {
					entry = "app.py"
				} else {
					return Plan{}, false
				}
			}
			// A bare script is expected to read PORT itself (documented convention).
			p.Dev = fmt.Sprintf("HOST=0.0.0.0 PORT=%s python %s", port, entry)
		}
		p.Serve = p.Dev // python dev servers double as the simple prod path here
		return p, true
	}

	// --- Go ---
	if _, ok := get("go.mod"); ok {
		env := fmt.Sprintf("HOST=0.0.0.0 PORT=%s ", port)
		return Plan{
			Kind:  "go",
			Image: "golang:1.25-alpine",
			Dev:   env + "go run .",
			Build: "go build -o app .",
			Serve: env + "./app",
		}, true
	}

	// --- Static site (index.html, no manifest) ---
	if _, ok := get("index.html"); ok {
		serve := fmt.Sprintf("npx --yes serve -s . -l %s", port)
		return Plan{Kind: "static", Image: "node:20-alpine", Dev: serve, Serve: serve}, true
	}

	return Plan{}, false
}

// KeyFiles are the filenames Detect inspects — callers only need to load these.
var KeyFiles = []string{
	"package.json", "server.js", "index.js",
	"requirements.txt", "main.py", "app.py",
	"go.mod", "index.html",
}

func hasAny(files map[string]string, names ...string) bool {
	for _, n := range names {
		if _, ok := files[n]; ok {
			return true
		}
	}
	return false
}

// pyModule picks the app module name for flask/uvicorn (main or app).
func pyModule(files map[string]string) string {
	if _, ok := files["app.py"]; ok {
		return "app"
	}
	return "main"
}
