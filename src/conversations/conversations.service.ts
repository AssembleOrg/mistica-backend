import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Subject, Observable } from 'rxjs';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  ACTIVE_CONVERSATION_STATUSES,
  Conversation,
  ConversationDocument,
  ConversationStatus,
} from '../common/schemas/conversation.schema';
import {
  ConversationMessage,
  ConversationMessageDocument,
  MessageAuthor,
} from '../common/schemas/conversation-message.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { SpacesService } from '../common/services/spaces.service';
import { BotHandoffService } from './bot-handoff.service';
import { envConfig } from '../config/env.config';

/** Error de clave duplicada de MongoDB. */
const DUP_KEY = 11000;

/** Cuántos mensajes del bot se guardan como contexto al abrir la charla. */
const CONTEXT_MESSAGES = 12;

/** Sin actividad por más de esto, una charla del bot se da por cerrada. */
const SESSION_TTL_MS =
  Math.max(1, envConfig.botControl.conversationSessionMinutes) * 60_000;

/** Evento que se empuja al panel por SSE. */
export interface ConversationEvent {
  type: 'opened' | 'message' | 'closed';
  conversationId: string;
  phone: string;
  /** Sólo en 'message'. */
  message?: {
    author: MessageAuthor;
    authorName?: string;
    body: string;
    createdAt: Date;
    mediaKind?: 'image' | 'document';
    mediaMime?: string;
    mediaName?: string;
    /** URL firmada de corta vida para ver/descargar el adjunto. */
    mediaUrl?: string;
  };
  /** Estado actual de la charla, para refrescar la bandeja sin pedirla. */
  conversation?: Record<string, unknown>;
}

/**
 * Charlas con una persona real.
 *
 * Cuando el cliente pide hablar con alguien del equipo, el bot deja de
 * responder ese chat y todo pasa por acá: los mensajes se persisten (para
 * tener constancia) y se empujan al panel en vivo. El equipo responde desde el
 * panel y, cuando da por terminada la charla, el bot vuelve a atender.
 *
 * El aviso al panel es por SSE, no por polling: son eventos servidor→panel y
 * el panel manda sus mensajes por POST normal. Alcanza y sobra para esto, y
 * evita sumar socket.io (que además necesitaría sticky sessions si algún día
 * corre más de una instancia).
 */
@Injectable()
export class ConversationsService {
  private readonly logger = new Logger(ConversationsService.name);
  private readonly events = new Subject<ConversationEvent>();

  constructor(
    @InjectModel(Conversation.name)
    private readonly conversationModel: Model<ConversationDocument>,
    @InjectModel(ConversationMessage.name)
    private readonly messageModel: Model<ConversationMessageDocument>,
    private readonly notifications: NotificationsService,
    private readonly botHandoff: BotHandoffService,
    private readonly spaces: SpacesService,
  ) {}

  /** Stream de eventos para el panel (SSE). */
  stream(): Observable<ConversationEvent> {
    return this.events.asObservable();
  }

  // ───────────────────── Entrada del bot ─────────────────────

  /**
   * Registra un turno de la charla con el bot (cliente + respuesta del bot).
   * Toda consulta por WhatsApp queda persistida acá, turno a turno, sin pausar
   * al bot. Reusa la charla viva del teléfono; si venció la sesión (o no hay),
   * abre una nueva. NO suma "no leídos": la bandeja sólo marca lo que necesita
   * atención humana (handoff), no cada charla que el bot resolvió solo.
   */
  async logTurn(params: {
    phone: string;
    customerName?: string;
    userText: string;
    botText?: string;
    intent?: string;
    tags?: string[];
  }): Promise<{ conversationId: string; status: ConversationStatus } | null> {
    const phone = this.normalizePhone(params.phone);
    if (!phone) throw new BadRequestException('Teléfono inválido');
    const userText = (params.userText ?? '').trim();
    if (!userText && !params.botText?.trim()) return null;

    const { conversation, opened } = await this.resolveActive(phone, {
      customerName: params.customerName,
      intent: params.intent,
      tags: params.tags,
    });

    // Si la charla está en manos de una persona, el bot no debería estar
    // respondiendo: no duplicamos su texto. El mensaje del cliente ya entra
    // por appendInbound. Salimos sin tocar nada.
    if (conversation.status === 'HUMAN' || conversation.status === 'WAITING') {
      return {
        conversationId: String(conversation._id),
        status: conversation.status,
      };
    }

    // (nombre/tema ya los enriqueció resolveActive)
    const docs: Array<Partial<ConversationMessage>> = [];
    if (userText)
      docs.push({
        conversationId: conversation._id as Types.ObjectId,
        author: 'CLIENT',
        body: userText,
      });
    const botText = (params.botText ?? '').trim();
    if (botText)
      docs.push({
        conversationId: conversation._id as Types.ObjectId,
        author: 'BOT',
        body: botText,
      });
    if (docs.length) await this.messageModel.insertMany(docs);

    // El preview es lo último dicho (respuesta del bot, o el cliente si no hubo).
    conversation.lastMessageAt = new Date();
    conversation.lastMessagePreview = (botText || userText).slice(0, 140);
    await conversation.save();

    this.emit({
      type: opened ? 'opened' : 'message',
      conversationId: String(conversation._id),
      phone,
      message: docs.length
        ? {
            author: docs[docs.length - 1].author as MessageAuthor,
            body: docs[docs.length - 1].body as string,
            createdAt: new Date(),
          }
        : undefined,
      conversation: this.view(conversation),
    });
    return {
      conversationId: String(conversation._id),
      status: conversation.status,
    };
  }

  /**
   * Adjunto (imagen o documento) que mandó el cliente. Lo sube el bot para que
   * quede EN la charla. Va a Spaces privado (nunca público); el panel lo ve con
   * URL firmada de corta vida. Se registra como mensaje del cliente, aunque la
   * charla la esté atendiendo una persona (ahí además cuenta como no leído).
   */
  async attachMedia(params: {
    phone: string;
    customerName?: string;
    kind: 'image' | 'document';
    mime: string;
    name?: string;
    caption?: string;
    dataBase64: string;
    intent?: string;
    tags?: string[];
  }): Promise<{ stored: boolean; messageId?: string }> {
    const phone = this.normalizePhone(params.phone);
    if (!phone) throw new BadRequestException('Teléfono inválido');

    const { conversation, opened } = await this.resolveActive(phone, {
      customerName: params.customerName,
      intent: params.intent,
      tags: params.tags,
    });
    const inHumanHands =
      conversation.status === 'HUMAN' || conversation.status === 'WAITING';

    // Subida a Spaces (privada). Best-effort: si falla o no hay bucket, igual
    // dejamos constancia del adjunto (sin archivo) para que el equipo sepa que
    // llegó algo.
    let mediaKey = '';
    if (this.spaces.enabled) {
      try {
        const buf = Buffer.from(params.dataBase64, 'base64');
        const ext = this.extForMime(params.mime, params.name);
        const rand = Math.random().toString(36).slice(2, 10);
        mediaKey = await this.spaces.uploadPrivate(
          `conversations/${String(conversation._id)}/${Date.now()}-${rand}${ext}`,
          buf,
          params.mime || 'application/octet-stream',
        );
      } catch (err) {
        this.logger.warn(
          `No se pudo subir el adjunto a Spaces: ${String(err)}`,
        );
        mediaKey = '';
      }
    }

    const caption = (params.caption ?? '').trim();
    const msg = await this.messageModel.create({
      conversationId: conversation._id as Types.ObjectId,
      author: 'CLIENT',
      body: caption,
      mediaKey: mediaKey || undefined,
      mediaKind: params.kind,
      mediaMime: params.mime,
      mediaName: params.name,
    });

    const label =
      params.kind === 'image' ? '📷 Foto' : `📎 ${params.name || 'Archivo'}`;
    const preview = caption ? `${label} · ${caption}` : label;
    await this.touch(
      conversation,
      preview,
      inHumanHands ? conversation.unreadForAdmin + 1 : 0,
    );

    const mediaUrl = mediaKey ? await this.signedFor(mediaKey) : undefined;
    this.emit({
      type: opened ? 'opened' : 'message',
      conversationId: String(conversation._id),
      phone,
      message: {
        author: 'CLIENT',
        body: caption,
        createdAt: msg.createdAt,
        mediaKind: params.kind,
        mediaMime: params.mime,
        mediaName: params.name,
        mediaUrl,
      },
      conversation: this.view(conversation),
    });
    return { stored: true, messageId: String(msg._id) };
  }

  /**
   * El cliente pidió hablar con una persona. Abre la charla (o devuelve la que
   * ya estaba abierta), vuelca el contexto reciente con el bot y avisa al
   * panel. A partir de acá el bot no responde ese chat.
   */
  async requestHandoff(params: {
    phone: string;
    customerName?: string;
    reason?: string;
    /** Tramo reciente de la charla con el bot: [{author, body}]. */
    history?: Array<{ author: MessageAuthor; body: string }>;
  }): Promise<ConversationDocument> {
    const phone = this.normalizePhone(params.phone);
    if (!phone) throw new BadRequestException('Teléfono inválido');

    const active = await this.activeFor(phone);
    if (active && active.status !== 'BOT') {
      // Ya estaba en manos del equipo (WAITING/HUMAN): no abrimos otra.
      this.logger.log(
        `Handoff repetido para ***${phone.slice(-4)}: reuso la charla`,
      );
      return active;
    }

    // Si venía charlando con el bot, promovemos ESA misma charla a WAITING: el
    // hilo ya está persistido turno a turno, no hace falta volcar contexto.
    if (active && active.status === 'BOT') {
      active.status = 'WAITING';
      active.reason = params.reason ?? active.reason;
      active.requestedAt = new Date();
      if (params.customerName && !active.customerName) {
        active.customerName = params.customerName;
      }
      await this.touch(
        active,
        params.reason ?? 'Pidió hablar con una persona',
        active.unreadForAdmin + 1,
      );
      this.emit({
        type: 'opened',
        conversationId: String(active._id),
        phone,
        conversation: this.view(active),
      });
      return active;
    }

    let conversation: ConversationDocument;
    try {
      conversation = await this.conversationModel.create({
        phone,
        customerName: params.customerName,
        reason: params.reason,
        status: 'WAITING',
        requestedAt: new Date(),
        lastMessageAt: new Date(),
      });
    } catch (err) {
      // Carrera: dos mensajes seguidos pidiendo lo mismo.
      if ((err as { code?: number })?.code === DUP_KEY) {
        const winner = await this.activeFor(phone);
        if (winner) return winner;
      }
      throw err;
    }

    // Contexto: lo último que venía hablando con el bot, para que quien
    // atienda no arranque a ciegas.
    const history = (params.history ?? []).slice(-CONTEXT_MESSAGES);
    if (history.length) {
      await this.messageModel.insertMany(
        history.map((m) => ({
          conversationId: conversation._id as Types.ObjectId,
          author: m.author,
          body: m.body,
        })),
      );
    }

    await this.touch(
      conversation,
      params.reason ?? 'Pidió hablar con una persona',
      1,
    );
    this.emit({
      type: 'opened',
      conversationId: String(conversation._id),
      phone,
      conversation: this.view(conversation),
    });
    return conversation;
  }

  /**
   * Mensaje del cliente mientras la charla la atiende una persona. El bot lo
   * reenvía en vez de contestarlo.
   */
  async appendInbound(
    phone: string,
    body: string,
  ): Promise<{ stored: boolean }> {
    const conversation = await this.openFor(this.normalizePhone(phone));
    if (!conversation) return { stored: false };

    await this.messageModel.create({
      conversationId: conversation._id as Types.ObjectId,
      author: 'CLIENT',
      body,
    });
    await this.touch(conversation, body, conversation.unreadForAdmin + 1);

    this.emit({
      type: 'message',
      conversationId: String(conversation._id),
      phone: conversation.phone,
      message: { author: 'CLIENT', body, createdAt: new Date() },
      conversation: this.view(conversation),
    });
    return { stored: true };
  }

  /** ¿El bot tiene que callarse en este chat? Lo consulta antes de responder. */
  async isPaused(phone: string): Promise<boolean> {
    return !!(await this.openFor(this.normalizePhone(phone)));
  }

  // ───────────────────── Panel ─────────────────────

  /**
   * Bandeja de consultas. Sin filtro trae TODAS (bot y handoff) por actividad
   * reciente, con lo que necesita atención (no leído) arriba. `status` acepta
   * uno o varios separados por coma (ej. "WAITING,HUMAN" para "pendientes").
   */
  async list(status?: string, limit = 40, page = 1) {
    const filter: Record<string, unknown> = {};
    const wanted = (status ?? '')
      .split(',')
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    if (wanted.length === 1) filter.status = wanted[0];
    else if (wanted.length > 1) filter.status = { $in: wanted };
    const take = Math.min(Math.max(limit, 1), 200);
    const skip = (Math.max(page, 1) - 1) * take;
    const rows = await this.conversationModel
      .find(filter)
      .sort({ unreadForAdmin: -1, lastMessageAt: -1 })
      .skip(skip)
      .limit(take)
      .lean();
    return rows.map((r) => this.view(r as unknown as ConversationDocument));
  }

  /** Cuántas charlas hay por estado (para los chips de la bandeja). */
  async counts(): Promise<Record<string, number>> {
    const rows = await this.conversationModel.aggregate<{
      _id: string;
      n: number;
    }>([{ $group: { _id: '$status', n: { $sum: 1 } } }]);
    const out: Record<string, number> = {
      BOT: 0,
      WAITING: 0,
      HUMAN: 0,
      CLOSED: 0,
    };
    for (const r of rows) out[r._id] = r.n;
    return out;
  }

  async messages(id: string) {
    const conversation = await this.findOrThrow(id);
    const rows = await this.messageModel
      .find({ conversationId: conversation._id as Types.ObjectId })
      .sort({ createdAt: 1 })
      .lean();
    const messages = await Promise.all(
      rows.map(async (m) => ({
        id: (m._id as Types.ObjectId).toHexString(),
        author: m.author,
        authorName: m.authorName,
        body: m.body,
        delivered: m.delivered,
        createdAt: m.createdAt,
        mediaKind: m.mediaKind,
        mediaMime: m.mediaMime,
        mediaName: m.mediaName,
        // URL firmada de corta vida: el panel la usa recién al abrir la charla.
        mediaUrl: m.mediaKey ? await this.signedFor(m.mediaKey) : undefined,
      })),
    );
    return { conversation: this.view(conversation), messages };
  }

  /** Alguien del equipo toma la charla: pasa a HUMAN y se marca leída. */
  async take(id: string, user: { id?: string; name?: string }) {
    const conversation = await this.findOrThrow(id);
    if (conversation.status === 'CLOSED') {
      throw new ConflictException('Esa charla ya está cerrada.');
    }
    // Si la venía atendiendo el bot, hay que callarlo YA: sin este empujón el
    // bot seguiría respondiendo hasta que venza su caché de "pausado".
    const wasBot = conversation.status === 'BOT';
    conversation.status = 'HUMAN';
    conversation.takenAt = conversation.takenAt ?? new Date();
    conversation.takenByName = user.name ?? conversation.takenByName;
    if (user.id) conversation.takenById = new Types.ObjectId(user.id);
    conversation.unreadForAdmin = 0;
    await conversation.save();
    if (wasBot) await this.botHandoff.setPaused(conversation.phone, true);

    this.emit({
      type: 'message',
      conversationId: String(conversation._id),
      phone: conversation.phone,
      conversation: this.view(conversation),
    });
    return this.view(conversation);
  }

  /**
   * Respuesta del equipo: se persiste SIEMPRE y después se intenta enviar por
   * WhatsApp. Si el envío falla queda marcado como no entregado, para que nadie
   * crea que el cliente lo recibió.
   */
  async replyAsAdmin(
    id: string,
    body: string,
    user: { id?: string; name?: string },
  ) {
    const conversation = await this.findOrThrow(id);
    if (conversation.status === 'CLOSED') {
      throw new ConflictException(
        'Esa charla está cerrada. Reabrila o esperá a que el cliente escriba.',
      );
    }
    const text = body.trim();
    if (!text) throw new BadRequestException('El mensaje está vacío.');

    // Primer mensaje del equipo: la charla queda tomada. Si la atendía el bot,
    // además hay que pausarlo ya (no esperar a que venza su caché) para que no
    // respondan los dos encima.
    const wasBot = conversation.status === 'BOT';
    if (conversation.status === 'WAITING' || wasBot) {
      conversation.status = 'HUMAN';
      conversation.takenAt = new Date();
      conversation.takenByName = user.name;
      if (user.id) conversation.takenById = new Types.ObjectId(user.id);
    }
    if (wasBot) await this.botHandoff.setPaused(conversation.phone, true);

    const delivered = await this.notifications.notify(conversation.phone, text);
    const msg = await this.messageModel.create({
      conversationId: conversation._id as Types.ObjectId,
      author: 'ADMIN',
      authorName: user.name,
      authorUserId: user.id ? new Types.ObjectId(user.id) : undefined,
      body: text,
      delivered,
    });

    conversation.unreadForAdmin = 0;
    await this.touch(conversation, text, 0);

    this.emit({
      type: 'message',
      conversationId: String(conversation._id),
      phone: conversation.phone,
      message: {
        author: 'ADMIN',
        authorName: user.name,
        body: text,
        createdAt: msg.createdAt,
      },
      conversation: this.view(conversation),
    });

    if (!delivered) {
      this.logger.warn(
        `No se pudo entregar el mensaje del equipo a ***${conversation.phone.slice(-4)}`,
      );
    }
    return { id: String(msg._id), delivered };
  }

  /**
   * El equipo da por terminada la charla y el bot vuelve a atender ese chat.
   * Se le avisa al bot en el momento para que no tenga que preguntar.
   */
  async close(id: string, user: { id?: string; name?: string }) {
    const conversation = await this.findOrThrow(id);
    if (conversation.status !== 'CLOSED') {
      conversation.status = 'CLOSED';
      conversation.closedAt = new Date();
      if (user.id) conversation.closedById = new Types.ObjectId(user.id);
      conversation.unreadForAdmin = 0;
      await conversation.save();
    }

    // Aviso directo al bot: sin esto tendría que descubrirlo consultando.
    await this.botHandoff.setPaused(conversation.phone, false);

    this.emit({
      type: 'closed',
      conversationId: String(conversation._id),
      phone: conversation.phone,
      conversation: this.view(conversation),
    });
    return this.view(conversation);
  }

  // ───────────────────── Mantenimiento ─────────────────────

  /**
   * Cierra las charlas del bot que quedaron sin actividad más allá del TTL de
   * sesión. Así la próxima consulta del mismo teléfono abre una charla nueva
   * (una consulta = una sesión) y no se queda un "BOT" vivo para siempre
   * bloqueando el índice único. Sólo toca BOT: las WAITING/HUMAN son del equipo.
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  async closeStaleBotConversations(): Promise<void> {
    const cutoff = new Date(Date.now() - SESSION_TTL_MS);
    const res = await this.conversationModel.updateMany(
      { status: 'BOT', lastMessageAt: { $lt: cutoff } },
      { $set: { status: 'CLOSED', closedAt: new Date(), unreadForAdmin: 0 } },
    );
    const n = (res as { modifiedCount?: number }).modifiedCount ?? 0;
    if (n) this.logger.log(`Cerradas ${n} charla(s) del bot por inactividad`);
  }

  // ───────────────────── Helpers ─────────────────────

  /**
   * Devuelve la charla viva del teléfono para colgarle un mensaje del cliente
   * (texto o adjunto), abriéndola si no hay o si la del bot venció. NO promueve
   * ni cambia el estado de las que están en manos del equipo.
   */
  private async resolveActive(
    phone: string,
    meta: { customerName?: string; intent?: string; tags?: string[] },
  ): Promise<{ conversation: ConversationDocument; opened: boolean }> {
    let conversation = await this.activeFor(phone);

    // Charla del bot vencida: se cierra y arranca una nueva (una consulta = una
    // sesión). Las WAITING/HUMAN no se tocan: son del equipo.
    if (
      conversation &&
      conversation.status === 'BOT' &&
      this.isStale(conversation)
    ) {
      await this.markClosed(conversation);
      conversation = null;
    }

    if (conversation) {
      // Enriquecer datos que el bot va descubriendo, sin pisar lo cargado.
      const patch: Record<string, unknown> = {};
      if (meta.customerName && !conversation.customerName) {
        conversation.customerName = meta.customerName;
        patch.customerName = meta.customerName;
      }
      if (meta.intent && conversation.intent !== meta.intent) {
        conversation.intent = meta.intent;
        patch.intent = meta.intent;
      }
      if (meta.tags?.length) {
        const merged = Array.from(
          new Set([...(conversation.tags ?? []), ...meta.tags]),
        );
        conversation.tags = merged;
        patch.tags = merged;
      }
      if (Object.keys(patch).length) await conversation.save();
      return { conversation, opened: false };
    }

    try {
      conversation = await this.conversationModel.create({
        phone,
        customerName: meta.customerName,
        status: 'BOT',
        intent: meta.intent,
        tags: meta.tags?.length ? meta.tags : undefined,
        requestedAt: new Date(),
        lastMessageAt: new Date(),
      });
      return { conversation, opened: true };
    } catch (err) {
      // Carrera: dos mensajes casi simultáneos del mismo teléfono.
      if ((err as { code?: number })?.code === DUP_KEY) {
        const winner = await this.activeFor(phone);
        if (winner) return { conversation: winner, opened: false };
      }
      throw err;
    }
  }

  /** URL firmada de corta vida para un adjunto privado (best-effort). */
  private async signedFor(key: string): Promise<string | undefined> {
    if (!key || !this.spaces.enabled) return undefined;
    try {
      return await this.spaces.signedUrl(key);
    } catch (err) {
      this.logger.warn(`No pude firmar la URL del adjunto: ${String(err)}`);
      return undefined;
    }
  }

  /** Extensión de archivo a partir del mime o del nombre original. */
  private extForMime(mime: string, name?: string): string {
    const fromName = name && name.includes('.') ? name.split('.').pop() : '';
    if (fromName) return `.${fromName.toLowerCase().slice(0, 8)}`;
    const m = (mime || '').toLowerCase();
    if (m.includes('png')) return '.png';
    if (m.includes('webp')) return '.webp';
    if (m.includes('jpeg') || m.includes('jpg')) return '.jpg';
    if (m.includes('pdf')) return '.pdf';
    if (m.includes('gif')) return '.gif';
    return '';
  }

  /** ¿La charla venció por inactividad (sesión del bot terminada)? */
  private isStale(conversation: ConversationDocument): boolean {
    const last = conversation.lastMessageAt?.getTime() ?? 0;
    return Date.now() - last > SESSION_TTL_MS;
  }

  /** Marca una charla como cerrada (sin avisar al bot: nunca estuvo pausado). */
  private async markClosed(conversation: ConversationDocument): Promise<void> {
    conversation.status = 'CLOSED';
    conversation.closedAt = new Date();
    conversation.unreadForAdmin = 0;
    await conversation.save();
  }

  /** La charla viva del teléfono (bot o en handoff), si hay. */
  private async activeFor(phone: string): Promise<ConversationDocument | null> {
    if (!phone) return null;
    return this.conversationModel
      .findOne({ phone, status: { $in: ACTIVE_CONVERSATION_STATUSES } })
      .sort({ lastMessageAt: -1 })
      .exec();
  }

  private async openFor(phone: string): Promise<ConversationDocument | null> {
    if (!phone) return null;
    return this.conversationModel
      .findOne({ phone, status: { $in: ['WAITING', 'HUMAN'] } })
      .exec();
  }

  private async touch(
    conversation: ConversationDocument,
    preview: string,
    unread: number,
  ): Promise<void> {
    conversation.lastMessageAt = new Date();
    conversation.lastMessagePreview = preview.slice(0, 140);
    conversation.unreadForAdmin = unread;
    await conversation.save();
  }

  private emit(event: ConversationEvent): void {
    this.events.next(event);
  }

  private async findOrThrow(id: string): Promise<ConversationDocument> {
    if (!Types.ObjectId.isValid(id))
      throw new BadRequestException('id inválido');
    const c = await this.conversationModel.findById(id).exec();
    if (!c) throw new NotFoundException('Charla no encontrada');
    return c;
  }

  /** Sólo dígitos: el bot y el panel escriben el teléfono de formas distintas. */
  private normalizePhone(raw: string): string {
    return String(raw ?? '').replace(/\D/g, '');
  }

  private view(c: ConversationDocument) {
    return {
      id: String(c._id),
      phone: c.phone,
      customerName: c.customerName,
      status: c.status,
      intent: c.intent,
      tags: c.tags ?? [],
      reason: c.reason,
      requestedAt: c.requestedAt,
      takenByName: c.takenByName,
      takenAt: c.takenAt,
      closedAt: c.closedAt,
      lastMessageAt: c.lastMessageAt,
      lastMessagePreview: c.lastMessagePreview,
      unreadForAdmin: c.unreadForAdmin,
    };
  }
}
