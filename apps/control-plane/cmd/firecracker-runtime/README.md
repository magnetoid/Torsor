# firecracker-runtime (design blueprint — KVM host required)

A Torsor `WorkspaceRuntime` plugin backed by **Firecracker microVMs** — the 2027 sandbox
standard for running untrusted, agent-generated code with true VM isolation and
millisecond-scale snapshot/restore/fork.

> **Status: not yet implemented.** This plugin requires a Linux host with `/dev/kvm`, so it
> cannot be built or validated in the repo's macOS dev environment (native gates locally,
> heavy runtimes on a dedicated Linux host — see CLAUDE.md). The `WorkspaceRuntime` interface,
> its gRPC adapters, and the `/api/v1/projects/{id}/workspace/{snapshot,restore,fork}` HTTP
> surface are **already wired and tested** against `mock-runtime` (in-memory) and
> `docker-runtime` (`docker commit`), so this plugin only has to implement the same interface.
> It ships behind `TORSOR_WORKSPACE_RUNTIME_PLUGINS` opt-in; `docker-runtime` stays the default.

## Why microVMs (vs. containers)

Containers share the host kernel; a kernel escape is a host compromise. For multi-tenant,
agent-driven code execution the 2026/27 consensus is hardware-virtualized microVMs:
Firecracker boots a stripped guest kernel in ~125 ms with a ~5 MiB memory overhead, and its
**native snapshot/restore** resumes a paused VM (full memory + device state) in single-digit
milliseconds — which is exactly what `SnapshotWorkspace`/`RestoreWorkspace`/`ForkWorkspace`
were reserved for. (E2B ≈ 200 ms boots, Daytona ≈ 90 ms are Firecracker-based.)

## Integration plan (open-source first — ADR 0010)

Use **`github.com/firecracker-microvm/firecracker-go-sdk`** (Apache-2.0). Do not shell out to
the `firecracker` binary directly; the SDK owns the VMM lifecycle and the snapshot API.

| `WorkspaceRuntime` method | Firecracker mapping |
|---|---|
| `CreateWorkspace` | Build a `firecracker.Config` (prebuilt guest kernel `vmlinux` + a per-workspace copy-on-write ext4 rootfs from a base image), start the VMM, boot. |
| `StartWorkspace` / `StopWorkspace` | `machine.Start` / `machine.Shutdown` (or pause via `PauseVM`). |
| `DestroyWorkspace` | `machine.StopVMM` + remove the CoW rootfs + tap device. |
| `StatusWorkspace` | Track VMM state; `PreviewHost/Port` = the guest's tap-device IP + app port. |
| `Exec` | A tiny **vsock** agent inside the guest (`AF_VSOCK`) receives argv, streams stdout/stderr/exit back — the SDK exposes the vsock device; no SSH needed. |
| `ListFiles` / `ReadFile` / `WriteFile` | Same vsock agent (or a 9p/virtio-fs share of the workspace dir). |
| `SnapshotWorkspace` | `machine.PauseVM` → `machine.CreateSnapshot(memFile, snapshotFile)`; the snapshot id is the `{mem,state}` path pair (or an object-store key). |
| `RestoreWorkspace` | `machine.LoadSnapshot` into the same workspace id (resume in place). |
| `ForkWorkspace` | `LoadSnapshot` into a **new** VM with a fresh tap + CoW rootsnapshot — the ms-level "branch an agent's world" primitive. |

### Networking / preview
Give each VM a `tap` device on a host bridge with a per-VM IP; report the guest IP + app port
in `WorkspaceStatusResponse.PreviewHost/PreviewPort`. The existing preview and deploy proxies
then work unchanged (they already consume those fields).

### Guest assets (documented build script, to add)
- `vmlinux`: a minimal 6.x guest kernel (Firecracker's recommended config).
- `rootfs.ext4`: base dev image (busybox/alpine + the vsock exec agent binary), mounted CoW
  per workspace via an overlay so create is cheap and destroy is clean.

## Host requirements & validation
- Linux with `/dev/kvm` (check: `ls -l /dev/kvm`), `CAP_NET_ADMIN` for tap setup.
- **Check `tetra` first** (`ls -l /dev/kvm`); most shared/OpenVZ hosts lack KVM. If absent,
  validate on a rented bare-metal/nested-virt KVM box, then document the host in deployment
  notes. Never run this on the shared control-plane host — microVMs belong on a dedicated
  worker, like `docker-runtime`'s real containers.

## Skeleton
```go
package main // //go:build linux — VMM ops need KVM

import "github.com/magnetoid/torsor/control-plane/internal/plugin"

type runtime struct{ /* kernelPath, rootfsPath, bridge, snapshotDir */ }

func (r runtime) Info(ctx) (plugin.RuntimeInfo, error) {
    return plugin.RuntimeInfo{Name: "firecracker", DisplayName: "Firecracker microVM",
        Version: "0.1.0", Kind: "workspace_runtime"}, nil
}
// ... implement the 12 WorkspaceRuntime methods per the table above ...

func main() { plugin.ServeRuntime(runtime{ /* from env */ }) }
```
Then load it with `TORSOR_WORKSPACE_RUNTIME_PLUGINS=/path/to/firecracker-runtime` and
`TORSOR_DEFAULT_RUNTIME=firecracker` on the KVM worker host.
