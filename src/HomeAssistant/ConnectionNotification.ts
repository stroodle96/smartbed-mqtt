import axios from 'axios';
import { logWarn } from '@utils/logger';

// A single notification per subsystem/endpoint. Failed delivery is retried,
// but successful creates are never repeated until a new outage occurs.
export class ConnectionNotification {
  private desired?: boolean;
  private delivered?: boolean;
  private busy = false;
  private timer?: NodeJS.Timeout;
  private id: string;
  constructor(
    private kind: 'MQTT' | 'ESPHome',
    private endpoint: string,
    private proxies: string,
    private base = 'http://supervisor/core/api',
    private token = process.env.SUPERVISOR_TOKEN
  ) {
    this.id = `smartbed_${kind.toLowerCase()}_${Buffer.from(endpoint).toString('hex')}`;
    if (token) {
      this.timer = setInterval(() => void this.flush(), 10_000);
      this.timer.unref();
    }
  }
  down() {
    if (this.desired !== false) this.delivered = undefined;
    this.desired = false;
    void this.flush();
  }
  up() {
    if (this.desired !== true) this.delivered = undefined;
    this.desired = true;
    void this.flush();
  }
  close() {
    if (this.timer) clearInterval(this.timer);
  }
  private async flush(): Promise<void> {
    if (!this.token || this.busy || this.desired === undefined || this.desired === this.delivered) return;
    this.busy = true;
    const state = this.desired;
    try {
      await axios.post(
        `${this.base}/services/persistent_notification/${state ? 'dismiss' : 'create'}`,
        state
          ? { notification_id: this.id }
          : {
              notification_id: this.id,
              title: `Smartbed MQTT: ${this.kind} connection unavailable`,
              message: `${this.kind} endpoint ${this.endpoint} is unavailable. ESPHome proxy IP/host: ${
                this.proxies || 'not configured'
              }. Retrying every 10 seconds indefinitely without restarting. This notification clears on recovery.`,
            },
        { headers: { Authorization: `Bearer ${this.token}` }, timeout: 5000 }
      );
      this.delivered = state;
    } catch {
      // Never log Axios errors: they contain the Authorization header.
      logWarn(`[Notifications] Could not ${state ? 'dismiss' : 'create'} ${this.kind} notification; will retry`);
    } finally {
      this.busy = false;
    }
    if (this.desired !== state) void this.flush();
  }
}
