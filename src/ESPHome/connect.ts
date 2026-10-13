import { ConnectionNotification } from '../HomeAssistant/ConnectionNotification';
import { Connection } from '@2colors/esphome-native-api';
import { logError, logInfo } from '@utils/logger';
const managed = new WeakMap<Connection, Promise<Connection>>();

// Keep the native client (and BLE device references) for its entire lifetime.
export const connect = (connection: Connection): Promise<Connection> => {
  const existing = managed.get(connection);
  if (existing) return existing;
  connection.reconnect = true;
  connection.reconnectInterval = 10_000;
  const notification = new ConnectionNotification('ESPHome', connection.host + ':' + connection.port, connection.host);
  const pending = new Promise<Connection>((resolve) => {
    connection.on('disconnected', () => notification.down());
    connection.on('reconnect', () => notification.down());
    connection.on('error', (error) => {
      notification.down();
      logError(`[ESPHome] ${connection.host}:${connection.port} failed; retrying every 10 seconds`, error);
    });
    connection.on('authorized', () => {
      void (async () => {
        try {
          const info = await connection.deviceInfoService();
          if (!info.bluetoothProxyFeatureFlags) throw new Error('No Bluetooth proxy features detected');
          if (!connection.authorized) return;
          notification.up();
          logInfo('[ESPHome] Connected:', connection.host);
          // Restore active discovery subscriptions without registering new listeners.
          if ((connection as any).listenerCount('message.BluetoothLEAdvertisementResponse'))
            connection.subscribeBluetoothAdvertisementService();
          (connection as any).emit('smartbed.ready');
          resolve(connection);
        } catch (error) {
          notification.down();
          logError(`[ESPHome] ${connection.host}:${connection.port} initialization failed; retrying`, error);
          (connection as any).frameHelper.destroy();
        }
      })();
    });
    // Covers a TCP peer which never completes its handshake. The native client
    // owns the sole reconnect timer, including after refused startup connections.
    const socket = (connection as any).frameHelper.socket;
    socket.setTimeout(30_000);
    socket.on('timeout', () => socket.destroy(new Error('ESPHome connection timed out')));
    try {
      connection.connect();
    } catch (error) {
      logError('[ESPHome] Connect failed; retrying', error);
      (connection as any).frameHelper.destroy();
    }
  });
  managed.set(connection, pending);
  return pending;
};
