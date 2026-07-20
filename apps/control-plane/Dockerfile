# Build a small static binary, then ship it on distroless.
# Go base must satisfy the go.mod `go` directive (1.25).
FROM golang:1.25-alpine AS build
WORKDIR /src

COPY go.mod go.sum* ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /out/control-plane ./cmd/server
# Bundle the plugins so the shipped image can actually do something out of the box:
# - mock-runtime: in-memory reference runtime (safe on any host, no Docker)
# - docker-runtime: real container-per-workspace via the docker CLI (needs a Docker
#   socket; only enable on a host that can safely provide one — see docker-compose.yml)
# - ollama-model: the free local ModelProvider (connects to an Ollama server)
# - hosted providers (anthropic/openai/google/deepseek/openrouter): BYO-key — they start
#   WITHOUT any host key and unlock per user via encrypted secrets ({NAME}_API_KEY),
#   keeping hosted models opt-in and the local default free.
#
# All eight plugins build in ONE compiler invocation into /out/ (each main package lands
# at /out/<pkg-base-name>). One cache layer instead of eight — faster, and it avoids the
# transient BuildKit worker deaths the per-binary layers hit under parallel-build pressure.
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /out/ \
    ./cmd/mock-runtime ./cmd/docker-runtime ./cmd/ollama-model \
    ./cmd/anthropic-model ./cmd/openai-model ./cmd/gemini-model \
    ./cmd/deepseek-model ./cmd/openrouter-model

# docker-runtime shells out to the `docker` CLI, so the runtime image needs it (and it
# needs a shell for tini-free exec). Use alpine + the docker client rather than distroless.
# chromium powers the agent's verify_app tool (internal/verify): one shared headless
# browser in the control plane verifies every project's running app — no per-workspace
# browser install. The image grows ~250MB for it; without chromium the tool degrades to an
# honest "no browser available" observation, so leaner custom builds may drop this line.
FROM alpine:3.20
RUN apk add --no-cache docker-cli tini ca-certificates chromium
ENV TORSOR_BROWSER_PATH=/usr/bin/chromium-browser
WORKDIR /app
COPY --from=build /out/control-plane /app/control-plane
COPY --from=build /out/mock-runtime /app/mock-runtime
COPY --from=build /out/docker-runtime /app/docker-runtime
COPY --from=build /out/ollama-model /app/ollama-model
COPY --from=build /out/anthropic-model /app/anthropic-model
COPY --from=build /out/openai-model /app/openai-model
COPY --from=build /out/gemini-model /app/gemini-model
COPY --from=build /out/deepseek-model /app/deepseek-model
COPY --from=build /out/openrouter-model /app/openrouter-model
EXPOSE 3001
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["/app/control-plane"]
