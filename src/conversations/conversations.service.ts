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
import {
  Conversation,
  ConversationDocument,
} from '../common/schemas/conversation.schema';
import {
  ConversationMessage,
  ConversationMessageDocument,
  MessageAuthor,
} from '../common/schemas/conversation-message.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { BotHandoffService } from './bot-handoff.service';

/** Error de clave duplicada de MongoDB. */
const DUP_KEY = 11000;

/** Cuántos mensajes del bot se guardan como contexto al abrir la charla. */
const CONTEXT_MESSAGES = 12;

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
  ) {}

  /** Stream de eventos para el panel (SSE). */
  stream(): Observable<ConversationEvent> {
    return this.events.asObservable();
  }

  // ───────────────────── Entrada del bot ─────────────────────

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

    const open = await this.openFor(phone);
    if (open) {
      // Ya estaba esperando: no abrimos otra ni duplicamos el contexto.
      this.logger.log(
        `Handoff repetido para ***${phone.slice(-4)}: reuso la charla`,
      );
      return open;
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
        const winner = await this.openFor(phone);
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

  /** Bandeja: primero las que esperan, después por actividad reciente. */
  async list(status?: string) {
    const filter: Record<string, unknown> = {};
    if (status) filter.status = status;
    const rows = await this.conversationModel
      .find(filter)
      .sort({ status: 1, lastMessageAt: -1 })
      .limit(100)
      .lean();
    return rows.map((r) => this.view(r as unknown as ConversationDocument));
  }

  async messages(id: string) {
    const conversation = await this.findOrThrow(id);
    const rows = await this.messageModel
      .find({ conversationId: conversation._id as Types.ObjectId })
      .sort({ createdAt: 1 })
      .lean();
    return {
      conversation: this.view(conversation),
      messages: rows.map((m) => ({
        id: (m._id as Types.ObjectId).toHexString(),
        author: m.author,
        authorName: m.authorName,
        body: m.body,
        delivered: m.delivered,
        createdAt: m.createdAt,
      })),
    };
  }

  /** Alguien del equipo toma la charla: pasa a HUMAN y se marca leída. */
  async take(id: string, user: { id?: string; name?: string }) {
    const conversation = await this.findOrThrow(id);
    if (conversation.status === 'CLOSED') {
      throw new ConflictException('Esa charla ya está cerrada.');
    }
    conversation.status = 'HUMAN';
    conversation.takenAt = conversation.takenAt ?? new Date();
    conversation.takenByName = user.name ?? conversation.takenByName;
    if (user.id) conversation.takenById = new Types.ObjectId(user.id);
    conversation.unreadForAdmin = 0;
    await conversation.save();

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

    // Primer mensaje del equipo: la charla queda tomada.
    if (conversation.status === 'WAITING') {
      conversation.status = 'HUMAN';
      conversation.takenAt = new Date();
      conversation.takenByName = user.name;
      if (user.id) conversation.takenById = new Types.ObjectId(user.id);
    }

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

  // ───────────────────── Helpers ─────────────────────

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
