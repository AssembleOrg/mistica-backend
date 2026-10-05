/**
 * Token corto para abrir los streams SSE directo contra el backend.
 *
 * El panel vive en otro dominio (Netlify) y la cookie `access_token` queda en
 * ese dominio: un `EventSource` directo a Railway no la lleva. Para no pasar el
 * stream por el proxy del frontend (cómputo de funciones), el panel pide por el
 * proxy normal un token de un minuto y medio y lo manda en `?token=`.
 *
 * El token NO sirve como sesión: lleva `typ: 'sse'` y audiencia propia; la
 * estrategia `jwt` (cookie) lo rechaza y la estrategia `sse-token` sólo lo lee
 * de la query en los endpoints marcados con `@AllowSseToken()`.
 */
export const SSE_TOKEN_STRATEGY = 'sse-token';
export const SSE_TOKEN_TYPE = 'sse';
export const SSE_TOKEN_AUDIENCE = 'mistica-sse';
export const SSE_TOKEN_TTL_SECONDS = 90;
export const SSE_TOKEN_QUERY_PARAM = 'token';

export interface SseTokenPayload {
  sub: string;
  typ: typeof SSE_TOKEN_TYPE;
}

/** ¿El payload ya verificado es de un token de stream? */
export function isSseTokenPayload(payload: unknown): boolean {
  if (!payload || typeof payload !== 'object') return false;
  const p = payload as { typ?: unknown; aud?: unknown };
  const aud = Array.isArray(p.aud) ? p.aud : [p.aud];
  return p.typ === SSE_TOKEN_TYPE || aud.includes(SSE_TOKEN_AUDIENCE);
}
