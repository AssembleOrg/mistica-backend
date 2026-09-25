import type { BotBusiness, BotTexts, BotTransfer } from '../common/schemas';

// Valores iniciales = lo que el bot tiene hoy en código (presets.py /
// constants.py / env). Se siembran en la primera lectura; desde ahí manda la
// base y el panel.

export const BUSINESS_DEFAULT: BotBusiness = {
  name: 'Mística Auténtica',
  address: 'Videla 57, Quilmes, Buenos Aires',
  maps: 'https://www.google.com/maps/search/?api=1&query=Videla+57+Quilmes',
  hours: 'Martes a Domingo de 10:00 a 20:00 hs',
  instagram: 'https://instagram.com/mistica.autentica',
  facebook: 'https://www.facebook.com/mistica.autentica',
};

export const TRANSFER_DEFAULT: BotTransfer = {
  alias: 'mistica.arte',
  ownerName: 'Agostina Tisera',
  ownerCuit: '20386949604',
  bank: 'Naranja X',
};

export const TEXTS_DEFAULT: BotTexts = {
  greeting:
    '¡Hola! 😊 Soy *Ariadna, del equipo de {negocio}*.\n\n' +
    'Te puedo contar sobre nuestras experiencias de cerámica y arte, pasarte ' +
    'precios y fechas, y ayudarte a *reservar tu lugar* — se abona una seña ' +
    'online y el resto se completa en el local.\n\n' +
    'Contame, ¿qué te gustaría?\n' +
    '• Conocer las experiencias 🏺\n' +
    '• Ver fechas y horarios 🗓️\n' +
    '• Reservar tu lugar ✨',
  farewell:
    '¡Gracias por escribir! 💛 Cualquier cosa, acá estoy. Te esperamos en {negocio}.',
  error:
    'Uy, se me complicó procesar tu mensaje 😅. ¿Me lo reenviás, por favor? ' +
    'Si sigue sin andar, escribinos directo por {redes} o pasá por el local ' +
    '({lugar}) y te ayudamos 💛',
  audioFail:
    'No pude escuchar bien el audio 🙉. ¿Me lo escribís o mandás otro?',
  rateLimit:
    'Me mandaste muchos mensajes seguidos 😅. Dame un minuto y seguimos, ¿sí?',
  safeFallback:
    'Perdón, no logré resolver eso bien. ¿Me lo contás de nuevo con un poco ' +
    'más de detalle? Si preferís, te paso con alguien del equipo 💛',
  jailbreakRefusal:
    'Eso no lo puedo hacer 🙂 Pero con gusto te ayudo con nuestras ' +
    'experiencias, precios, fechas o tu reserva. ¿Qué te gustaría?',
  transferNotReceipt:
    'No pude leer la imagen como un comprobante de transferencia 😅. ' +
    '¿Me mandás una captura más clara del comprobante? Si te lo dieron en PDF, ' +
    'mandame una captura de pantalla del PDF 🙏',
  transferReview:
    '¡Recibimos tu comprobante! 🙌 No pude validarlo automáticamente, así que ' +
    'lo pasé al equipo para que lo revise. Apenas lo confirmen te avisamos por ' +
    'acá 💛 Tu lugar queda en revisión mientras tanto.',
  transferOrphan:
    '¡Gracias! Recibimos tu comprobante 🙌 No tengo una reserva pendiente ' +
    'asociada a este número, así que se lo paso al equipo para que lo revise ' +
    'y te confirme por acá 💛 Si es por una reserva nueva, también puedo ' +
    'ayudarte a armarla ahora mismo ✨',
  transferExpired:
    'Uy, el tiempo para enviar el comprobante venció y el lugar se liberó 😔, ' +
    'así que la reserva NO quedó confirmada para esa fecha y horario.\n\n' +
    'Si ya hiciste la transferencia, quedate tranquila/o que no se pierde: ' +
    'avisame por acá y se lo paso al equipo para que lo resuelva por este ' +
    'mismo chat (o podés acercarte al local) — la reasignación queda sujeta a ' +
    'disponibilidad. Si no llegaste a transferir, armamos la reserva de nuevo ' +
    'en un minuto 💛',
  botOff:
    '¡Hola! Gracias por escribirnos 💛 En un ratito te responde alguien del equipo por acá.',
};

/** Políticas que hoy viven escritas en el prompt. Pasan a ser editables. */
export const FAQ_SEED: { title: string; examples: string[]; answer: string }[] =
  [
    {
      title: 'Gift cards',
      examples: [
        '¿Hacen gift cards?',
        'Quiero regalar una experiencia',
        'Vale regalo',
      ],
      answer:
        'Sí, hacemos gift cards. Se abona el TOTAL de la experiencia al comprarla y ' +
        'hay 2 meses para canjearla; el día y horario del canje se coordinan con el ' +
        'equipo cuando la persona quiera usarla. Para comprar una, se toma la consulta ' +
        '(servicio "Gift card", con la experiencia elegida en la nota) y el equipo la gestiona.',
    },
    {
      title: 'Cantidad de personas en reservas grupales (cumpleaños / eventos)',
      examples: [
        '¿Y si al final somos menos?',
        '¿Puedo cambiar la cantidad?',
        'Se me cayó una amiga',
      ],
      answer:
        'Se reserva por la cantidad deseada y hay tiempo hasta 48 hs antes del evento ' +
        'para confirmar la cantidad final. Reservamos el espacio y esos lugares no se ' +
        'venden: si alguien no viene, se pierde la seña de esos lugares y se abona el ' +
        'saldo por los que vinieron.',
    },
    {
      title: 'Comida y bebida de afuera',
      examples: [
        '¿Puedo llevar torta?',
        '¿Se puede traer comida?',
        '¿Llevo bebidas?',
      ],
      answer:
        'No se puede traer comida de afuera; sólo cosas en empaque cerrado (snacks, ' +
        'gaseosas). Las tortas se resuelven con el local (ver los valores en la ' +
        'descripción del Cumpleaños).',
    },
  ];
