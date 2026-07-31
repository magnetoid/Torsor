package plugin

import (
	"errors"
	"fmt"
	"testing"
)

func TestNotRunningNilIsNil(t *testing.T) {
	if err := NotRunning(nil); err != nil {
		t.Fatalf("NotRunning(nil) = %v, want nil", err)
	}
	if IsNotRunning(nil) {
		t.Fatal("IsNotRunning(nil) = true, want false")
	}
}

func TestNotRunningRoundTrip(t *testing.T) {
	orig := errors.New("docker exec torsor-abc: container 83a55d is not running")
	tagged := NotRunning(orig)

	if !IsNotRunning(tagged) {
		t.Fatal("IsNotRunning(tagged) = false, want true")
	}
	// The original text must survive for logs and dev-mode error bodies.
	if !errors.Is(tagged, orig) {
		t.Fatal("tagged error lost its cause; want errors.Is(tagged, orig)")
	}
}

// The whole reason NotRunning is a string marker and not a sentinel error: go-plugin
// flattens every error into `rpc error: code = Unknown desc = <text>` on the way back to
// the host, which destroys the wrap chain. Detection must still work on the far side.
func TestIsNotRunningSurvivesGRPCFlattening(t *testing.T) {
	tagged := NotRunning(errors.New("container is not running"))
	flattened := fmt.Errorf("rpc error: code = Unknown desc = %s", tagged.Error())

	if errors.Is(flattened, tagged) {
		t.Fatal("precondition failed: flattening was expected to break the wrap chain")
	}
	if !IsNotRunning(flattened) {
		t.Fatal("IsNotRunning(flattened) = false; the marker did not survive gRPC")
	}
}

func TestIsNotRunningIgnoresUnrelatedErrors(t *testing.T) {
	for _, err := range []error{
		errors.New("docker exec torsor-abc: permission denied"),
		errors.New("no such file or directory"),
		errors.New("rpc error: code = Unavailable desc = connection refused"),
	} {
		if IsNotRunning(err) {
			t.Errorf("IsNotRunning(%q) = true, want false", err)
		}
	}
}
