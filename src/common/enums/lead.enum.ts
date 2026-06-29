// Consulta/lead capturada por el bot o la web para servicios que NO se reservan
// online (cumpleaños, eventos, talleres mensuales, escuelita, facilitadores,
// tienda). El equipo las sigue y contacta.

// Estado de seguimiento de la consulta.
export enum LeadStatus {
  NEW = 'NEW', // recién entrada, sin contactar
  CONTACTED = 'CONTACTED', // el equipo ya respondió
  CLOSED = 'CLOSED', // resuelta (reservó / no avanzó)
}

// De dónde entró la consulta.
export enum LeadSource {
  WHATSAPP = 'WHATSAPP',
  WEB = 'WEB',
  ADMIN = 'ADMIN',
}
