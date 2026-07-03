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
