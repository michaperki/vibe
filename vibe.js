#!/usr/bin/env node
// ViBE launcher: start the server with an optional workspace path.
// Usage: node vibe.js [workspacePath]
// If a path is provided, it sets VIBE_WORKSPACE before loading server.js.

const path = require('path');
const fs = require('fs');

const argPath = process.argv[2];
if (argPath) {
  const abs = path.isAbsolute(argPath) ? argPath : path.resolve(process.cwd(), argPath);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) {
    console.error(`Workspace path not found or not a directory: ${abs}`);
    process.exit(1);
  }
  process.env.VIBE_WORKSPACE = abs;
}

require('./server');

