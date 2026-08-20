// Etapas de una pieza de cerámica, del secado al retiro. El orden importa para
// avanzar de estado y para saber si ya está "lista para retirar".
export enum PieceStatus {
  SECADO = 'SECADO',
  PRIMERA_HORNEADA = 'PRIMERA_HORNEADA',
  ESMALTADO = 'ESMALTADO',
  SEGUNDA_HORNEADA = 'SEGUNDA_HORNEADA',
  LISTA = 'LISTA',
  RETIRADA = 'RETIRADA',
}

// Orden del proceso (para UI y para el aviso de "lista").
export const PIECE_STATUS_ORDER: PieceStatus[] = [
  PieceStatus.SECADO,
  PieceStatus.PRIMERA_HORNEADA,
  PieceStatus.ESMALTADO,
  PieceStatus.SEGUNDA_HORNEADA,
  PieceStatus.LISTA,
  PieceStatus.RETIRADA,
];

// Etiquetas legibles (es-AR) para mostrar y para el bot.
export const PIECE_STATUS_LABEL: Record<PieceStatus, string> = {
  [PieceStatus.SECADO]: 'En secado',
  [PieceStatus.PRIMERA_HORNEADA]: 'Primera horneada',
  [PieceStatus.ESMALTADO]: 'Esmaltado',
  [PieceStatus.SEGUNDA_HORNEADA]: 'Segunda horneada',
  [PieceStatus.LISTA]: 'Lista para retirar',
  [PieceStatus.RETIRADA]: 'Retirada',
};

/**
 * Config de un estado de pieza. Los estados son ADAPTABLES por el taller
 * (app_settings 'pieceStatuses'): se pueden renombrar, reordenar o agregar
 * (Fresco, En proceso, Horneado…). Flags:
 * · isReady: al entrar acá se avisa por WhatsApp que está lista (una vez).
 * · isFinal: cierra el ciclo (entregada/retirada).
 */
export interface PieceStatusConfig {
  key: string;
  label: string;
  isReady?: boolean;
  isFinal?: boolean;
}

// Config por defecto: el proceso actual del taller.
export const DEFAULT_PIECE_STATUS_CONFIG: PieceStatusConfig[] =
  PIECE_STATUS_ORDER.map((key) => ({
    key,
    label: PIECE_STATUS_LABEL[key],
    isReady: key === PieceStatus.LISTA,
    isFinal: key === PieceStatus.RETIRADA,
  }));
