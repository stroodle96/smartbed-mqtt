import { logError, logInfo } from '@utils/logger';
import EventEmitter from 'events';
import { ConnectionNotification } from '../HomeAssistant/ConnectionNotification';
import { MqttClient } from 'mqtt';
import { IMQTTConnection } from './IMQTTConnection';

export class MQTTConnection extends EventEmitter implements IMQTTConnection {
  private subscribedTopics: string[] = [];

  constructor(private client: MqttClient, notification?: ConnectionNotification) {
    super();

    client.on('connect', () => {
      logInfo('[MQTT] Connected');
      notification?.up();
      this.emit('connect');
    });

    client.on('reconnect', () => {
      logInfo('[MQTT] Reconnecting...');
    });

    client.on('close', () => notification?.down());
    client.on('offline', () => notification?.down());
    client.on('disconnect', () => notification?.down());
    client.on('error', (error) => {
      notification?.down();
      logError('[MQTT] Error', error);
    });

    client.on('message', (topic, message) => {
      this.emit(topic, message.toString());
    });
    this.setMaxListeners(0);
  }

  publish(topic: string, message: any) {
    if (message instanceof Object) {
      message = JSON.stringify(message);
    }
    this.client.publish(topic, message, { qos: 1 });
  }

  subscribe(topic: string) {
    if (!this.subscribedTopics.includes(topic)) {
      this.client.subscribe(topic);
      this.subscribedTopics.push(topic);
    }
  }

  unsubscribe(topic: string) {
    const index = this.subscribedTopics.indexOf(topic);
    if (index !== -1) {
      this.client.unsubscribe(topic);
      this.subscribedTopics.splice(index, 1);
    }
  }
}
