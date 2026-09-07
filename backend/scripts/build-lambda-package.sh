#!/usr/bin/env bash
# Builds backend/lambda-deploy.zip — the exact file to upload via the Lambda
# console's "Upload from > .zip file" button.
#
# Why this can't just be `npm run build`: two of this backend's dependencies
# (@node-rs/argon2's native addon, and Prisma's query engine) ship
# platform-specific binaries. Installing on Windows pulls the Windows
# binaries; Lambda runs Amazon Linux 2023. So `npm install` and
# `prisma generate` both run INSIDE the official Lambda Node 22 container,
# guaranteeing the binaries that land in the zip actually match what Lambda
# will execute — the exact mismatch that already bit this project once
# (see prisma/schema.prisma's `rhel-openssl-3.0.x` binaryTarget comment).
#
# @nforce/shared is deliberately left out of the zip's package.json — tsup
# inlines it directly into dist/lambda.js (see tsup.config.ts's
# `noExternal: ['@nforce/shared']`), so it's not a real runtime dependency.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BACKEND_DIR="$REPO_ROOT/backend"
STAGE_DIR="$BACKEND_DIR/.lambda-package"
ZIP_PATH="$REPO_ROOT/lambda-deploy.zip"
LAMBDA_IMAGE="public.ecr.aws/lambda/nodejs:22"

echo "==> Building backend (tsup)"
(cd "$BACKEND_DIR" && npm run build)

echo "==> Preparing staging directory: $STAGE_DIR"
rm -rf "$STAGE_DIR"
mkdir -p "$STAGE_DIR"

# Runtime package.json: same "dependencies" as backend/package.json, minus
# @nforce/shared (inlined by tsup, not needed at runtime).
BACKEND_DIR="$BACKEND_DIR" STAGE_DIR="$STAGE_DIR" node -e '
  const fs = require("fs");
  const pkg = JSON.parse(fs.readFileSync(process.env.BACKEND_DIR + "/package.json", "utf8"));
  const deps = { ...pkg.dependencies };
  delete deps["@nforce/shared"];
  const out = { name: "lambda-runtime", version: "0.0.0", private: true, type: "module", dependencies: deps };
  fs.writeFileSync(process.env.STAGE_DIR + "/package.json", JSON.stringify(out, null, 2));
'

# prisma generate only needs the schema file, not migrations/seed.
mkdir -p "$STAGE_DIR/prisma"
cp "$BACKEND_DIR/prisma/schema.prisma" "$STAGE_DIR/prisma/schema.prisma"

echo "==> npm install + prisma generate inside $LAMBDA_IMAGE (Linux-native binaries)"
# MSYS_NO_PATHCONV: Git Bash auto-mangles leading-slash args (like /workspace)
# into Windows paths before Docker ever sees them — this disables that for
# just this command, so the container-side paths reach Docker untouched.
MSYS_NO_PATHCONV=1 docker run --rm \
  --entrypoint /bin/bash \
  -v "$STAGE_DIR":/workspace \
  -w /workspace \
  "$LAMBDA_IMAGE" \
  -c "set -e; npm install --omit=dev --no-audit --no-fund; npx --yes prisma@6.12.0 generate --schema=prisma/schema.prisma"

echo "==> Copying built Lambda handler into the package"
cp "$BACKEND_DIR/dist/lambda.js" "$STAGE_DIR/lambda.js"
rm -rf "$STAGE_DIR/prisma"   # only needed generate-time; not read at runtime

# npm's node_modules/.bin symlinks (created by the Linux container) are dev/CLI
# conveniences only — nothing in the running code ever shells out to them, only
# `require`/`import`s the packages directly — and Windows' zip tools can't
# read Linux symlinks through the Docker bind mount anyway. Drop them.
rm -rf "$STAGE_DIR/node_modules/.bin"

echo "==> Zipping $ZIP_PATH"
rm -f "$ZIP_PATH"
if command -v zip >/dev/null 2>&1; then
  (cd "$STAGE_DIR" && zip -rq "$ZIP_PATH" .)
else
  # This Git Bash has no `zip` binary — use PowerShell's built-in Compress-Archive
  # instead of requiring an extra install. Wildcard (STAGE_DIR\*) so the zip's
  # top level is the package contents, not a wrapping folder.
  STAGE_WIN=$(cd "$STAGE_DIR" && pwd -W 2>/dev/null || cygpath -w "$STAGE_DIR" 2>/dev/null || echo "$STAGE_DIR")
  ZIP_WIN=$(cygpath -w "$ZIP_PATH" 2>/dev/null || echo "$ZIP_PATH")
  powershell.exe -NoProfile -Command \
    "Compress-Archive -Path '${STAGE_WIN}\*' -DestinationPath '${ZIP_WIN}' -Force"
fi

SIZE=$(du -h "$ZIP_PATH" | cut -f1)
echo "==> Done: $ZIP_PATH ($SIZE)"
echo "    Upload via: Lambda console -> your function -> Code tab -> Upload from -> .zip file"
