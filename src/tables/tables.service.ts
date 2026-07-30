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
  businessDateKey,
  listShifts,
  resolveShift,
  shiftBounds,
  startWindow,
} from './shifts';

/** Error de clave duplicada de MongoDB. */
const DUP_KEY = 11000;

/** Reintentos ante carrera al crear el doc del día o al perder la asignación. */
const MAX_ATTEMPTS = 3;

export interface AssignRequest {
  reservationId: Types.ObjectId | string;
  qty: number;
  /** Inicio real de la actividad (define fecha de negocio y turno). */
  startAt: Date;
  durationMinutes: number;
  /** El cliente ya aceptó compartir mesa grande. */
  sharedAccepted?: boolean;
}

export interface Assignment {
  dateKey: string;
  shiftKey: string;
  tables: TableRef[];
  shared: boolean;
  sharedWithReservationId?: string;
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

/** Una reserva en la agenda de un turno, con todas sus mesas juntas. */
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
  shared: boolean;
  tables: string[];
  /** Restricciones alimentarias del grupo, para verlas en la agenda del día. */
  dietaryTags: string[];
  dietaryNotes?: string;
}

/** Un turno del día con sus mesas, sus reservas y sus bloqueos. */
export interface DayAgendaShift {
  key: string;
  name: string;
  start: string;
  end: string;
  startAt: Date;
  endAt: Date;
  tables: TableStatus[];
  remainingPartySize: number;
  reservations: AgendaReservation[];
  blocks: Array<{ table: string; label: string }>;
}

/** Mesa activa del catálogo, tal como la usa la asignación. */
export interface TableInfo {
  code: string;
  kind: 'SMALL' | 'LARGE';
  seats: number;
  order: number;
}

/** Vista de una mesa para la agenda del admin. */
export interface TableStatus {
  code: string;
  kind: 'SMALL' | 'LARGE';
  seats: number;
  occupied: boolean;
  /** Reservas que ocupan la mesa en ese turno (2 si está compartida). */
  holders: Array<{
    reservationId?: string;
    qty: number;
    startAt?: Date;
    endAt?: Date;
    shared: boolean;
    label?: string;
  }>;
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

  /** Turnos configurados (para el front y el bot). */
  listShifts(): ShiftDef[] {
    return listShifts();
  }

  // ───────────────────────── Disponibilidad ─────────────────────────

  /**
   * Mesas libres de un turno, en el formato que espera el planificador. Una
   * mesa grande con UNA sola reserva chica no cuenta como libre pero sí como
   * compartible.
   */
  async freeTablesFor(dateKey: string, shiftKey: string): Promise<FreeTables> {
    const [tables, day] = await Promise.all([
      this.listTables(),
      this.dayModel.findOne({ date: dateKey }).lean(),
    ]);
    const slots = (day?.slots ?? []).filter((s) => s.shift === shiftKey);
    return this.buildFreeTables(tables, slots);
  }

  private buildFreeTables(
    tables: Array<{ code: string; kind: 'SMALL' | 'LARGE' }>,
    slots: Array<{
      table: string;
      qty: number;
      reservationId?: Types.ObjectId;
      label?: string;
    }>,
  ): FreeTables {
    const byTable = new Map<string, typeof slots>();
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
   * ¿Cuántas personas entran todavía en un turno? Es el grupo más grande que
   * admite lo que queda libre, no la suma de asientos sueltos: si quedan 3
   * mesas de 2 el tope real de UNA reserva es 6.
   */
  async remainingPartySize(dateKey: string, shiftKey: string): Promise<number> {
    return maxPartySize(await this.freeTablesFor(dateKey, shiftKey));
  }

  /** Estado mesa por mesa de un turno, para la agenda del admin. */
  async shiftStatus(dateKey: string, shiftKey: string): Promise<TableStatus[]> {
    const [tables, day] = await Promise.all([
      this.listTables(),
      this.dayModel.findOne({ date: dateKey }).lean(),
    ]);
    const slots = (day?.slots ?? []).filter((s) => s.shift === shiftKey);
    return tables.map((t) => {
      const holders = slots.filter((s) => s.table === t.code);
      return {
        code: t.code,
        kind: t.kind,
        seats: t.seats,
        occupied: holders.length > 0,
        holders: holders.map((h) => ({
          reservationId: h.reservationId ? String(h.reservationId) : undefined,
          qty: h.qty,
          startAt: h.startAt,
          endAt: h.endAt,
          shared: h.shared,
          label: h.label,
        })),
      };
    });
  }

  /**
   * Agenda completa de un día: cada turno con el estado de sus mesas y las
   * reservas que las ocupan (una entrada por reserva, con todas sus mesas).
   * Es lo que dibuja la agenda del admin.
   */
  async dayAgenda(dateKey: string): Promise<DayAgendaShift[]> {
    const day = await this.dayModel.findOne({ date: dateKey }).lean();
    const slots = day?.slots ?? [];
    const byReservation = await this.reservationsOf(slots);

    return Promise.all(
      listShifts().map(async (shift) => {
        const shiftSlots = slots.filter((s) => s.shift === shift.key);
        const bounds = shiftBounds(dateKey, shift);
        return {
          ...shift,
          startAt: bounds.start,
          endAt: bounds.end,
          tables: await this.shiftStatus(dateKey, shift.key),
          remainingPartySize: await this.remainingPartySize(dateKey, shift.key),
          reservations: this.groupByReservation(shiftSlots, byReservation),
          blocks: shiftSlots
            .filter((s) => !s.reservationId)
            .map((s) => ({ table: s.table, label: s.label ?? 'Bloqueada' })),
        };
      }),
    );
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

  /** Un renglón por reserva, con todas las mesas que ocupa en ese turno. */
  private groupByReservation(
    slots: Array<{
      table: string;
      reservationId?: Types.ObjectId;
      qty: number;
      startAt?: Date;
      endAt?: Date;
      shared: boolean;
    }>,
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

  /**
   * Fecha de negocio y turno donde cae una actividad. Lanza BadRequest con el
   * detalle de los horarios válidos si no entra entera en ningún turno.
   */
  placementFor(
    startAt: Date,
    durationMinutes: number,
  ): { dateKey: string; shiftKey: string } {
    const placed = this.resolveOrThrow(startAt, durationMinutes);
    return { dateKey: placed.dateKey, shiftKey: placed.shift.key };
  }

  // ───────────────────────── Asignación ─────────────────────────

  /**
   * Simula la asignación sin escribir: sirve para que el bot sepa de antemano
   * si un grupo entra, y para preguntar por la mesa compartida antes de crear
   * la reserva.
   */
  async previewAssignment(params: {
    qty: number;
    startAt: Date;
    durationMinutes: number;
    sharedAccepted?: boolean;
  }): Promise<
    | { fits: true; shiftKey: string; plan: Extract<PlanResult, { ok: true }> }
    | { fits: false; reason: string; offer?: { tables: TableRef[] } }
  > {
    const placed = this.resolveOrThrow(params.startAt, params.durationMinutes);
    const free = await this.freeTablesFor(placed.dateKey, placed.shift.key);
    const plan = planTables(params.qty, free, {
      smallGroupCanTakeLarge: envConfig.smallGroupCanTakeLarge,
      sharedAccepted: params.sharedAccepted,
    });
    if (plan.ok) return { fits: true, shiftKey: placed.shift.key, plan };
    return {
      fits: false,
      reason: plan.reason,
      offer: plan.offer ? { tables: plan.offer.tables } : undefined,
    };
  }

  /**
   * Asigna mesas a una reserva. Escribe los N slots en el documento del día con
   * un solo `findOneAndUpdate` guardado: o entran todas o no entra ninguna.
   *
   * Lanza ConflictException si el grupo no entra; el llamador tiene que
   * compensar (devolver cupo, cancelar la reserva).
   */
  async assign(req: AssignRequest): Promise<Assignment> {
    const placed = this.resolveOrThrow(req.startAt, req.durationMinutes);
    const { dateKey, shift } = placed;
    const endAt = new Date(
      req.startAt.getTime() + req.durationMinutes * 60_000,
    );
    const reservationId = new Types.ObjectId(String(req.reservationId));

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const free = await this.freeTablesFor(dateKey, shift.key);
      const plan = planTables(req.qty, free, {
        smallGroupCanTakeLarge: envConfig.smallGroupCanTakeLarge,
        sharedAccepted: req.sharedAccepted,
      });

      if (!plan.ok)
        throw this.planError(plan, req.qty, await this.venueMaxParty());

      const codes = plan.tables.map((t) => t.code);
      const slots = plan.tables.map((t) => ({
        shift: shift.key,
        table: t.code,
        reservationId,
        qty: req.qty,
        startAt: req.startAt,
        endAt,
        shared: plan.shared,
      }));

      const won = await this.pushSlots({
        dateKey,
        shiftKey: shift.key,
        codes,
        slots,
        shared: plan.shared ? plan.sharedWithReservationId : undefined,
      });

      if (won) {
        return {
          dateKey,
          shiftKey: shift.key,
          tables: plan.tables,
          shared: plan.shared,
          sharedWithReservationId: plan.sharedWithReservationId,
        };
      }
      // Perdimos la carrera: alguien tomó una de las mesas del plan entre el
      // cálculo y la escritura. Se replanifica con el estado nuevo.
      this.logger.warn(
        `Reasignando mesas de ${String(reservationId)} (intento ${attempt + 1}): carrera en ${dateKey} ${shift.key}`,
      );
    }

    throw new ConflictException(
      'No pudimos apartar las mesas para ese horario. Probá de nuevo.',
    );
  }

  /**
   * Escritura atómica de los slots. Devuelve false si la guarda no matcheó
   * (alguna mesa se ocupó mientras tanto).
   */
  private async pushSlots(params: {
    dateKey: string;
    shiftKey: string;
    codes: string[];
    slots: Record<string, unknown>[];
    /** Reserva con la que se comparte la mesa grande, si aplica. */
    shared?: string;
  }): Promise<boolean> {
    const { dateKey, shiftKey, codes, slots, shared } = params;

    // Caso normal: ninguna de las mesas puede tener slot en ese turno.
    // Caso compartido: la mesa grande DEBE seguir teniendo exactamente al
    // ocupante conocido (con ≤4 personas) y a nadie más.
    const guard: Record<string, unknown> = shared
      ? {
          date: dateKey,
          $and: [
            {
              slots: {
                $not: {
                  $elemMatch: {
                    shift: shiftKey,
                    table: { $in: codes },
                    reservationId: { $ne: new Types.ObjectId(shared) },
                  },
                },
              },
            },
            {
              slots: {
                $elemMatch: {
                  shift: shiftKey,
                  table: { $in: codes },
                  reservationId: new Types.ObjectId(shared),
                  qty: { $lte: 4 },
                },
              },
            },
          ],
        }
      : {
          date: dateKey,
          slots: {
            $not: { $elemMatch: { shift: shiftKey, table: { $in: codes } } },
          },
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
        if (shared) await this.markShared(dateKey, shiftKey, codes);
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
    dateKey: string,
    shiftKey: string,
    codes: string[],
  ): Promise<void> {
    await this.dayModel.updateOne(
      { date: dateKey },
      { $set: { 'slots.$[s].shared': true } },
      {
        arrayFilters: [{ 's.shift': shiftKey, 's.table': { $in: codes } }],
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
      'No quedan mesas para ese grupo en ese horario. Elegí otro turno u otra fecha.',
    );
  }

  // ───────────────────────── Liberación ─────────────────────────

  /**
   * Libera las mesas de una reserva. Idempotente. Sin `startAt` barre todos los
   * días; con `shiftKey` se limita a ese turno (lo necesita la reprogramación,
   * que puede tener mesas viejas y nuevas el mismo día).
   */
  async release(
    reservationId: Types.ObjectId | string,
    startAt?: Date,
    shiftKey?: string,
  ): Promise<void> {
    const id = new Types.ObjectId(String(reservationId));
    const filter = startAt
      ? { date: businessDateKey(startAt) }
      : { 'slots.reservationId': id };
    const pull: Record<string, unknown> = { reservationId: id };
    if (shiftKey) pull.shift = shiftKey;
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
    if (!reservation.shiftKey) {
      throw new BadRequestException(
        'La reserva no tiene turno asignado. Reprogramala para ubicarla en un turno.',
      );
    }

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

    const dateKey = businessDateKey(reservation.startAt);
    const shiftKey = reservation.shiftKey;
    const id = new Types.ObjectId(String(reservation._id));

    const day = await this.dayModel.findOne({ date: dateKey }).lean();
    const mine = (day?.slots ?? [])
      .filter(
        (s) => s.shift === shiftKey && String(s.reservationId) === String(id),
      )
      .map((s) => s.table);

    const toAdd = wanted.filter((c) => !mine.includes(c));
    const toRemove = mine.filter((c) => !wanted.includes(c));

    if (toAdd.length) {
      const endAt = reservation.startAt;
      const ok = await this.pushSlots({
        dateKey,
        shiftKey,
        codes: toAdd,
        slots: toAdd.map((table) => ({
          shift: shiftKey,
          table,
          reservationId: id,
          qty: reservation.quantity,
          startAt: reservation.startAt,
          endAt,
          shared: false,
        })),
      });
      if (!ok) {
        throw new ConflictException(
          `Alguna de esas mesas ya está ocupada en ${shiftKey}. Recargá la agenda y probá de nuevo.`,
        );
      }
    }

    if (toRemove.length) {
      await this.dayModel.updateOne(
        { date: dateKey },
        {
          $pull: {
            slots: {
              shift: shiftKey,
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

  // ───────────────── Bloqueos manuales (taller, evento, mesa rota) ─────────

  /** Bloquea una mesa en un turno sin reserva asociada. */
  async blockTable(params: {
    dateKey: string;
    shiftKey: string;
    code: string;
    label: string;
  }): Promise<void> {
    const { dateKey, shiftKey, code, label } = params;
    this.assertShiftExists(shiftKey);
    const ok = await this.pushSlots({
      dateKey,
      shiftKey,
      codes: [code],
      slots: [{ shift: shiftKey, table: code, qty: 0, shared: false, label }],
    });
    if (!ok) {
      throw new ConflictException(
        `La mesa ${code} ya está ocupada en ese turno.`,
      );
    }
  }

  /** Quita un bloqueo manual (no toca las mesas de reservas). */
  async unblockTable(params: {
    dateKey: string;
    shiftKey: string;
    code: string;
  }): Promise<void> {
    await this.dayModel.updateOne(
      { date: params.dateKey },
      {
        $pull: {
          slots: {
            shift: params.shiftKey,
            table: params.code,
            reservationId: { $exists: false },
          },
        },
      },
    );
  }

  // ───────────────────────── Helpers ─────────────────────────

  /** Ubica la actividad en un turno o explica por qué no entra. */
  private resolveOrThrow(startAt: Date, durationMinutes: number) {
    const placed = resolveShift(startAt, durationMinutes);
    if (placed) return placed;

    const windows = listShifts()
      .map((s) => {
        const w = startWindow(s, durationMinutes);
        return w ? `${s.name}: entre ${w.earliest} y ${w.latest}` : null;
      })
      .filter(Boolean);

    if (!windows.length) {
      throw new BadRequestException(
        `Una experiencia de ${durationMinutes} minutos no entra en ningún turno. Revisá la duración o la definición de los turnos.`,
      );
    }
    throw new BadRequestException(
      `Ese horario no entra en ningún turno (una experiencia no puede pasar de un turno al otro). Horarios posibles — ${windows.join(' · ')}.`,
    );
  }

  private assertShiftExists(shiftKey: string): void {
    if (!listShifts().some((s) => s.key === shiftKey)) {
      throw new BadRequestException(`Turno desconocido: ${shiftKey}`);
    }
  }
}
