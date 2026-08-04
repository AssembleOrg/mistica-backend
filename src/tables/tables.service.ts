import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { envConfig } from '../config/env.config';
import {
  DayOccupancy,
  DayOccupancyDocument,
} from '../common/schemas/day-occupancy.schema';
import {
  ExperienceSession,
  ExperienceSessionDocument,
} from '../common/schemas/experience-session.schema';
import {
  Reservation,
  ReservationDocument,
} from '../common/schemas/reservation.schema';
import { Table, TableDocument } from '../common/schemas/table.schema';
import {
  FreeTables,
  PlanResult,
  TableRef,
  maxPartySize,
  planTables,
  seatsForSelection,
} from './table-allocation';
import {
  ShiftDef,
  businessBounds,
  businessDateKey,
  bookingStartWindow,
  checkBookingWindow,
  listShifts,
  suggestedShiftFor,
  toMinutes,
} from './shifts';
import { RecurringBlocksService } from './recurring-blocks.service';

/** Error de clave duplicada de MongoDB. */
const DUP_KEY = 11000;

/** Reintentos ante carrera al crear el doc del día o al perder la asignación. */
const MAX_ATTEMPTS = 3;

export interface AssignRequest {
  reservationId: Types.ObjectId | string;
  qty: number;
  /** Inicio real de la actividad. */
  startAt: Date;
  durationMinutes: number;
  /** El cliente ya aceptó compartir mesa grande. */
  sharedAccepted?: boolean;
}

export interface Assignment {
  dateKey: string;
  tables: TableRef[];
  shared: boolean;
  sharedWithReservationId?: string;
}

/**
 * Intervalo de ocupación de una actividad: lo que ve el cliente
 * (startAt–endAt) más la limpieza (hasta busyUntil). La mesa recién puede
 * recibir al próximo grupo en `busyUntil`.
 */
export interface OccupancyInterval {
  dateKey: string;
  startAt: Date;
  endAt: Date;
  busyUntil: Date;
}

/** Datos de la reserva que necesita la agenda (no toda la reserva). */
interface ReservationBrief {
  id: string;
  code: string;
  customerName: string;
  customerPhone?: string;
  quantity: number;
  experienceName: string;
  status: string;
  dietaryTags: string[];
  dietaryNotes?: string;
}

/** Una reserva en la agenda del día, con todas sus mesas juntas. */
export interface AgendaReservation {
  reservationId: string;
  code?: string;
  customerName: string;
  customerPhone?: string;
  experienceName: string;
  status?: string;
  qty: number;
  startAt?: Date;
  endAt?: Date;
  /** Fin real de la ocupación de la mesa (endAt + limpieza). */
  busyUntil?: Date;
  shared: boolean;
  tables: string[];
  /** Restricciones alimentarias del grupo, para verlas en la agenda del día. */
  dietaryTags: string[];
  dietaryNotes?: string;
}

/** Mesa activa del catálogo, tal como la usa la asignación. */
export interface TableInfo {
  code: string;
  kind: 'SMALL' | 'LARGE';
  seats: number;
  order: number;
}

/** Vista de una mesa para la agenda del admin: timeline de ocupaciones. */
export interface TableStatus {
  code: string;
  kind: 'SMALL' | 'LARGE';
  seats: number;
  occupied: boolean;
  /** Ocupaciones del día en orden cronológico (reservas y bloqueos). */
  holders: Array<{
    reservationId?: string;
    qty: number;
    startAt?: Date;
    endAt?: Date;
    busyUntil?: Date;
    shared: boolean;
    label?: string;
    /** true = viene de un bloqueo fijo semanal (se edita en su panel). */
    recurring?: boolean;
  }>;
}

/**
 * Agenda de mesas de un día completo. Sin turnos: es una línea de tiempo entre
 * la apertura y el cierre, con cada mesa y sus ocupaciones.
 */
export interface DayAgenda {
  date: string;
  /** Ventana de reservas del día en hora local ('HH:mm'). */
  open: string;
  close: string;
  openAt: Date;
  closeAt: Date;
  /** Minutos de limpieza que se agregan al final de cada reserva. */
  cleaningMinutes: number;
  /** Turnos sugeridos del día (referencia visual, no restringen). */
  suggestedShifts: ShiftDef[];
  tables: TableStatus[];
  reservations: AgendaReservation[];
  blocks: Array<{
    table: string;
    label: string;
    startAt?: Date;
    endAt?: Date;
    /** true = bloqueo fijo semanal; se edita en su panel, no acá. */
    recurring?: boolean;
    /** id de la regla fija (para editarla desde la agenda). */
    recurringId?: string;
  }>;
}

/** Slot crudo del documento del día (con los campos legacy opcionales). */
interface RawSlot {
  table: string;
  reservationId?: Types.ObjectId;
  qty: number;
  startAt?: Date;
  endAt?: Date;
  busyUntil?: Date;
  shared: boolean;
  label?: string;
  shift?: string;
  /** Slot VIRTUAL inyectado por un bloqueo fijo semanal (no vive en la base). */
  recurring?: boolean;
  recurringId?: string;
}

@Injectable()
export class TablesService {
  private readonly logger = new Logger(TablesService.name);

  constructor(
    @InjectModel(Table.name)
    private readonly tableModel: Model<TableDocument>,
    @InjectModel(DayOccupancy.name)
    private readonly dayModel: Model<DayOccupancyDocument>,
    @InjectModel(Reservation.name)
    private readonly reservationModel: Model<ReservationDocument>,
    @InjectModel(ExperienceSession.name)
    private readonly sessionModel: Model<ExperienceSessionDocument>,
    private readonly recurring: RecurringBlocksService,
  ) {}

  // ───────────────────────── Mesas (catálogo) ─────────────────────────

  /** Mesas activas, en orden de asignación. */
  async listTables(): Promise<TableInfo[]> {
    const rows = await this.tableModel
      .find({ active: true, deletedAt: { $exists: false } })
      .select('code kind seats order')
      .sort({ order: 1, code: 1 })
      .lean();
    return rows.map((t) => ({
      code: t.code,
      kind: t.kind,
      seats: t.seats,
      order: t.order,
    }));
  }

  /** Turnos sugeridos configurados (para el front y el bot). */
  listShifts(): ShiftDef[] {
    return listShifts();
  }

  // ───────────────────────── Intervalos ─────────────────────────

  /**
   * Intervalo de ocupación de una actividad, validando la ventana del negocio
   * (empieza después de abrir, termina antes de cerrar). Única restricción
   * dura de horarios: los turnos son sólo una sugerencia.
   */
  intervalFor(startAt: Date, durationMinutes: number): OccupancyInterval {
    const checked = checkBookingWindow(startAt, durationMinutes);
    if (!checked.ok) {
      const w = bookingStartWindow(durationMinutes);
      if (checked.reason === 'TOO_LONG' || !w) {
        throw new BadRequestException(
          `Una experiencia de ${durationMinutes} minutos no entra en el horario del salón (${envConfig.businessOpen}–${envConfig.businessClose}).`,
        );
      }
      throw new BadRequestException(
        checked.reason === 'BEFORE_OPEN'
          ? `Ese horario es antes de la apertura. Podés reservar entre las ${w.earliest} y las ${w.latest}.`
          : `Esa reserva terminaría después del cierre (${envConfig.businessClose}). El último inicio posible es a las ${w.latest}.`,
      );
    }
    const endAt = new Date(startAt.getTime() + durationMinutes * 60_000);
    const busyUntil = new Date(
      endAt.getTime() + envConfig.cleaningBufferMinutes * 60_000,
    );
    return { dateKey: checked.dateKey, startAt, endAt, busyUntil };
  }

  /**
   * Ocupación VIRTUAL de los bloqueos fijos semanales de una fecha: un slot
   * por (regla, mesa), sin escribir nada en la base. Bajan la disponibilidad
   * igual que un bloqueo manual; los bloqueos no suman limpieza.
   */
  private virtualSlots(dateKey: string): RawSlot[] {
    const out: RawSlot[] = [];
    for (const rule of this.recurring.forDate(dateKey)) {
      const startAt = this.atTime(dateKey, rule.start);
      const endAt = this.atTime(dateKey, rule.end);
      for (const table of rule.tableCodes) {
        out.push({
          table,
          qty: 0,
          startAt,
          endAt,
          busyUntil: endAt,
          shared: false,
          label: rule.label,
          recurring: true,
          recurringId: rule.id,
        });
      }
    }
    return out;
  }

  /**
   * La guarda atómica de Mongo sólo ve los slots REALES del día: los bloqueos
   * fijos hay que chequearlos aparte antes de escribir. (assign no lo
   * necesita: planifica sobre freeTablesFor, que ya los excluye; esto cubre
   * las escrituras con mesas elegidas a mano.)
   */
  private assertNoRecurringClash(
    interval: OccupancyInterval,
    codes: string[],
  ): void {
    const clash = this.virtualSlots(interval.dateKey).find(
      (s) => codes.includes(s.table) && this.overlaps(s, interval),
    );
    if (clash) {
      throw new ConflictException(
        `La mesa ${clash.table} está reservada para "${clash.label}" en ese horario (bloqueo fijo).`,
      );
    }
  }

  /** ¿El slot pisa el intervalo? Los slots legacy sin horas bloquean todo. */
  private overlaps(slot: RawSlot, interval: OccupancyInterval): boolean {
    const sStart = slot.startAt?.getTime();
    const sBusy = (slot.busyUntil ?? slot.endAt)?.getTime();
    if (sStart == null || sBusy == null) return true;
    return (
      sStart < interval.busyUntil.getTime() &&
      sBusy > interval.startAt.getTime()
    );
  }

  // ───────────────────────── Disponibilidad ─────────────────────────

  /**
   * Mesas libres durante un intervalo, en el formato que espera el
   * planificador. Una mesa grande con UNA sola reserva chica pisando el
   * intervalo no cuenta como libre pero sí como compartible.
   */
  async freeTablesFor(interval: OccupancyInterval): Promise<FreeTables> {
    const [tables, day] = await Promise.all([
      this.listTables(),
      this.dayModel.findOne({ date: interval.dateKey }).lean(),
    ]);
    const slots = [
      ...((day?.slots ?? []) as RawSlot[]),
      ...this.virtualSlots(interval.dateKey),
    ].filter((s) => this.overlaps(s, interval));
    return this.buildFreeTables(tables, slots);
  }

  private buildFreeTables(
    tables: Array<{ code: string; kind: 'SMALL' | 'LARGE' }>,
    slots: RawSlot[],
  ): FreeTables {
    const byTable = new Map<string, RawSlot[]>();
    for (const s of slots) {
      const list = byTable.get(s.table) ?? [];
      list.push(s);
      byTable.set(s.table, list);
    }

    const freeTables: FreeTables = { small: [], large: [], shareableLarge: [] };
    for (const t of tables) {
      const holders = byTable.get(t.code) ?? [];
      if (!holders.length) {
        if (t.kind === 'SMALL') freeTables.small.push(t.code);
        else freeTables.large.push(t.code);
        continue;
      }
      // Una grande con un solo ocupante (que sea una reserva, no un bloqueo
      // manual) puede compartirse. El planificador decide si califica.
      if (
        t.kind === 'LARGE' &&
        holders.length === 1 &&
        holders[0].reservationId
      ) {
        freeTables.shareableLarge.push({
          code: t.code,
          holderQty: holders[0].qty,
          holderReservationId: String(holders[0].reservationId),
        });
      }
    }
    return freeTables;
  }

  /** Capacidad física del salón con todas las mesas activas. */
  async venueMaxParty(): Promise<number> {
    const tables = await this.listTables();
    return maxPartySize({
      small: tables.filter((t) => t.kind === 'SMALL').map((t) => t.code),
      large: tables.filter((t) => t.kind === 'LARGE').map((t) => t.code),
      shareableLarge: [],
    });
  }

  /**
   * ¿Cuántas personas entran todavía en un horario? Es el grupo más grande que
   * admite lo que queda libre, no la suma de asientos sueltos: si quedan 3
   * mesas de 2 el tope real de UNA reserva es 6.
   */
  async remainingPartySize(
    startAt: Date,
    durationMinutes: number,
  ): Promise<number> {
    return maxPartySize(
      await this.freeTablesFor(this.intervalFor(startAt, durationMinutes)),
    );
  }

  /**
   * Agenda completa de un día: cada mesa con su timeline de ocupaciones y las
   * reservas que las ocupan (una entrada por reserva, con todas sus mesas).
   * Es lo que dibuja la agenda del admin.
   */
  async dayAgenda(dateKey: string): Promise<DayAgenda> {
    const [tables, day] = await Promise.all([
      this.listTables(),
      this.dayModel.findOne({ date: dateKey }).lean(),
    ]);
    const slots = [
      ...((day?.slots ?? []) as RawSlot[]),
      ...this.virtualSlots(dateKey),
    ];
    const byReservation = await this.reservationsOf(slots);
    const bounds = businessBounds(dateKey);

    const byTable = new Map<string, RawSlot[]>();
    for (const s of slots) {
      const list = byTable.get(s.table) ?? [];
      list.push(s);
      byTable.set(s.table, list);
    }

    return {
      date: dateKey,
      open: envConfig.businessOpen,
      close: envConfig.businessClose,
      openAt: bounds.open,
      closeAt: bounds.close,
      cleaningMinutes: envConfig.cleaningBufferMinutes,
      suggestedShifts: listShifts(dateKey),
      tables: tables.map((t) => {
        const holders = (byTable.get(t.code) ?? []).sort(
          (a, b) => (a.startAt?.getTime() ?? 0) - (b.startAt?.getTime() ?? 0),
        );
        return {
          code: t.code,
          kind: t.kind,
          seats: t.seats,
          occupied: holders.length > 0,
          holders: holders.map((h) => ({
            reservationId: h.reservationId
              ? String(h.reservationId)
              : undefined,
            qty: h.qty,
            startAt: h.startAt,
            endAt: h.endAt,
            busyUntil: h.busyUntil,
            shared: h.shared,
            label: h.label,
            recurring: h.recurring,
          })),
        };
      }),
      reservations: this.groupByReservation(slots, byReservation),
      blocks: slots
        .filter((s) => !s.reservationId)
        .map((s) => ({
          table: s.table,
          label: s.label ?? 'Bloqueada',
          startAt: s.startAt,
          endAt: s.endAt,
          recurring: s.recurring,
          recurringId: s.recurringId,
        })),
    };
  }

  /** Datos de las reservas que aparecen en los slots del día. */
  private async reservationsOf(
    slots: Array<{ reservationId?: Types.ObjectId }>,
  ): Promise<Map<string, ReservationBrief>> {
    const ids = [
      ...new Set(
        slots
          .filter((s) => s.reservationId)
          .map((s) => String(s.reservationId)),
      ),
    ];
    if (!ids.length) return new Map();
    const rows = await this.reservationModel
      .find({ _id: { $in: ids.map((id) => new Types.ObjectId(id)) } })
      .select(
        'code customerName customerPhone quantity experienceName status dietaryTags dietaryNotes',
      )
      .lean();
    return new Map(
      rows.map((r) => {
        const id = (r._id as Types.ObjectId).toHexString();
        return [
          id,
          {
            id,
            code: r.code,
            customerName: r.customerName,
            customerPhone: r.customerPhone,
            quantity: r.quantity,
            experienceName: r.experienceName,
            status: r.status,
            dietaryTags: r.dietaryTags ?? [],
            dietaryNotes: r.dietaryNotes,
          },
        ];
      }),
    );
  }

  /** Un renglón por reserva, con todas las mesas que ocupa ese día. */
  private groupByReservation(
    slots: RawSlot[],
    briefs: Map<string, ReservationBrief>,
  ): AgendaReservation[] {
    const grouped = new Map<string, AgendaReservation>();
    for (const s of slots) {
      if (!s.reservationId) continue;
      const key = String(s.reservationId);
      const current = grouped.get(key);
      if (current) {
        current.tables.push(s.table);
        continue;
      }
      const brief = briefs.get(key);
      grouped.set(key, {
        reservationId: key,
        code: brief?.code,
        customerName: brief?.customerName ?? '(reserva eliminada)',
        customerPhone: brief?.customerPhone,
        experienceName: brief?.experienceName ?? '',
        status: brief?.status,
        qty: s.qty,
        startAt: s.startAt,
        endAt: s.endAt,
        busyUntil: s.busyUntil,
        shared: s.shared,
        tables: [s.table],
        dietaryTags: brief?.dietaryTags ?? [],
        dietaryNotes: brief?.dietaryNotes,
      });
    }
    return [...grouped.values()].sort((a, b) => {
      const at = a.startAt?.getTime() ?? 0;
      const bt = b.startAt?.getTime() ?? 0;
      return at - bt || a.customerName.localeCompare(b.customerName);
    });
  }

  // ───────────────────────── Asignación ─────────────────────────

  /**
   * Simula la asignación sin escribir: sirve para que el bot sepa de antemano
   * si un grupo entra, y para preguntar por la mesa compartida antes de crear
   * la reserva. `suggestedShiftKey` etiqueta el turno sugerido en el que cae
   * el horario, si cae en alguno (informativo).
   */
  async previewAssignment(params: {
    qty: number;
    startAt: Date;
    durationMinutes: number;
    sharedAccepted?: boolean;
  }): Promise<
    | {
        fits: true;
        suggestedShiftKey?: string;
        plan: Extract<PlanResult, { ok: true }>;
      }
    | { fits: false; reason: string; offer?: { tables: TableRef[] } }
  > {
    const interval = this.intervalFor(params.startAt, params.durationMinutes);
    const free = await this.freeTablesFor(interval);
    const plan = planTables(params.qty, free, {
      smallGroupCanTakeLarge: envConfig.smallGroupCanTakeLarge,
      sharedAccepted: params.sharedAccepted,
    });
    if (plan.ok) {
      const suggested = suggestedShiftFor(
        params.startAt,
        params.durationMinutes,
      );
      return { fits: true, suggestedShiftKey: suggested?.shift.key, plan };
    }
    return {
      fits: false,
      reason: plan.reason,
      offer: plan.offer ? { tables: plan.offer.tables } : undefined,
    };
  }

  /**
   * Asigna mesas a una reserva. Escribe los N slots en el documento del día con
   * un solo update guardado: o entran todas o no entra ninguna.
   *
   * Lanza ConflictException si el grupo no entra; el llamador tiene que
   * compensar (devolver cupo, cancelar la reserva).
   */
  async assign(req: AssignRequest): Promise<Assignment> {
    const interval = this.intervalFor(req.startAt, req.durationMinutes);
    const reservationId = new Types.ObjectId(String(req.reservationId));

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const free = await this.freeTablesFor(interval);
      const plan = planTables(req.qty, free, {
        smallGroupCanTakeLarge: envConfig.smallGroupCanTakeLarge,
        sharedAccepted: req.sharedAccepted,
      });

      if (!plan.ok)
        throw this.planError(plan, req.qty, await this.venueMaxParty());

      const codes = plan.tables.map((t) => t.code);
      const slots = plan.tables.map((t) => ({
        table: t.code,
        reservationId,
        qty: req.qty,
        startAt: interval.startAt,
        endAt: interval.endAt,
        busyUntil: interval.busyUntil,
        shared: plan.shared,
      }));

      const won = await this.pushSlots({
        interval,
        codes,
        slots,
        shared: plan.shared ? plan.sharedWithReservationId : undefined,
      });

      if (won) {
        return {
          dateKey: interval.dateKey,
          tables: plan.tables,
          shared: plan.shared,
          sharedWithReservationId: plan.sharedWithReservationId,
        };
      }
      // Perdimos la carrera: alguien tomó una de las mesas del plan entre el
      // cálculo y la escritura. Se replanifica con el estado nuevo.
      this.logger.warn(
        `Reasignando mesas de ${String(reservationId)} (intento ${attempt + 1}): carrera en ${interval.dateKey}`,
      );
    }

    throw new ConflictException(
      'No pudimos apartar las mesas para ese horario. Probá de nuevo.',
    );
  }

  /**
   * Escritura atómica de los slots. Devuelve false si la guarda no matcheó
   * (alguna mesa se ocupó mientras tanto).
   *
   * La condición de choque entre dos ocupaciones de la misma mesa es el
   * solapamiento de intervalos: `existente.startAt < nueva.busyUntil` Y
   * `existente.busyUntil > nueva.startAt`. Los slots legacy sin `busyUntil`
   * no los matchea la guarda de intervalos, por eso ANTES de operar hay que
   * correr la migración que les calcula las horas (scripts/migrate-*).
   */
  private async pushSlots(params: {
    interval: OccupancyInterval;
    codes: string[];
    slots: Record<string, unknown>[];
    /** Reserva con la que se comparte la mesa grande, si aplica. */
    shared?: string;
  }): Promise<boolean> {
    const { interval, codes, slots, shared } = params;

    const clash = {
      table: { $in: codes },
      startAt: { $lt: interval.busyUntil },
      busyUntil: { $gt: interval.startAt },
    };

    // Caso normal: ninguna de las mesas puede tener un slot que pise el
    // intervalo. Caso compartido: la mesa grande DEBE seguir teniendo
    // exactamente al ocupante conocido (con ≤4 personas) pisando el intervalo
    // y a nadie más.
    const guard: Record<string, unknown> = shared
      ? {
          date: interval.dateKey,
          $and: [
            {
              slots: {
                $not: {
                  $elemMatch: {
                    ...clash,
                    reservationId: { $ne: new Types.ObjectId(shared) },
                  },
                },
              },
            },
            {
              slots: {
                $elemMatch: {
                  ...clash,
                  reservationId: new Types.ObjectId(shared),
                  qty: { $lte: 4 },
                },
              },
            },
          ],
        }
      : {
          date: interval.dateKey,
          slots: { $not: { $elemMatch: clash } },
        };

    try {
      // `date` sale de la igualdad de la guarda al insertar; no va en
      // $setOnInsert o Mongo lo toma como conflicto de path.
      const res = await this.dayModel.updateOne(
        guard,
        { $push: { slots: { $each: slots } } },
        // upsert sólo tiene sentido en el caso normal: si el día no existe, no
        // puede haber una mesa compartida esperando.
        { upsert: !shared },
      );
      if (res.matchedCount > 0 || res.upsertedCount > 0) {
        // Al compartir, marcamos también al ocupante original para que la
        // agenda muestre las dos reservas como compartidas.
        if (shared) await this.markShared(interval, codes);
        return true;
      }
      return false;
    } catch (err) {
      // Carrera creando el documento del día: otro request lo insertó primero.
      // El reintento del llamador lo encuentra ya creado.
      if ((err as { code?: number })?.code === DUP_KEY) return false;
      throw err;
    }
  }

  private async markShared(
    interval: OccupancyInterval,
    codes: string[],
  ): Promise<void> {
    await this.dayModel.updateOne(
      { date: interval.dateKey },
      { $set: { 'slots.$[s].shared': true } },
      {
        arrayFilters: [
          {
            's.table': { $in: codes },
            's.startAt': { $lt: interval.busyUntil },
            's.busyUntil': { $gt: interval.startAt },
          },
        ],
      },
    );
  }

  /** Traduce el fallo del planificador al error que ve el cliente. */
  private planError(
    plan: Extract<PlanResult, { ok: false }>,
    qty: number,
    venueMax: number,
  ): Error {
    if (plan.reason === 'INVALID_QTY') {
      return new BadRequestException('La cantidad de personas no es válida.');
    }
    if (plan.reason === 'NEEDS_SHARED_CONSENT') {
      return new ConflictException(
        'Para ese horario sólo queda lugar en una mesa grande compartida. Hace falta la confirmación del cliente.',
      );
    }
    if (qty > venueMax) {
      return new BadRequestException(
        `Somos hasta ${venueMax} personas por reserva. Para un grupo más grande hay que coordinarlo con el equipo.`,
      );
    }
    return new ConflictException(
      'No quedan mesas para ese grupo en ese horario. Elegí otro horario u otra fecha.',
    );
  }

  // ───────────────────────── Liberación ─────────────────────────

  /**
   * Libera las mesas de una reserva. Idempotente. Sin `dayOf` barre todos los
   * días; con `exactStartAt` suelta sólo los slots de ESE horario (lo necesita
   * la reprogramación, que puede tener mesas viejas y nuevas el mismo día).
   */
  async release(
    reservationId: Types.ObjectId | string,
    dayOf?: Date,
    exactStartAt?: Date,
  ): Promise<void> {
    const id = new Types.ObjectId(String(reservationId));
    const filter = dayOf
      ? { date: businessDateKey(dayOf) }
      : { 'slots.reservationId': id };
    const pull: Record<string, unknown> = { reservationId: id };
    if (exactStartAt) pull.startAt = exactStartAt;
    const res = await this.dayModel.updateMany(filter, {
      $pull: { slots: pull },
    });
    if (res.modifiedCount === 0) {
      this.logger.debug(
        `release sin efecto para reserva ${String(id)} (ya estaba liberada)`,
      );
    }
  }

  // ───────────────────────── Reasignación manual ─────────────────────────

  /**
   * Cambia a mano las mesas de una reserva (el admin ve el salón y decide).
   *
   * Se hace en dos pasos deliberadamente: primero SUMA las mesas nuevas con la
   * guarda atómica y recién después suelta las que dejó de usar. Así, si otra
   * reserva se metió en el medio, la reserva nunca queda sin mesas ni se le
   * cuela nadie: o se queda como estaba, o pasa a la selección nueva.
   */
  async reassign(
    reservationId: string,
    codes: string[],
  ): Promise<{ tables: string[]; seats: number }> {
    const reservation = await this.reservationModel.findById(reservationId);
    if (!reservation) throw new NotFoundException('Reserva no encontrada');

    const wanted = [...new Set(codes.map((c) => c.trim().toUpperCase()))];
    if (!wanted.length) {
      throw new BadRequestException('Elegí al menos una mesa.');
    }

    const catalog = new Map((await this.listTables()).map((t) => [t.code, t]));
    const refs: TableRef[] = wanted.map((code) => {
      const t = catalog.get(code);
      if (!t)
        throw new BadRequestException(
          `La mesa ${code} no existe o está dada de baja.`,
        );
      return { code, kind: t.kind };
    });

    const seats = seatsForSelection(refs);
    if (seats < reservation.quantity) {
      throw new BadRequestException(
        `Esas mesas dan ${seats} lugares y la reserva es de ${reservation.quantity} personas.`,
      );
    }

    const interval = await this.intervalOfReservation(reservation);
    const id = new Types.ObjectId(String(reservation._id));

    const day = await this.dayModel
      .findOne({ date: interval.dateKey })
      .lean();
    const mine = ((day?.slots ?? []) as RawSlot[])
      .filter((s) => String(s.reservationId) === String(id))
      .map((s) => s.table);

    const toAdd = wanted.filter((c) => !mine.includes(c));
    const toRemove = mine.filter((c) => !wanted.includes(c));

    if (toAdd.length) {
      this.assertNoRecurringClash(interval, toAdd);
      const ok = await this.pushSlots({
        interval,
        codes: toAdd,
        slots: toAdd.map((table) => ({
          table,
          reservationId: id,
          qty: reservation.quantity,
          startAt: interval.startAt,
          endAt: interval.endAt,
          busyUntil: interval.busyUntil,
          shared: false,
        })),
      });
      if (!ok) {
        throw new ConflictException(
          'Alguna de esas mesas ya está ocupada en ese horario. Recargá la agenda y probá de nuevo.',
        );
      }
    }

    if (toRemove.length) {
      await this.dayModel.updateOne(
        { date: interval.dateKey },
        {
          $pull: {
            slots: {
              reservationId: id,
              table: { $in: toRemove },
            },
          },
        },
      );
    }

    reservation.tableCodes = wanted;
    reservation.sharedTable = false;
    reservation.updatedAt = new Date();
    await reservation.save();

    return { tables: wanted, seats };
  }

  /**
   * Intervalo real de una reserva: su inicio + la duración del turno al que
   * pertenece. Si la sesión no aparece, cae a los horarios que ya tienen sus
   * slots en el día (reserva vieja con sesión borrada).
   */
  private async intervalOfReservation(
    reservation: ReservationDocument,
  ): Promise<OccupancyInterval> {
    const session = reservation.sessionId
      ? await this.sessionModel
          .findById(reservation.sessionId)
          .select('durationMinutes')
          .lean()
      : null;
    if (session?.durationMinutes) {
      return this.intervalFor(reservation.startAt, session.durationMinutes);
    }

    const dateKey = businessDateKey(reservation.startAt);
    const day = await this.dayModel.findOne({ date: dateKey }).lean();
    const slot = ((day?.slots ?? []) as RawSlot[]).find(
      (s) =>
        String(s.reservationId) === String(reservation._id) &&
        s.startAt &&
        s.endAt,
    );
    if (slot?.startAt && slot.endAt) {
      const busyUntil =
        slot.busyUntil ??
        new Date(
          slot.endAt.getTime() + envConfig.cleaningBufferMinutes * 60_000,
        );
      return { dateKey, startAt: slot.startAt, endAt: slot.endAt, busyUntil };
    }
    throw new BadRequestException(
      'No se pudo determinar el horario de la reserva. Reprogramala para ubicarla.',
    );
  }

  // ───────────────── Bloqueos manuales (taller, evento, mesa rota) ─────────

  /**
   * Bloquea una mesa sin reserva asociada, en un rango horario del día. Sin
   * `start`/`end` bloquea la ventana completa del negocio. Los bloqueos no
   * suman limpieza: terminan cuando terminan.
   */
  async blockTable(params: {
    dateKey: string;
    code: string;
    label: string;
    /** Hora local 'HH:mm'. Default: apertura. */
    start?: string;
    /** Hora local 'HH:mm'. Default: cierre. */
    end?: string;
  }): Promise<void> {
    const { dateKey, code, label } = params;
    const bounds = businessBounds(dateKey);
    const startAt = params.start
      ? this.atTime(dateKey, params.start)
      : bounds.open;
    const endAt = params.end ? this.atTime(dateKey, params.end) : bounds.close;
    if (endAt <= startAt) {
      throw new BadRequestException(
        'El bloqueo termina antes de empezar. Revisá las horas.',
      );
    }

    const interval: OccupancyInterval = {
      dateKey,
      startAt,
      endAt,
      busyUntil: endAt,
    };
    this.assertNoRecurringClash(interval, [code]);
    const ok = await this.pushSlots({
      interval,
      codes: [code],
      slots: [
        {
          table: code,
          qty: 0,
          startAt,
          endAt,
          busyUntil: endAt,
          shared: false,
          label,
        },
      ],
    });
    if (!ok) {
      throw new ConflictException(
        `La mesa ${code} ya está ocupada en ese horario.`,
      );
    }
  }

  /**
   * Quita bloqueos manuales de una mesa (no toca las mesas de reservas). Sin
   * `start` quita todos los bloqueos del día de esa mesa.
   */
  async unblockTable(params: {
    dateKey: string;
    code: string;
    /** Hora local 'HH:mm' del inicio del bloqueo a quitar. */
    start?: string;
  }): Promise<void> {
    const pull: Record<string, unknown> = {
      table: params.code,
      reservationId: { $exists: false },
    };
    if (params.start) pull.startAt = this.atTime(params.dateKey, params.start);
    await this.dayModel.updateOne(
      { date: params.dateKey },
      { $pull: { slots: pull } },
    );
  }

  // ───────────────────────── Helpers ─────────────────────────

  /** Instante absoluto de una hora local 'HH:mm' en una fecha de negocio. */
  private atTime(dateKey: string, hhmm: string): Date {
    toMinutes(hhmm); // valida formato
    const bounds = businessBounds(dateKey);
    const openMin = toMinutes(envConfig.businessOpen);
    const min = toMinutes(hhmm);
    return new Date(bounds.open.getTime() + (min - openMin) * 60_000);
  }
}
