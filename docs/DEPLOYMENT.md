# Deploying Misty Bunny

Everything the server side needs, and everything the repository side already
does. The game is a static site: a production Vite build served directly by
Caddy, with no Node process, no container, no database and no additional port.

**Status: not deployed.** `misty-bunny.gyute.fyi` is still returning the
intentional `503` placeholder from `/etc/caddy/sites/games-pending.caddy`. The
server-side entry point described here has not been provisioned. Until it is,
the deploy step fails by design.

---

## 1. What is ready to deploy

| | |
|---|---|
| Repository | `https://github.com/Bynzski/misty-bunny` |
| Production branch | `main` |
| Commit | `deploy/production-hosting` off `a3bff26` — see `git log origin/main..deploy/production-hosting` |
| Public URL | `https://misty-bunny.gyute.fyi/` |

The commit to deploy is whatever `main` points at when the workflow runs — the
workflow refuses to deploy anything but the exact sha it built from. Nothing
from the uncommitted odometer-wheel work in the working tree is included; see
§8.

## 2. Build

```bash
npm ci                 # from package-lock.json; this is what CI runs
npm run build          # vite build -> dist/
export SOURCE_DATE_EPOCH=$(git log -1 --pretty=%ct)
npm run stamp -- --sha "$(git rev-parse HEAD)" --ref "$(git rev-parse --abbrev-ref HEAD)"
npm run check:dist     # fails closed on anything not intended to be public
```

Node 18+; CI uses Node 22. `npm ci` installs `vite` (a devDependency), which is
expected — the build needs it, the served site does not.

`SOURCE_DATE_EPOCH` is what makes a release reproducible: the commit time goes
into the manifest instead of a wall clock, so two builds of the same commit
produce byte-identical archives and therefore the same sha256. Without it the
build still works and still deploys correctly — the digest is computed and
verified in the same run either way — but it is no longer reproducible.

## 3. Artifact layout

The build output *is* the document root. Nothing is generated at runtime.

```
dist/
├── index.html                      one document; the game boots from it
├── release.json                    provenance: source sha + a sha256 per file
├── SHA256SUMS                      the same inventory, in `sha256sum -c` format
└── assets/
    ├── index-<hash>.js             the whole game (~916 kB, ~249 kB gzipped)
    ├── index-<hash>.css            ~14 kB
    └── <material>_<map>-<hash>.png the 18 baked PBR maps, ~9.4 MB
```

Total ~11 MB. Filenames are content-hashed, so `assets/` can be cached forever
and a new release never needs a cache purge.

`dist/` is gitignored. Both manifests are written after the build by
`tools/stamp-release.mjs`, never by the game, and `tools/check-dist.mjs` holds
the result to them. Neither manifest inventories itself, and re-stamping a
directory produces the same manifest rather than a corrupt one.

`SHA256SUMS` exists so the server can verify an extracted release with
coreutils alone. It is there because `sha256sum` is already required to check
the uploaded tarball, and a static web host has no reason to carry a JSON
parser. `release.json` is the same inventory in the copy that CI and the public
site read.

### Rules the served site has to follow

1. **`/` must serve `index.html`.** It is the only document; there is no
   client-side router, so there is no history fallback and adding one would be
   actively wrong — a request for a missing path must 404, not quietly return
   the game.
2. **`/assets/*` must be served with a long, immutable cache.** The names are
   content hashes.
3. **`/` and `/release.json` must not be cached.** They are what changes on
   deploy, and the workflow reads `release.json` to prove the live sha.
4. **No trailing-slash games.** `https://misty-bunny.gyute.fyi` must redirect
   to `https://misty-bunny.gyute.fyi/`, because asset URLs are root-absolute.
5. **HTTPS only.** Caddy already has a valid certificate for this host.
6. **The game is not a server-side application.** No proxying to a Node
   process, no `reverse_proxy`, no upstream port. If something in the setup
   implies one, that is a sign something is wrong.

Runtime requirements, unchanged from development: a **WebGL2** browser,
desktop, mouse and keyboard, and pointer lock. It is not playable on touch and
degrades badly without a GPU.

## 4. What CI does

`.github/workflows/deploy.yml`.

- Pull requests and any push: build → stamp → audit → package. **No deploy.**
- Push to `main` only: the above, then deploy, then verify over public HTTPS.
- `permissions: contents: read`. No write scopes, no PAT, no OIDC.
- `concurrency: misty-bunny-production`, `cancel-in-progress: false` — one
  deployment at a time, and a newer push never kills a deployment mid-flight.
- Ubuntu-24.04 GitHub-hosted runners. No self-hosted runner.
- The repository is checked out with `persist-credentials: false`.

The archive is reproducible (`tar --sort=name --owner=0 --group=0 --numeric-owner
--mtime=<commit time>`, `GZIP=-n`), so the same commit always produces the same
tarball bytes and therefore the same sha256.

### Secrets and variables

One secret, three variables. Nothing else is needed.

| Kind | Name | Value |
|---|---|---|
| secret | `MISTY_BUNNY_DEPLOY_SSH_KEY` | private ed25519 key, **PEM including the `-----BEGIN OPENSSH PRIVATE KEY-----` header and the trailing newline** |
| variable | `MISTY_BUNNY_SSH_HOST` | `15.204.255.170` |
| variable | `MISTY_BUNNY_SSH_PORT` | `22` (optional, defaults to 22) |
| variable | `MISTY_BUNNY_SSH_USER` | `misty-bunny-deploy` |
| variable | `MISTY_BUNNY_SSH_HOST_KEY_SHA256` | the pinned fingerprint, e.g. `SHA256:AbCd…` (comma-separate if you pin several key types) |

Plus a GitHub **environment** named `production` (already referenced by the
workflow — create it, optionally with required reviewers). No environment
secrets are required; an environment is used only so deployment can be gated
and so its history is visible.

The key is written to a `0600` file inside `RUNNER_TEMP`, used only via
`-i` with `IdentitiesOnly=yes`, and shredded in a final `if: always()` step on
every exit path.

**Host-key pinning is by fingerprint, not by TOFU.** The workflow scans the
key, computes its SHA256 fingerprint, and aborts unless it equals
`MISTY_BUNNY_SSH_HOST_KEY_SHA256`. `StrictHostKeyChecking=yes` with a
throwaway `UserKnownHostsFile`. Nothing anywhere sets
`StrictHostKeyChecking=no`. If the server key ever rotates, that variable has to
be updated deliberately.

## 5. The server-side entry point

**This does not exist yet.** The workflow calls exactly this:

```
misty-bunny-release <source-sha-40hex> <tarball-sha256-64hex>
```

with the release tarball on **stdin**. Nothing is left running; the process
exits when it is done. No argument, no stdin, no terminal means the deploy
fails.

The existing Gyute/Disc It deploy command is **not** assumed to accept this
game — the contract above is a proposal, and the workflow's failure message
says so explicitly.

### Required behaviour

1. Read stdin to a temporary file inside the deploy user's own staging
   directory. Never write anywhere else, and never as another user.
2. Compute its sha256. If it does not equal `$2`, exit non-zero **having
   changed nothing**.
3. Extract to `releases/<sha>.incoming` as the deploy user with
   `umask 022`, `--no-same-owner` and `--no-same-permissions` (not as root).
4. Read `release.json` from the extracted tree; if `source_sha != $1`, exit
   non-zero and delete the staging directory.
5. Verify every served file against `SHA256SUMS` with `sha256sum -c`. Any
   failure aborts.
6. `rename` the staged directory to `releases/<sha>`. Releases are immutable
   and named by commit, so a re-deploy of the same commit is a no-op.
7. `touch` the release directory, then switch the symlink atomically. The
   `touch` matters: the reproducible archive gives every file the commit date,
   so without it every release directory shares one timestamp and "keep the
   newest five" becomes arbitrary — which is how a rollback ends up pointing
   back at the release that just went out.

   ```sh
   touch "releases/$sha"
   ln -sfn "releases/$sha" "$ROOT/.current.new"
   mv -T "$ROOT/.current.new" "$ROOT/current"
   ```

8. Keep the five most recent releases. **Never** delete anything outside
   `releases/`, never delete `current`, never do a broad `find -delete`.
   Persistent data does not exist for this game, so there is nothing to prune
   beyond release directories.
9. Print the resolved `current` path on stdout and exit 0.

Exit codes: `0` success, `2` usage, `3` tarball checksum mismatch, `4` release
inventory mismatch, `5` filesystem error.

**No Caddy reload is needed** for either a deploy or a rollback: `root *`
resolves through the symlink per request, so the swap is visible to the next
request and in-flight requests finish against the old files. This is the point
of the atomic rename.

A reference implementation is in `deploy/misty-bunny-release` in this
repository. It is a starting point for review, not a finished artefact —
Fred owns the server integration and should apply it under his own change
control.

## 6. Identity and permissions

```sh
sudo useradd --system --no-create-home --shell /usr/sbin/nologin misty-bunny-deploy
sudo install -d -o misty-bunny-deploy -g misty-bunny-deploy -m 0755 \
     /srv/games/misty-bunny/releases
```

The deploy user owns `releases/` outright. **No `sudoers` entry, no root, no
group gymnastics** — it writes only inside a directory it owns, and Caddy
reaches the result read-only through the `current` symlink. Mode `0755`/
`0644` (from `umask 022`) is what makes the install permissions-safe for Caddy
without granting the deploy account anything over the rest of the box.

`authorized_keys` for the deploy user — one line, no wildcards:

```
restrict,from="<GitHub Actions published CIDRs>",command="/usr/local/sbin/misty-bunny-release" ssh-ed25519 AAAA… misty-bunny-deploy
```

- `restrict` — no PTY, no agent forwarding, no port forwarding, no X11,
  no user rc.
- `command=` — the account can only ever run this one program with the
  arguments the workflow supplies.
- `from=` — GitHub publishes its runner egress ranges at
  `https://api.github.com/meta` under `actions`. Pin them; they change rarely
  and the change is announced. The line gets long, which is fine.

If `from=` is impractical, `restrict` + `command=` still means the account can
do nothing but this one thing. It is a real weakening — say so, do not skip it
silently.

Fetch the current host key fingerprint with:

```sh
ssh-keyscan -t ed25519 15.204.255.170 2>/dev/null | ssh-keygen -lf - -E sha256
```

That is the value for `MISTY_BUNNY_SSH_HOST_KEY_SHA256`.

## 7. Caddy

`/etc/caddy/sites/games-pending.caddy` currently holds three placeholders.
**Replace only the Misty Bunny block, and add no second `misty-bunny.gyute.fyi`
block anywhere** — the shared proxy globs `/etc/caddy/sites/*.caddy`, so a
duplicate hostname would be a config error at best and an ambiguous site at
worst. Gyute and Disc It are not to be touched.

```caddy
misty-bunny.gyute.fyi {
	root * /srv/games/misty-bunny/current
	encode zstd gzip

	file_server {
		index index.html
	}

	header {
		X-Content-Type-Options nosniff
		Referrer-Policy strict-origin-when-cross-origin
		-Server
	}

	# Content-hashed filenames: safe to keep forever.
	@assets path /assets/*
	header @assets Cache-Control "public, max-age=31536000, immutable"

	# The two things that change on deploy must always be revalidated.
	@fresh path / /index.html /release.json
	header @fresh Cache-Control "no-cache"

	log {
		output discard
	}
}
```

Deliberately absent:

- `try_files` / SPA fallback — there is no router. A missing path should 404.
- `reverse_proxy` — there is nothing running to proxy to.
- `header Permissions-Policy` — worth adding `pointer-lock=(self)` if the
  proxy is ever behind a policy-injection layer; the game needs pointer lock
  and will silently fail to capture the mouse without it.

Then `sudo caddy validate --config /etc/caddy/Caddyfile` and reload the shared
proxy the way the other sites are reloaded.

## 8. Validation

### Automatic, on every push to main

`tools/verify-live.mjs` runs after the deploy and fails the job on any of:

1. `/release.json` served over HTTPS and reporting the exact expected commit;
2. `/` serving the game, not a placeholder — checks the title is *Misty Bunny*
   and that the body is not the deployment-pending page;
3. the canonical URL being `https://misty-bunny.gyute.fyi/`;
4. **every file in the release inventory fetched over the public hostname and
   compared byte for byte** — ~11 MB, including all 18 baked textures.

A green build, a successful upload or an HTTP 200 all pass steps that this
replaces; none of them prove the right bytes are being served.

### Manual, after the first deploy

CI **cannot** play the game — a GitHub-hosted runner has no GPU, and the level
falls back to a software rasteriser at under 2 fps. The gameplay check has to
happen on a machine with a GPU:

```bash
SMOKE_URL=https://misty-bunny.gyute.fyi/ npm run smoke
```

That is the same harness that verifies the build locally. It asserts all nine
clues can be reached and read, that the reading view opens, magnifies and hands
the cursor back, that `W` walks where the camera faces, that water and walls
block, that the meridian passage can be walked, that all three puzzles solve
through the real UI, that the ending arrives, that every request succeeded, and
that there were no runtime errors or THREE warnings.

Browser acceptance, by hand: pointer lock on *Go Ashore*, mouse look, `WASD`,
`E` lifting a page off the wall, `J` for the journal, the three combination
panels, `Esc` releasing the cursor, no 404s in the network tab, no errors in
the console.

Stop the browser afterwards. `npm run smoke` closes it itself.

### Verifying the deployed commit

```sh
curl -s https://misty-bunny.gyute.fyi/release.json | head -20
# source_sha must be the sha in the workflow run summary
```

## 9. Rollback

Immutable releases make this a symlink move. No rebuild, no upload, no Caddy
reload.

```sh
ls -1 /srv/games/misty-bunny/releases          # find the sha you want back
cd /srv/games/misty-bunny
ln -sfn "releases/<previous-sha>" .current.new
mv -T .current.new current
ls -l current && curl -sI https://misty-bunny.gyute.fyi/ | head -1
```

Roll forward by deploying again — a re-deploy of any earlier sha reuses that
commit's existing release directory unchanged.

One caveat: retention is by deploy time, so a release you have rolled *back*
to is the oldest thing in `releases/` and will be the first one retired if you
then deploy. Roll forward within a few deploys, or `touch` it, rather than
sitting on it.

The previous release is always kept (five are retained), so a rollback never
depends on rebuilding anything.

## 10. What this does not do

- It does not change Gyute, Disc It or Knot Again!.
- It does not add a Node process, a container, a database or a public port.
- It does not print, log or transmit any secret. The workflow never echoes the
  key and only ever reads it.
- It does not install a self-hosted runner, disable host-key checking, or add a
  webhook receiver.

## 11. Open items for the owner

1. **In-game title text.** The browser tab, metadata, canonical and social cards
   now say *Misty Bunny*. The title card inside the game still reads *The
   Hollow Meridian*, which is kept as the tower's own name in the fiction.
   Changing it is a content decision, not a deployment one.
2. **`og:image`.** There is no deployed social-preview image, so link previews
   will render as a text card. One needs a real screenshot asset, which is an
   owner decision about what the game looks like publicly.
3. **Gameplay verification in CI** would need a GPU runner. That is deliberately
   out of scope here; §8 documents the manual alternative.