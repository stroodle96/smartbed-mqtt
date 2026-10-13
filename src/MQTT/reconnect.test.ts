import { ConnectionNotification } from '../HomeAssistant/ConnectionNotification';
import net from 'net';
import mqtt from 'mqtt';
import { connectToMQTT } from './connectToMQTT';
jest.mock('./MQTTConfig', () => ({ __esModule: true, default: {} }));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
test('real MQTT startup outage and runtime disconnect recover with one client and persistent listeners', async () => {
  const down = jest.spyOn(ConnectionNotification.prototype, 'down');
  const up = jest.spyOn(ConnectionNotification.prototype, 'up');
  const holder = net.createServer();
  await new Promise<void>((r) => holder.listen(0, '127.0.0.1', r));
  const port = (holder.address() as net.AddressInfo).port;
  await new Promise<void>((r) => holder.close(() => r()));
  const actual = mqtt.connect.bind(mqtt);
  let client: any;
  const spy = jest.spyOn(mqtt, 'connect').mockImplementation(() => {
    client = actual({ host: '127.0.0.1', port, reconnectPeriod: 10000 });
    return client;
  });
  const sockets = new Set<net.Socket>();
  const server = net.createServer((s) => {
    sockets.add(s);
    s.on('close', () => sockets.delete(s));
    s.on('data', (b) => {
      if (b[0] === 0x10) s.write(Buffer.from([0x20, 2, 0, 0]));
    });
  });
  try {
    let rejected = false;
    const pending = connectToMQTT().catch((e) => {
      rejected = true;
      throw e;
    });
    pending.catch(() => {});
    await wait(10300);
    expect(rejected).toBe(false);
    expect(down).toHaveBeenCalled();
    await new Promise<void>((r) => server.listen(port, '127.0.0.1', r));
    const connection = await pending;
    const listeners = client.listenerCount('message');
    const recovered = new Promise<void>((r) => connection.on('connect', () => r()));
    for (const s of sockets) s.destroy();
    await recovered;
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toHaveProperty('reconnectPeriod', 10000);
    expect(client.listenerCount('message')).toBe(listeners);
    client.emit('disconnect', {});
    expect(client.listenerCount('message')).toBe(listeners);
    expect(up).toHaveBeenCalled();
  } finally {
    spy.mockRestore();
    if (client) client.end(true);
    for (const s of sockets) s.destroy();
    if (server.listening) await new Promise<void>((r) => server.close(() => r()));
  }
}, 45000);
