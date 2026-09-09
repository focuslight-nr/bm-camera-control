# Security Policy

This is a hobby/third-party tool, provided as-is (see `LICENSE`).

## Reporting a vulnerability

Please report security issues privately via GitHub's **"Report a vulnerability"**
button under the repository's **Security** tab (Private vulnerability reporting),
rather than opening a public issue.

## Scope notes

- The app talks to cameras on your local network. It accepts the camera's
  self-signed TLS certificate by design (the Rust backend in
  `src-tauri/src/camera.rs`); only use it on trusted networks.
- No credentials are stored or transmitted by this app.

## Known advisories

Advisories that are open against `src-tauri/Cargo.lock` but do not affect the
released builds. Each is left open in Dependabot rather than dismissed, so it
stays visible until upstream moves.

### GHSA-wrw7-89jp-8q8g — `glib` unsoundness (moderate)

Unsoundness in the `Iterator`/`DoubleEndedIterator` impls for
`glib::VariantStrIter`. Affects `glib >= 0.15.0, < 0.20.0`; the lock file
pins 0.18.5.

**Not applicable to the released builds.** `glib` reaches the lock file
through Tauri's GTK-based Linux backend (`tauri` → `gtk 0.18.2` →
`glib 0.18.5`), and this app is released for Windows and macOS only
(see `.github/workflows/release.yml`). It is not part of the dependency
graph for either shipped target:

```console
$ cargo tree --target x86_64-pc-windows-msvc -i glib
warning: nothing to print.
$ cargo tree --target aarch64-apple-darwin -i glib
warning: nothing to print.
```

**No fix is available to us.** `gtk 0.18.2` requires `glib ^0.18`, so the
patched 0.20.0 cannot be selected:

```console
$ cargo update -p glib --precise 0.20.0
error: failed to select a version for the requirement `glib = "^0.18"`
candidate versions found which didn't match: 0.20.0
required by package `gtk v0.18.2`
```

`tauri` is already at its latest release (2.11.5), which still uses the
gtk3-rs 0.18 line. This resolves on its own when Tauri moves to a newer
GTK stack; no action is needed here unless Linux becomes a release target,
in which case re-evaluate before shipping.

_Last reviewed: 2026-09-09 (tauri 2.11.5)._
