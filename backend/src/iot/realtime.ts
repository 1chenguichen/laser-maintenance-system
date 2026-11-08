import type { Server } from 'socket.io';
import type { MarketGuard } from '../market/market.module.js';
import type { IoTService } from './service.js';
export function setupIoTRealtime(
  io: Server,
  guard: MarketGuard,
  service: IoTService,
) {
  const ns = io.of('/iot');
  ns.on('connection', (socket) => {
    let timer: ReturnType<typeof setTimeout> | undefined,
      closed = false,
      watch: any = null,
      running = false;
    const cancel = () => {
      closed = true;
      clearTimeout(timer);
    };
    socket.on('disconnect', cancel);
    async function tick() {
      if (closed || running || !watch) return;
      running = true;
      try {
        const req: any = {
          headers: { authorization: 'Bearer ' + socket.handshake.auth?.token },
        };
        await guard.canActivate({
          switchToHttp: () => ({ getRequest: () => req }),
        } as any);
        const scope = await service.access.scope(
          req.marketActor,
          watch.workspace,
        );
        const current = watch;
        const list = await service.list(scope, current.query);
        const overview = await service.overview(scope, current.query);
        socket.emit('snapshot', {
          ...list,
          overview,
          watchId: current.watchId,
          serverTime: new Date().toISOString(),
        });
      } catch (e: any) {
        socket.emit('iot-error', {
          message: e.message,
          status: typeof e.getStatus === 'function' ? e.getStatus() : 500,
        });
        socket.disconnect(true);
        cancel();
      } finally {
        running = false;
        if (!closed) timer = setTimeout(tick, 5000);
      }
    }
    socket.on('watch', (data: any) => {
      clearTimeout(timer);
      watch = {
        query: data?.query || {},
        watchId: data?.watchId,
        workspace:
          typeof data?.workspace === 'string' ? data.workspace : undefined,
      };
      void tick();
    });
  });
}
