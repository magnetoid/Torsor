# Build a small static binary, then ship it on distroless.
FROM golang:1.24-alpine AS build
WORKDIR /src

COPY go.mod go.sum* ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /out/control-plane ./cmd/server

FROM gcr.io/distroless/static-debian12:nonroot
WORKDIR /app
COPY --from=build /out/control-plane /app/control-plane
EXPOSE 3001
USER nonroot:nonroot
ENTRYPOINT ["/app/control-plane"]
