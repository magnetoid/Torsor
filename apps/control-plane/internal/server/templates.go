package server

import "fmt"

// Workspace templates: the catalog that turns "what are you building" into a runnable
// cloud workspace. Each template carries a base image, optional starter files, a one-time
// setup (pre-install) command, and a long-running dev command that binds the preview port
// (previewPort() = TORSOR_WS_APP_PORT) on 0.0.0.0 so the preview proxy can reach it. This is
// what makes the "pick a stack -> it boots preinstalled -> preview it" flow real, on top of
// the existing WorkspaceRuntime + preview pipeline. No plugin/contract change: setup and dev
// run through the runtime's Exec, dev detached so it keeps serving.

// workspaceDir is the working directory templates scaffold into and run from. Pinned so
// file paths and commands are consistent regardless of the base image's default WORKDIR.
const workspaceDir = "/workspace"

// Template describes a runnable starter stack.
type Template struct {
	ID          string            `json:"id"`
	Name        string            `json:"name"`
	Description string            `json:"description"`
	Icon        string            `json:"icon"` // lucide icon name for the picker
	Image       string            `json:"-"`    // base container image
	Setup       string            `json:"-"`    // one-time pre-install (sh -c), empty = none
	Dev         string            `json:"-"`    // long-running dev server (sh -c), binds the preview port
	Files       map[string]string `json:"-"`    // starter files (path relative to workspaceDir -> content)
}

// templateCatalog is the ordered list surfaced in the picker and used for provisioning.
// Built once so port-dependent commands/files use the real preview port.
var templateCatalog = buildTemplateCatalog()

func buildTemplateCatalog() []Template {
	port := previewPort()
	return []Template{
		{
			ID:          "static",
			Name:        "Static Site",
			Description: "Plain HTML/CSS/JS served instantly — no build step.",
			Icon:        "FileCode",
			Image:       "node:20-alpine",
			Setup:       "",
			Dev:         "npx --yes serve -s . -l " + port,
			Files: map[string]string{
				"index.html": staticIndexHTML,
				"style.css":  staticStyleCSS,
			},
		},
		{
			ID:          "node-express",
			Name:        "Node + Express API",
			Description: "A minimal Express server with a JSON endpoint.",
			Icon:        "Server",
			Image:       "node:20-alpine",
			Setup:       "npm install",
			Dev:         "node server.js",
			Files: map[string]string{
				"package.json": nodeExpressPackageJSON,
				"server.js":    fmt.Sprintf(nodeExpressServerJS, port),
			},
		},
		{
			ID:          "vite-react",
			Name:        "React (Vite)",
			Description: "React + Vite dev server with hot reload.",
			Icon:        "Atom",
			Image:       "node:20-alpine",
			Setup:       "npm install",
			Dev:         "npm run dev -- --host 0.0.0.0 --port " + port,
			Files: map[string]string{
				"package.json":   viteReactPackageJSON,
				"vite.config.js": fmt.Sprintf(viteReactConfig, port),
				"index.html":     viteReactIndexHTML,
				"src/main.jsx":   viteReactMainJSX,
				"src/App.jsx":    viteReactAppJSX,
			},
		},
	}
}

// templateByID returns the catalog template with the given id (ok=false if none).
func templateByID(id string) (Template, bool) {
	for _, t := range templateCatalog {
		if t.ID == id {
			return t, true
		}
	}
	return Template{}, false
}

// --- starter file contents ---

const staticIndexHTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>My Static Site</title>
    <link rel="stylesheet" href="style.css" />
  </head>
  <body>
    <main>
      <h1>It works 🎉</h1>
      <p>Edit <code>index.html</code> and refresh the preview.</p>
    </main>
  </body>
</html>
`

const staticStyleCSS = `:root { color-scheme: light dark; }
body { font-family: system-ui, sans-serif; display: grid; place-items: center; min-height: 100vh; margin: 0; }
main { text-align: center; }
code { background: rgba(127,127,127,.15); padding: .1em .35em; border-radius: 4px; }
`

const nodeExpressPackageJSON = `{
  "name": "torsor-express-app",
  "private": true,
  "type": "commonjs",
  "scripts": { "start": "node server.js" },
  "dependencies": { "express": "^4.19.2" }
}
`

// %s is the preview port.
const nodeExpressServerJS = `const express = require('express');
const app = express();
const port = process.env.PORT || %s;

app.get('/', (_req, res) => {
  res.send('<h1>Express is running 🚀</h1><p>Try <a href="/api/hello">/api/hello</a></p>');
});
app.get('/api/hello', (_req, res) => res.json({ message: 'Hello from Torsor' }));

app.listen(port, '0.0.0.0', () => console.log('listening on ' + port));
`

const viteReactPackageJSON = `{
  "name": "torsor-vite-react",
  "private": true,
  "type": "module",
  "scripts": { "dev": "vite", "build": "vite build", "preview": "vite preview" },
  "dependencies": { "react": "^18.3.1", "react-dom": "^18.3.1" },
  "devDependencies": { "@vitejs/plugin-react": "^4.3.1", "vite": "^5.4.0" }
}
`

// %s is the preview port.
const viteReactConfig = `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({ plugins: [react()], server: { host: '0.0.0.0', port: %s } });
`

const viteReactIndexHTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Torsor + React</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
`

const viteReactMainJSX = `import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(<App />);
`

const viteReactAppJSX = `import React, { useState } from 'react';

export default function App() {
  const [count, setCount] = useState(0);
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', display: 'grid', placeItems: 'center', minHeight: '100vh' }}>
      <div style={{ textAlign: 'center' }}>
        <h1>React + Vite ⚛️</h1>
        <button onClick={() => setCount((c) => c + 1)}>count is {count}</button>
        <p>Edit <code>src/App.jsx</code> and save — the preview hot-reloads.</p>
      </div>
    </main>
  );
}
`
