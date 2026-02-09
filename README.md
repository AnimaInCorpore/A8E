# A8E (Atari 800 XL Emulator)

Atari 800 XL emulator available as both a native desktop application and a browser-based version. Original codebase by Sascha Springer (2004).

## Subprojects

| Directory | Description |
|-----------|-------------|
| `A8E/`    | Native C/SDL emulator for Windows, Linux and macOS |
| `jsA8E/`  | Browser-based JavaScript port (WebGL / Canvas) |

Each subfolder contains its own README with build and usage instructions.

## Getting the Source Code

```sh
git clone https://bitbucket.org/AnimaInCorpore/a8e.git
cd a8e
```

## ROM Files

Both versions of the emulator require these Atari ROM dumps (not included):

- `ATARIBAS.ROM`
- `ATARIXL.ROM`

Place them in the repository root. The native build expects them in the working directory; the browser version can load them via the UI or auto-load them from the repo root when served over HTTP.

## Quick Start (Browser Version)

Serve the repo root with any static HTTP server and open `jsA8E/`:

```sh
npx http-server -p 8000
# then open http://localhost:8000/jsA8E/
```
