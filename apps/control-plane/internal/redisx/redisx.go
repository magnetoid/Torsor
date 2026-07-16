// Package redisx wraps the Redis client used for job signaling and readiness checks.
package redisx

import (
	"context"
	"time"

	"github.com/redis/go-redis/v9"
)

type Client struct {
	rdb *redis.Client
}

// New parses a redis:// URL and returns a connected-on-demand client.
func New(url string) (*Client, error) {
	opt, err := redis.ParseURL(url)
	if err != nil {
		return nil, err
	}
	return &Client{rdb: redis.NewClient(opt)}, nil
}

// Ping verifies connectivity within a short timeout.
func (c *Client) Ping(ctx context.Context) error {
	ctx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	return c.rdb.Ping(ctx).Err()
}

// Healthy reports whether Redis responds to PING.
func (c *Client) Healthy(ctx context.Context) bool {
	return c.Ping(ctx) == nil
}

// Publish emits a message on a channel; used to wake the worker for new tasks.
func (c *Client) Publish(ctx context.Context, channel, payload string) error {
	return c.rdb.Publish(ctx, channel, payload).Err()
}

// Subscribe calls handler for every message on channel until ctx is cancelled. It runs the
// receive loop in a background goroutine and returns immediately; used to wake the agent
// worker pool (torsor:jobs) and to deliver cancel signals (torsor:cancel).
func (c *Client) Subscribe(ctx context.Context, channel string, handler func(payload string)) {
	sub := c.rdb.Subscribe(ctx, channel)
	ch := sub.Channel()
	go func() {
		defer sub.Close()
		for {
			select {
			case <-ctx.Done():
				return
			case msg, ok := <-ch:
				if !ok {
					return
				}
				handler(msg.Payload)
			}
		}
	}()
}

// SubscribeChan subscribes to channel and returns a receive-only channel of payloads plus a
// cancel func the caller must invoke to release the subscription. Used by the task-event SSE
// handler to live-tail a running agent run.
func (c *Client) SubscribeChan(ctx context.Context, channel string) (<-chan string, func()) {
	sub := c.rdb.Subscribe(ctx, channel)
	out := make(chan string, 64)
	done := make(chan struct{})
	go func() {
		defer close(out)
		msgs := sub.Channel()
		for {
			select {
			case <-ctx.Done():
				return
			case <-done:
				return
			case msg, ok := <-msgs:
				if !ok {
					return
				}
				select {
				case out <- msg.Payload:
				case <-ctx.Done():
					return
				case <-done:
					return
				}
			}
		}
	}()
	return out, func() {
		close(done)
		_ = sub.Close()
	}
}

func (c *Client) Close() error { return c.rdb.Close() }
