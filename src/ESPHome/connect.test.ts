import { ConnectionNotification } from '../HomeAssistant/ConnectionNotification';
import net from 'net';
import { Connection } from '@2colors/esphome-native-api';
import { connect } from './connect';
// Native API protobuf bindings are untyped CommonJS.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { pb } = require('@2colors/esphome-native-api/lib/utils/messages');
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
test('real ESPHome startup outage and repeated runtime drops recover on same connection', async () => {
  const down = jest.spyOn(ConnectionNotification.prototype, 'down');
  const up = jest.spyOn(ConnectionNotification.prototype, 'up');
  const holder = net.createServer();
  await new Promise<void>((r) => holder.listen(0, '127.0.0.1', r));
  const port = (holder.address() as net.AddressInfo).port;
  await new Promise<void>((r) => holder.close(() => r()));
  const sockets = new Set<net.Socket>();
  let attempts = 0;
  const server = net.createServer((s) => {
    attempts++;
    sockets.add(s);
    s.on('close', () => sockets.delete(s));
    s.on('data', (data) => {
      let offset = 0;
      while (offset + 3 <= data.length) {
        const length = data[offset + 1],
          type = data[offset + 2];
        offset += 3 + length;
        let msg: any;
        if (type === 1) {
          msg = new pb.HelloResponse();
          msg.setApiVersionMajor(1);
          msg.setApiVersionMinor(12);
        }
        if (type === 9) {
          msg = new pb.DeviceInfoResponse();
          msg.setBluetoothProxyFeatureFlags(5);
        }
        if (type === 7) msg = new pb.PingResponse();
        if (msg) {
          const bytes = Buffer.from(msg.serializeBinary());
          s.write(Buffer.concat([Buffer.from([0, bytes.length, Number(msg.constructor.id)]), bytes]));
        }
      }
    });
  });
  const connection: any = new Connection({ host: '127.0.0.1', port, reconnectInterval: 10000, pingInterval: 60000 });
  try {
    let rejected = false;
    const pending = connect(connection).catch((e) => {
      rejected = true;
      throw e;
    });
    pending.catch(() => {});
    await wait(10300);
    expect(rejected).toBe(false);
    expect(down).toHaveBeenCalled();
    await new Promise<void>((r) => server.listen(port, '127.0.0.1', r));
    expect(await pending).toBe(connection);
    const listeners = connection.listenerCount('authorized');
    for (let i = 0; i < 2; i++) {
      const recovered = new Promise<void>((r) => connection.once('authorized', () => r()));
      for (const s of sockets) s.destroy();
      await recovered;
      await wait(50);
      expect(connection.listenerCount('authorized')).toBe(listeners);
    }
    expect(attempts).toBe(3);
    expect(connection.reconnectInterval).toBe(10000);
    expect(up).toHaveBeenCalled();
    expect(up).toHaveBeenCalled();
  } finally {
    connection.disconnect();
    for (const s of sockets) s.destroy();
    if (server.listening) await new Promise<void>((r) => server.close(() => r()));
  }
}, 55000);
