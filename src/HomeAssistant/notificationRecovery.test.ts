import http from 'http';
import { ConnectionNotification } from './ConnectionNotification';
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
test('recovery dismisses an uncertain failed create even if an earlier healthy state was delivered', async () => {
  const paths: string[] = [];
  const server = http.createServer((req, res) => {
    paths.push(req.url!);
    req.resume();
    res.statusCode = paths.length === 2 ? 503 : 200;
    res.end('[]');
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const n = new ConnectionNotification(
    'MQTT',
    'broker:1883',
    '192.168.0.123',
    `http://127.0.0.1:${(server.address() as any).port}`,
    'test'
  );
  try {
    n.up();
    await wait(50);
    n.down();
    await wait(50);
    n.up();
    await wait(50);
    expect(paths).toEqual([
      '/services/persistent_notification/dismiss',
      '/services/persistent_notification/create',
      '/services/persistent_notification/dismiss',
    ]);
  } finally {
    n.close();
    await new Promise<void>((r) => server.close(() => r()));
  }
});
