const { execSync } = require('child_process');

// Apply patches to node_modules
require('../patches/fix-pglite-prisma-bytes.cjs');

if (process.env.SKIP_HAPPY_WIRE_BUILD === '1') {
  console.log('[postinstall] SKIP_HAPPY_WIRE_BUILD=1, skipping @happy-cursor/wire build');
  process.exit(0);
}

execSync('yarn workspace @happy-cursor/wire build', {
  stdio: 'inherit',
});
