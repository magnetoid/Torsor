# Build a small static binary, then ship it on distroless.
# Go base must satisfy the go.mod `go` directive (1.25).
FROM golang:1.25-alpine AS build
WORKDIR /src

COPY go.mod go.sum* ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /out/control-plane ./cmd/server
# Bundle the reference (in-memory) runtime so the service can be validated end-to-end
# without Docker access. Real runtimes (docker-runtime) are added on a host that can
# safely provide a container engine — never by mounting the host socket on a shared box.
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /out/mock-runtime ./cmd/mock-runtime

FROM gcr.io/distroless/static-debian12:nonroot
WORKDIR /app
COPY --from=build /out/control-plane /app/control-plane
COPY --from=build /out/mock-runtime /app/mock-runtime
EXPOSE 3001
USER nonroot:nonroot
ENTRYPOINT ["/app/control-plane"]
