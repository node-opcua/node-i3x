import { createHash } from 'node:crypto';

function stableI3xId(browsePath: string, kind: string): string {
  const digest = createHash('sha1').update(browsePath, 'utf8').digest('hex').slice(0, 16);
  return `${kind}-${digest}`;
}

const paths = [
  'nsu=http://opcfoundation.org/UA/:ObjectsFolder',
  'nsu=http://opcfoundation.org/UA/:ObjectsFolder/nsu=http://sterfive.com/UA/EmbeddedDemo/:SmartFactory',
  'nsu=http://opcfoundation.org/UA/:Objects/nsu=http://sterfive.com/UA/EmbeddedDemo/:SmartFactory',
  'nsu=http://sterfive.com/UA/EmbeddedDemo/:SmartFactory',
  'nsu=http://sterfive.com/UA/EmbeddedDemo/:SmartFactory/nsu=http://sterfive.com/UA/EmbeddedDemo/:Pump',
  'nsu=http://sterfive.com/UA/EmbeddedDemo/:SmartFactory/nsu=http://sterfive.com/UA/EmbeddedDemo/:Heater',
  'nsu=http://sterfive.com/UA/EmbeddedDemo/:SmartFactory/nsu=http://sterfive.com/UA/EmbeddedDemo/:Conveyor',
  // standard namespaces
  'nsu=http://opcfoundation.org/UA/:Server',
];

console.log('=== HASHES ===');
for (const p of paths) {
  console.log(`Path: ${p} => ID: ${stableI3xId(p, 'asset')}`);
}
