// A real TCP/protobuf test peer, NOT a real ESPHome device or hardware test.
// Modern peer intentionally does not process removed authentication IDs 3/4.
const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const { Connection } = require('@2colors/esphome-native-api');
const { pb } = require('@2colors/esphome-native-api/lib/utils/messages');

function varint(n) {
  const bytes = [];
  do { const b = n & 127; n = Math.floor(n / 128); bytes.push(b | (n ? 128 : 0)); } while (n);
  return Buffer.from(bytes);
}
function readVarint(buf, start) {
  let value = 0, factor = 1;
  for (let i = start; i < buf.length; i++) {
    value += (buf[i] & 127) * factor;
    if (!(buf[i] & 128)) return { value, end: i + 1 };
    factor *= 128;
  }
  return null;
}
function packet(message) {
  const payload = Buffer.from(message.serializeBinary());
  return Buffer.concat([Buffer.from([0]), varint(payload.length), varint(Number(message.constructor.id)), payload]);
}
async function connectToPeer(apiMinor, verify) {
  const sockets = new Set(), received = [];
  const server = net.createServer(socket => {
    sockets.add(socket); socket.on('close', () => sockets.delete(socket));
    let pending = Buffer.alloc(0);
    socket.on('data', data => {
      pending = Buffer.concat([pending, data]);
      for (;;) {
        if (pending.length < 3) return;
        assert.equal(pending[0], 0);
        const length = readVarint(pending, 1); if (!length) return;
        const type = readVarint(pending, length.end); if (!type) return;
        if (pending.length < type.end + length.value) return;
        pending = pending.subarray(type.end + length.value); received.push(type.value);
        if (type.value === 1) {
          const hello = new pb.HelloResponse(); hello.setApiVersionMajor(1); hello.setApiVersionMinor(apiMinor);
          hello.setServerInfo('protocol-test-peer'); hello.setName('test-proxy'); socket.write(packet(hello));
        } else if (type.value === 3 && apiMinor < 12) {
          // Wire ID 4 is unchanged; newer bindings rename ConnectResponse to AuthenticationResponse.
          socket.write(Buffer.from([0, 0, 4]));
        } else if (type.value === 9) {
          const info = new pb.DeviceInfoResponse(); info.setName('test-proxy'); info.setBluetoothProxyFeatureFlags(5);
          socket.write(packet(info));
        } else if (type.value === 7) socket.write(packet(new pb.PingResponse()));
        else if (type.value === 5) socket.write(packet(new pb.DisconnectResponse()));
      }
    });
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const connection = new Connection({ host: '127.0.0.1', port: server.address().port, reconnect: false, pingInterval: 60000 });
  // Keep error handling installed throughout shutdown, not only during authorization.
  connection.on('error', () => {});
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('test authorization deadline exceeded')), 6500);
      connection.once('authorized', () => { clearTimeout(timer); resolve(); });
      connection.once('error', error => { clearTimeout(timer); reject(error); });
      connection.connect();
    });
    const info = await connection.deviceInfoService();
    assert.equal(info.name, 'test-proxy');
    assert.equal(info.bluetoothProxyFeatureFlags, 5);
    await verify({ connection, received });
  } finally {
    connection.reconnect = false;
    connection.frameHelper.destroy();
    for (const socket of sockets) socket.destroy();
    // The client's async error path can install its timer after emitting error.
    await new Promise(resolve => setImmediate(resolve));
    clearInterval(connection.pingTimer); clearTimeout(connection.reconnectTimer);
    await new Promise(resolve => server.close(resolve));
  }
}

test('modern passwordless proxy authorizes without obsolete ConnectRequest', async () => {
  await connectToPeer(12, async ({ received }) => {
    assert.equal(received.includes(3), false, 'must not send removed authentication request');
    assert.equal(received.includes(9), true, 'device info read must succeed after handshake');
  });
});
test('older passwordless proxy still receives required legacy ConnectRequest', async () => {
  await connectToPeer(11, async ({ received }) => assert.equal(received.includes(3), true));
});
test('client recognizes BluetoothScannerStateResponse message ID 126', () => {
  const { id_to_type } = require('@2colors/esphome-native-api/lib/utils/messages');
  assert.equal(id_to_type[126], 'BluetoothScannerStateResponse');
});
