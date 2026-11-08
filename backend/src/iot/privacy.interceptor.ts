import { Injectable } from '@nestjs/common';
import type {
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { map } from 'rxjs';
// Response boundary: customer-visible service orders must not expose engineering-only metrics.
@Injectable()
export class IoTIntakePrivacy implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    const actor = context.switchToHttp().getRequest().marketActor;
    if (actor?.kind !== 'customer') return next.handle();
    const sanitize = (value: any): any => {
      if (Array.isArray(value)) return value.map(sanitize);
      if (
        !value ||
        typeof value !== 'object' ||
        value instanceof Date ||
        Buffer.isBuffer(value)
      )
        return value;
      const result: any = {};
      for (const [key, v] of Object.entries(value)) {
        if (
          value.source === 'IOT_ALARM' &&
          [
            'engineeringSnapshot',
            'snapshot',
            'metric',
            'observedValue',
            'threshold',
            'publicMetricKeys',
          ].includes(key)
        )
          continue;
        result[key] = sanitize(v);
      }
      return result;
    };
    return next.handle().pipe(map(sanitize));
  }
}
