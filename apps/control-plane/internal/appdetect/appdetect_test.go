package appdetect

import (
	"strings"
	"testing"
)

const port = "3000"

func TestDetectVite(t *testing.T) {
	p, ok := Detect(map[string]string{
		"package.json": `{"devDependencies":{"vite":"^5.0.0"},"scripts":{"dev":"vite"}}`,
	}, port)
	if !ok || p.Kind != "vite" {
		t.Fatalf("vite not detected: %+v ok=%v", p, ok)
	}
	if !strings.Contains(p.Dev, "--host 0.0.0.0") || !strings.Contains(p.Dev, "--port 3000") {
		t.Errorf("vite dev must bind 0.0.0.0:3000: %q", p.Dev)
	}
	if p.Setup != "npm install" || p.Build == "" || !strings.Contains(p.Serve, "dist") {
		t.Errorf("vite lifecycle wrong: %+v", p)
	}
}

func TestDetectNext(t *testing.T) {
	p, ok := Detect(map[string]string{
		"package.json": `{"dependencies":{"next":"14.0.0","react":"18"}}`,
	}, port)
	if !ok || p.Kind != "nextjs" || !strings.Contains(p.Dev, "next dev") || !strings.Contains(p.Serve, "next start") {
		t.Errorf("next detection wrong: %+v ok=%v", p, ok)
	}
}

func TestDetectCRA(t *testing.T) {
	p, ok := Detect(map[string]string{
		"package.json": `{"dependencies":{"react-scripts":"5.0.0"}}`,
	}, port)
	if !ok || p.Kind != "cra" || !strings.Contains(p.Dev, "PORT=3000") {
		t.Errorf("cra detection wrong: %+v ok=%v", p, ok)
	}
}

func TestDetectGenericNode(t *testing.T) {
	// scripts.dev preferred
	p, ok := Detect(map[string]string{
		"package.json": `{"scripts":{"dev":"nodemon server.js","start":"node server.js"}}`,
	}, port)
	if !ok || p.Kind != "node" || !strings.Contains(p.Dev, "npm run dev") || !strings.Contains(p.Dev, "PORT=3000") {
		t.Errorf("node dev-script detection wrong: %+v ok=%v", p, ok)
	}
	if !strings.Contains(p.Serve, "npm start") {
		t.Errorf("node serve should use start script: %q", p.Serve)
	}
	// bare server.js fallback
	p, ok = Detect(map[string]string{"package.json": `{}`, "server.js": "..."}, port)
	if !ok || !strings.Contains(p.Dev, "node server.js") {
		t.Errorf("server.js fallback wrong: %+v ok=%v", p, ok)
	}
	// nothing runnable → honest failure
	if _, ok := Detect(map[string]string{"package.json": `{}`}, port); ok {
		t.Errorf("empty package.json with no entry must not be detected")
	}
	// malformed manifest → honest failure
	if _, ok := Detect(map[string]string{"package.json": `{not json`}, port); ok {
		t.Errorf("malformed package.json must not be detected")
	}
}

func TestDetectPython(t *testing.T) {
	p, ok := Detect(map[string]string{"requirements.txt": "flask==3.0.0\n", "app.py": "..."}, port)
	if !ok || p.Kind != "flask" || !strings.Contains(p.Dev, "--app app") || !strings.Contains(p.Dev, "--port 3000") {
		t.Errorf("flask detection wrong: %+v ok=%v", p, ok)
	}
	p, ok = Detect(map[string]string{"requirements.txt": "fastapi\nuvicorn\n", "main.py": "..."}, port)
	if !ok || p.Kind != "fastapi" || !strings.Contains(p.Dev, "uvicorn main:app") {
		t.Errorf("fastapi detection wrong: %+v ok=%v", p, ok)
	}
	p, ok = Detect(map[string]string{"main.py": "print('hi')"}, port)
	if !ok || p.Kind != "python" || !strings.Contains(p.Dev, "python main.py") {
		t.Errorf("plain python detection wrong: %+v ok=%v", p, ok)
	}
	if p.Setup != "" {
		t.Errorf("no requirements.txt → no setup, got %q", p.Setup)
	}
}

func TestDetectGoAndStatic(t *testing.T) {
	p, ok := Detect(map[string]string{"go.mod": "module x\n"}, port)
	if !ok || p.Kind != "go" || !strings.Contains(p.Dev, "go run .") || !strings.Contains(p.Serve, "./app") {
		t.Errorf("go detection wrong: %+v ok=%v", p, ok)
	}
	p, ok = Detect(map[string]string{"index.html": "<html></html>"}, port)
	if !ok || p.Kind != "static" || !strings.Contains(p.Dev, "serve -s . -l 3000") {
		t.Errorf("static detection wrong: %+v ok=%v", p, ok)
	}
}

func TestDetectNothing(t *testing.T) {
	if _, ok := Detect(map[string]string{"README.md": "# hi"}, port); ok {
		t.Errorf("unknown project must return ok=false")
	}
	if _, ok := Detect(map[string]string{}, port); ok {
		t.Errorf("empty project must return ok=false")
	}
}

// package.json outranks everything else present.
func TestDetectPriority(t *testing.T) {
	p, ok := Detect(map[string]string{
		"package.json": `{"devDependencies":{"vite":"5"}}`,
		"index.html":   "<html></html>", // vite projects have one — must not win
		"main.py":      "...",
	}, port)
	if !ok || p.Kind != "vite" {
		t.Errorf("package.json must take priority, got %+v", p)
	}
}
