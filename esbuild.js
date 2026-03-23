const esbuild = require('esbuild');
const isWatch = process.argv.includes('--watch');

const sharedOptions = {
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'node18',
  sourcemap: true,
  minify: false,
};

const extensionOptions = {
  ...sharedOptions,
  entryPoints: ['src/extension.ts'],
  outfile: 'dist/extension.js',
  external: ['vscode'],
};

const mcpServerOptions = {
  ...sharedOptions,
  entryPoints: ['src/mcp-server.ts'],
  outfile: 'dist/mcp-server.js',
};

if (isWatch) {
  Promise.all([
    esbuild.context(extensionOptions).then(ctx => ctx.watch()),
    esbuild.context(mcpServerOptions).then(ctx => ctx.watch()),
  ]);
} else {
  Promise.all([
    esbuild.build(extensionOptions),
    esbuild.build(mcpServerOptions),
  ]).catch(() => process.exit(1));
}
