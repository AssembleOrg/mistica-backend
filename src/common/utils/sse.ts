import { interval, map, merge, Observable } from 'rxjs';

export const SSE_HEARTBEAT_MS = 25_000;

export interface SseMessage {
  data: unknown;
  type?: string;
}

/**
 * Suma un evento `ping` cada 25 s al stream. Mantiene viva la conexión directa
 * del navegador (proxies y balanceadores cortan streams ociosos) y le permite
 * al panel detectar un stream colgado. Es un evento con nombre: `onmessage` no
 * lo ve, así que los clientes que no lo escuchan no cambian.
 */
export function withSseHeartbeat(
  source: Observable<SseMessage>,
  everyMs = SSE_HEARTBEAT_MS,
): Observable<SseMessage> {
  return merge(
    source,
    interval(everyMs).pipe(map(() => ({ type: 'ping', data: '' }))),
  );
}
