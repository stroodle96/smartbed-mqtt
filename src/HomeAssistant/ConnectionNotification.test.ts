import http from 'http';
import { ConnectionNotification } from './ConnectionNotification';
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
test('real HA service HTTP failures are contained; stable outage IDs distinguish endpoints and dismiss recovery', async () => {
  const requests: any[] = [];
  let fail = true;
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (b) => (body += b));
    req.on('end', () => {
      requests.push({ path: req.url, body: JSON.parse(body) });
      res.statusCode = fail ? 503 : 200;
      res.end('[]');
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as any).port}`;
  const n = new ConnectionNotification('ESPHome', '192.168.0.123:6053', '192.168.0.123', base, 'test-token');
  try {
    n.down();
    await wait(50);
    expect(requests).toHaveLength(1);
    fail = false;
    await wait(10100);
    expect(requests).toHaveLength(2);
    n.down();
    await wait(50);
    expect(requests).toHaveLength(2);
    expect(requests[1].body.message).toContain('192.168.0.123:6053');
    expect(requests[1].body.message).toContain('10 seconds');
    n.up();
    await wait(50);
    expect(requests[2].path).toBe('/services/persistent_notification/dismiss');
    expect(requests[2].body.notification_id).toBe(requests[1].body.notification_id);
    const m = new ConnectionNotification('MQTT', 'broker:1883', '192.168.0.123', base, 'test-token');
    m.down();
    await wait(50);
    expect(requests[3].body.notification_id).not.toBe(requests[1].body.notification_id);
    expect(requests[3].body.message).toContain('192.168.0.123');
    m.close();
  } finally {
    n.close();
    await new Promise<void>((r) => server.close(() => r()));
  }
}, 15000);
