# Firmware Center

The Firmware Center integrates system, EIO controller, and EIO module firmware
operations into one Cockpit page. It deliberately keeps the three update
domains separate: they share transport, task persistence, and presentation,
but not package formats or flashing logic.

## Components

| Component | Location | Responsibility |
| --- | --- | --- |
| Cockpit package | `/usr/share/cockpit/iot2050-firmware` | File selection, inspection results, confirmation, and task status |
| Local client | `/usr/sbin/iot2050-fwmgr` | JSON command adapter used by Cockpit with `superuser: require` |
| Manager | `/usr/lib/iot2050/firmware-manager` | Provider discovery, staging, task persistence, and hardware-operation locking |
| Manager socket | `/run/iot2050/firmware-manager.sock` | Root-only, systemd-activated JSON Lines IPC |
| SM providers | `iot2050-firmware-provider-sm` | Controller and module adapters installed only with SM support |

No HTTP firmware API or additional listening network port is introduced.
Cockpit invokes the local client through its existing privilege boundary.

## Runtime model

The protocol version is `1`. Each request and response occupies one JSON line.
The currently supported operations are:

- `capabilities.list`: list providers that are available on this device.
- `staging.import`: copy a local file into private manager storage and return a
  token, size, name, and SHA-256 digest.
- `inspect.get`: perform provider-specific checks without writing hardware.
- `action.start`: start one persistent hardware task.
- `task.get`: retrieve the durable task state.
- `action.rollback`: restore the shared local System Firmware backup.
- `task.cancel`: best-effort cancellation of a queued task only.
- `staging.list`, `staging.delete`, `staging.gc`: operator maintenance of uploaded artifacts.

Only one hardware operation can run at a time. Tasks transition through
`queued`, `running`, and `succeeded` or `failed`. A task left in `queued` or
`running` after manager restart is marked `failed/interrupted`; automatic flash
resume is intentionally not attempted.

Provider descriptors in `providers.d` isolate optional hardware support. A bad
optional descriptor is logged and skipped instead of disabling the System
Firmware provider.

## Security boundaries

### Staging

The manager copies input through an `O_NOFOLLOW` file descriptor, accepts only
regular files, enforces a size limit, and stores data and metadata under a
root-only directory. `resolve()` recomputes size and SHA-256 before every
inspection or update so that a modified staged object is rejected.

Tokens are capabilities for files already inside manager-controlled storage;
providers never accept arbitrary paths from Cockpit.

Staged artifacts are claimed by their task before a worker starts. Successful
tasks consume their uploads; failed tasks release them for diagnostics and the
hourly systemd GC removes unclaimed artifacts older than 24 hours. The GC never
traverses the task store or the System rollback store.

### System Firmware

Managed System Firmware updates have stricter behavior than the legacy CLI:

- A signature is mandatory and is verified during inspection and again before
  flashing.
- The package is extracted into a private temporary directory.
- Only flat regular-file tar members are accepted. Absolute paths, parent
  traversal, directories, symbolic links, hard links, and device nodes are
  rejected.
- Member count and total extracted size are bounded.
- CLI and manager use the same canonical backup file at
  `/var/lib/iot2050/firmware-update/rollback_backup_fw.tar`. An explicit CLI
  `--backup-dir` remains a compatibility override, but is not another default
  backup pool.
- Web rollback uses that local backup and verifies its SHA-256 metadata before
  reusing the existing CLI rollback flashing semantics.
- The managed path never prompts, retries a failed flash, or reboots.

The CLI remains backward compatible: `--verify` is still optional there, and
its existing arguments and numeric return codes remain stable. New code must
not implement the Web path by calling the CLI `main()` because that would
inherit interactive confirmation and blind retry behavior.

The manager socket remains `0600 root:root`. Product administrators use
Cockpit's `superuser: require` flow backed by their `sudo` membership; the
`iot2050-admin` group is not granted direct firmware-socket access.

### SM-only providers

SM provider packaging is controlled by `IOT2050_SM_SUPPORT`. At runtime, the
device-tree compatible string is the hardware identity boundary and EIOFS
nodes prove service readiness. Hiding a card in the browser is not treated as
authorization; provider availability is checked again in the manager.

`firmware_a` and `firmware_b` refer to chip A and chip B inside a module. They
are not redundant banks. Module slots are validated as `1..6` by the backend.

## Provider contracts

### System

The default source is the packaged tarball matching
`/usr/share/iot2050/fwu/IOT2050-FW-Update-PKG-*.tar.xz`. The page also accepts
a custom uploaded signed tar package. Both sources go through the same backend
compatibility and signature checks; the browser never decides whether the
package is valid. Inspection returns the selected firmware name, target version
and board, firmware SHA-256, and signature status. Inspecting a package only
locks the System inspection controls; Controller and Module controls remain
available until a hardware task is actually queued. Update always backs up and
reports that a reboot is required.

### EIO controller

Source: image-default firmware only. Inspection reports runtime and bundled
versions, metadata SHA-1, actual SHA-256, update need, and integrity. The
current controller format is not signature-verified; the UI must display the
hash before confirmation and the provider performs readback after flashing.

### Module

Source: independently staged chip A and/or chip B images. Updates preserve the
existing CLI order (A then B) and report per-chip outcomes. A successful A
write followed by a failed B write remains a partial update and must not be
reported as an atomic rollback.

## Maintenance

When adding a provider:

1. Keep domain-specific validation and flashing in its existing package.
2. Implement `available()`, `capabilities()`, and `inspect()`; add `start()` only
   when writing is supported.
3. Consume staging tokens rather than caller paths.
4. Return stable `ManagerError` codes and avoid exposing tracebacks or private
   paths through IPC.
5. Add host-side contract tests and verify the resulting Debian package.

The host-side test suite is under `tests/firmware_center`. Recipe metadata and
package builds should be run through `kas-container` so `/repo` and Isar paths
match the supported build environment.

Hardware writes require separate on-device validation. In particular, test
power-loss handling, backup readability, flash readback, EIOFS readiness, and
post-update reboot behavior on representative Basic, Advanced, and SM boards.

After a successful update or rollback, the page offers an explicit, second
confirmed `systemctl reboot` action. Reboot is never an automatic side effect
of a firmware request. A queued task may be canceled, but a running or
flashing task is deliberately not interruptible.
