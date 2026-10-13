import { logInfo } from '@utils/logger';
import mqtt from 'mqtt';
import { ConnectionNotification } from '../HomeAssistant/ConnectionNotification';
import { IMQTTConnection } from './IMQTTConnection';
import MQTTConfig from './MQTTConfig';
import { MQTTConnection } from './MQTTConnection';

export const connectToMQTT = (proxyHosts: string[] = []): Promise<IMQTTConnection> => {
  logInfo('[MQTT] Connecting...');
  const client = mqtt.connect({ ...MQTTConfig, reconnectPeriod: 10_000 });
  const notification = new ConnectionNotification(
    'MQTT',
    String(MQTTConfig.host || 'localhost') + ':' + String(MQTTConfig.port || 1883),
    proxyHosts.join(', ')
  );
  const connection = new MQTTConnection(client, notification);
  return new Promise((resolve) => client.once('connect', () => resolve(connection)));
};
