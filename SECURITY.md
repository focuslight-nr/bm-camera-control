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
