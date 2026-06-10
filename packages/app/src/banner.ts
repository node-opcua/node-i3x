import type { I3xConfig } from './config.js';

export function printBanner(
  version: string,
  config: I3xConfig,
  nodeCount?: number,
): void {
  const lines = [
    '',
    '  i3X Server v' + version,
    '',
    '  OPC UA:  ' + config.endpoint,
    '  REST:    http://' + config.host + ':' + config.port,
  ];

  if (nodeCount !== undefined) {
    lines.push('  Model:   ' + nodeCount + ' nodes');
  }

  lines.push('');
  lines.push('  Press Ctrl+C to stop');
  lines.push('');

  // Calculate box width
  const maxLen = Math.max(...lines.map((l) => l.length));
  const width = maxLen + 2;

  const hr = '-'.repeat(width);
  const top = '  +' + hr + '+';
  const bot = '  +' + hr + '+';

  console.log(top);
  for (const line of lines) {
    console.log('  |' + line.padEnd(width) + '|');
  }
  console.log(bot);
  console.log();
}
