import {
  Injectable,
  OnApplicationBootstrap,
  OnApplicationShutdown,
  Logger,
} from '@nestjs/common';
import { iotStore } from './store.js';

@Injectable()
export class IoTMaintenance
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private readonly log = new Logger(IoTMaintenance.name);
  onApplicationBootstrap() {
    void this.clean().catch((e) =>
      this.log.error('History cleanup failed: ' + e.message),
    );
    this.timer = setInterval(() => {
      void this.clean().catch((e) =>
        this.log.error('History cleanup failed: ' + e.message),
      );
    }, 3600000);
    this.timer.unref();
  }
  onApplicationShutdown() {
    clearInterval(this.timer);
  }
  async clean() {
    if (this.running) return { skipped: true };
    this.running = true;
    let c: any;
    let locked = false,
      deleted = 0;
    try {
      c = await iotStore.connect();
      locked = (await c.query('SELECT pg_try_advisory_lock(73109214) locked'))
        .rows[0].locked;
      if (!locked) return { skipped: true };
      // Bounded batches keep cleanup from monopolizing the ingest database.
      for (let n = 0; n < 10; n++) {
        const batch = await c.query(
          'DELETE FROM iot.samples WHERE id IN (SELECT s.id FROM iot.samples s JOIN iot.devices d ON d.asset_id=s.asset_id JOIN iot.subscriptions p ON p.tenant_id=d.tenant_id WHERE s.recorded_at<now()-make_interval(days=>p.retention_days) ORDER BY s.id LIMIT 5000)',
        );
        deleted += batch.rowCount || 0;
        if ((batch.rowCount || 0) < 5000) break;
      }
      // Alarm/ticket snapshots intentionally survive raw telemetry expiry.
      await c.query(
        "INSERT INTO iot.maintenance_state(name,last_success_at,deleted_rows) VALUES('sample_retention',now(),$1) ON CONFLICT(name) DO UPDATE SET last_success_at=now(),deleted_rows=EXCLUDED.deleted_rows",
        [deleted],
      );
      return { deleted };
    } finally {
      try {
        if (locked) await c.query('SELECT pg_advisory_unlock(73109214)');
      } finally {
        c?.release();
        this.running = false;
      }
    }
  }
}
