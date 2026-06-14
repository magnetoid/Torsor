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

func (c *Client) Close() error { return c.rdb.Close() }
