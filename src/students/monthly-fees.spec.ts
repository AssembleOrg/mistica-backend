import { Types } from 'mongoose';
import { StudentsService } from './students.service';

/**
 * Modelo Mongoose falso, en memoria, con lo justo que usan las cuotas
 * mensuales: filtros por igualdad, $exists, $in, $gte/$lt y regex.
 */
type Doc = Record<string, any> & { _id: Types.ObjectId };

function matches(doc: Doc, filter: Record<string, any>): boolean {
  return Object.entries(filter).every(([key, cond]) => {
    const value = doc[key];
    if (cond instanceof RegExp) return typeof value === 'string' && cond.test(value);
    if (cond && typeof cond === 'object' && !(cond instanceof Types.ObjectId)) {
      if ('$exists' in cond) return cond.$exists ? value !== undefined : value === undefined;
      if ('$in' in cond) return cond.$in.map(String).includes(String(value));
      if ('$gte' in cond || '$lt' in cond) {
        return (
          value instanceof Date &&
          (!cond.$gte || value >= cond.$gte) &&
          (!cond.$lt || value < cond.$lt)
        );
      }
    }
    return String(value) === String(cond);
  });
}

function fakeModel(initial: Doc[] = []) {
  const docs: Doc[] = [...initial];
  const withSave = (d: Doc) =>
    Object.assign(d, { save: async () => d });
  const query = (rows: () => Doc[]) => {
    const q: any = {
      select: () => q,
      sort: (s: Record<string, 1 | -1>) => {
        const [[k, dir]] = Object.entries(s);
        const prev = rows;
        rows = () =>
          [...prev()].sort((a, b) => (a[k] > b[k] ? dir : a[k] < b[k] ? -dir : 0));
        return q;
      },
      lean: async () => rows(),
      exec: async () => rows(),
    };
    return q;
  };
  return {
    docs,
    find: (f: Record<string, any> = {}) => query(() => docs.filter((d) => matches(d, f))),
    findOne: (f: Record<string, any> = {}) => {
      const q = query(() => docs.filter((d) => matches(d, f)));
      const lean = q.lean;
      q.lean = async () => (await lean())[0] ?? null;
      q.exec = async () => {
        const d = (await lean())[0];
        return d ? withSave(d) : null;
      };
      return q;
    },
    exists: async (f: Record<string, any>) => docs.some((d) => matches(d, f)),
    create: async (data: Record<string, any>) => {
      const d = { _id: new Types.ObjectId(), ...data } as Doc;
      docs.push(d);
      return withSave(d);
    },
    insertMany: async (rows: Record<string, any>[]) =>
      rows.map((r) => {
        const d = { _id: new Types.ObjectId(), ...r } as Doc;
        docs.push(d);
        return d;
      }),
  };
}

function build({
  students,
  payments = [],
}: {
  students: Doc[];
  payments?: Doc[];
}) {
  const studentModel = fakeModel(students);
  const paymentModel = fakeModel(payments);
  const groupModel = fakeModel([
    {
      _id: new Types.ObjectId(),
      isActive: true,
      studentIds: students.map((s) => s._id),
    },
  ]);
  const regularityModel = fakeModel();
  const none = fakeModel();
  const service = new StudentsService(
    studentModel as any,
    none as any,
    paymentModel as any,
    none as any,
    groupModel as any,
    none as any,
    none as any,
    regularityModel as any,
    none as any,
    {} as any,
    {} as any,
  );
  return { service, paymentModel };
}

const student = (extra: Record<string, any> = {}): Doc => ({
  _id: new Types.ObjectId(),
  name: 'Alumna',
  isActive: true,
  ...extra,
});

describe('Cuotas mensuales de alumnos', () => {
  const OCT_1 = new Date('2026-10-01T12:00:00-03:00');

  it('crea la cuota del mes pendiente, con vencimiento el día límite (default 10)', async () => {
    const a = student();
    const b = student({ paymentDay: 22, monthlyFee: 65000 });
    const { service, paymentModel } = build({ students: [a, b] });

    expect(await service.ensureMonthlyFees(OCT_1)).toBe(2);
    const fa = paymentModel.docs.find((p) => String(p.studentId) === String(a._id))!;
    const fb = paymentModel.docs.find((p) => String(p.studentId) === String(b._id))!;
    expect(fa).toMatchObject({ status: 'PENDING', period: '2026-10', concept: 'Cuota octubre 2026', amount: 0 });
    // Fin del día 10 en Argentina = 11/10 02:59:59.999 UTC.
    expect(fa.dueDate.toISOString()).toBe('2026-10-11T02:59:59.999Z');
    expect(fb.amount).toBe(65000);
    expect(fb.dueDate.toISOString()).toBe('2026-10-23T02:59:59.999Z');
  });

  it('es idempotente y respeta una cuota paga cargada a mano en el mes', async () => {
    const a = student();
    const b = student();
    const { service, paymentModel } = build({
      students: [a, b],
      payments: [
        {
          _id: new Types.ObjectId(),
          studentId: b._id,
          concept: 'Cuota octubre',
          status: 'PAID',
          paidAt: new Date('2026-10-01T10:00:00-03:00'),
        },
      ],
    });
    await service.ensureMonthlyFees(OCT_1);
    await service.ensureMonthlyFees(OCT_1);
    const created = paymentModel.docs.filter((p) => p.period === '2026-10');
    expect(created).toHaveLength(1);
    expect(String(created[0].studentId)).toBe(String(a._id));
  });

  it('el día límite se ajusta en meses cortos', async () => {
    const a = student({ paymentDay: 31 });
    const { service, paymentModel } = build({ students: [a] });
    await service.ensureMonthlyFees(new Date('2026-02-03T12:00:00-03:00'));
    expect(paymentModel.docs[0].dueDate.toISOString()).toBe('2026-03-01T02:59:59.999Z');
  });

  it('una venta de cuota paga la pendiente más vieja y, sin deuda, adelanta el mes siguiente', async () => {
    const clientId = new Types.ObjectId();
    const a = student({ clientId });
    const { service, paymentModel } = build({ students: [a] });
    await service.ensureMonthlyFees(OCT_1);

    const paid = await service.payFeesFromSale({
      clientId: String(clientId),
      saleId: String(new Types.ObjectId()),
      saleNumber: 'V-1',
      method: 'Efectivo',
      units: [65000, 65000],
    });

    expect(paid).toBe(2);
    const fees = paymentModel.docs
      .filter((p) => p.period)
      .sort((x, y) => (x.period > y.period ? 1 : -1));
    expect(fees.map((f) => [f.period, f.status, f.amount, f.method])).toEqual([
      ['2026-10', 'PAID', 65000, 'Efectivo'],
      ['2026-11', 'PAID', 65000, 'Efectivo'],
    ]);
  });

  it('la caja ve si el cliente es alumno y qué cuota se le va a pagar', async () => {
    const clientId = new Types.ObjectId();
    const { service } = build({ students: [student({ clientId, name: 'Melisa', paymentDay: 16 })] });
    await service.ensureMonthlyFees(OCT_1);
    const info = await service.feeStatusOfClient(String(clientId));
    expect(info).toMatchObject({ name: 'Melisa', paymentDay: 16 });
    expect(info!.pending.map((p) => p.concept)).toEqual(['Cuota octubre 2026']);
    expect(await service.feeStatusOfClient(String(new Types.ObjectId()))).toBeNull();
  });

  it('si el cliente no es alumno, la venta no toca nada', async () => {
    const { service, paymentModel } = build({ students: [student()] });
    const paid = await service.payFeesFromSale({
      clientId: String(new Types.ObjectId()),
      saleId: String(new Types.ObjectId()),
      saleNumber: 'V-2',
      units: [65000],
    });
    expect(paid).toBe(0);
    expect(paymentModel.docs).toHaveLength(0);
  });
});
