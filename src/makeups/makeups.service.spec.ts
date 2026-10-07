import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { MakeupsService } from './makeups.service';

/**
 * Recuperaciones: Patricia (grupo Miércoles 15:30) falta el mié 7/10 y la
 * recupera el vie 9/10 en el grupo Viernes 10.
 */

const STUDENT = new Types.ObjectId();
const MIE = { _id: new Types.ObjectId(), name: 'Miércoles 15.30', schedule: [{ weekday: 3, start: '15:30' }], studentIds: [STUDENT], isActive: true };
const VIE = { _id: new Types.ObjectId(), name: 'Viernes 10', schedule: [{ weekday: 5, start: '10:00' }], studentIds: [] as Types.ObjectId[], isActive: true };

// Query de mongoose encadenable y "await"-able.
function q<T>(value: T) {
  const o: Record<string, unknown> = {
    select: () => o,
    sort: () => o,
    limit: () => o,
    lean: () => Promise.resolve(value),
    exec: () => Promise.resolve(value),
    then: (res: (v: T) => unknown, rej: (e: unknown) => unknown) =>
      Promise.resolve(value).then(res, rej),
  };
  return o;
}

function build(opts: {
  source?: { records: Array<Record<string, unknown>>; save: jest.Mock } | null;
  sameDay?: Record<string, unknown> | null;
  targets?: Array<Record<string, unknown>>;
  groups?: { from?: typeof MIE; to?: typeof VIE };
}) {
  const from = opts.groups?.from ?? MIE;
  const to = opts.groups?.to ?? VIE;
  const groupModel = {
    findOne: jest.fn((f: { _id: string }) =>
      q(String(f._id) === String(from._id) ? from : String(f._id) === String(to._id) ? to : null),
    ),
    find: jest.fn(() => q([MIE, VIE])),
  };
  const studentModel = {
    findOne: jest.fn(() => q({ _id: STUDENT, name: 'Patricia Barca' })),
    find: jest.fn(() => q([{ _id: STUDENT, name: 'Patricia Barca' }])),
  };
  const makeupModel = {
    findOne: jest.fn(() => q(opts.sameDay ?? null)),
    findOneAndUpdate: jest.fn((filter: Record<string, unknown>, update: { $set: Record<string, unknown> }) => {
      const doc = { _id: new Types.ObjectId(), ...filter, ...update.$set };
      return Promise.resolve({ ...doc, toObject: () => doc });
    }),
  };
  const attendanceModel = {
    findOne: jest.fn(() => q(opts.source ?? null)),
    find: jest.fn(() => q(opts.targets ?? [])),
  };
  const userModel = { findById: jest.fn(() => q({ name: 'Mica' })) };
  const service = new MakeupsService(
    makeupModel as never,
    attendanceModel as never,
    groupModel as never,
    studentModel as never,
    userModel as never,
  );
  return { service, makeupModel, attendanceModel };
}

const DTO = {
  studentId: String(STUDENT),
  fromGroupId: String(MIE._id),
  fromDate: '2026-10-07',
  toGroupId: String(VIE._id),
  toDate: '2026-10-09',
};

describe('MakeupsService · agendar', () => {
  it('agenda la recuperación en otro grupo y la muestra pendiente', async () => {
    const { service, makeupModel } = build({});
    const view = await service.schedule(DTO);
    expect(makeupModel.findOneAndUpdate).toHaveBeenCalled();
    expect(view).toMatchObject({
      fromGroupName: 'Miércoles 15.30',
      toGroupName: 'Viernes 10',
      toStart: '10:00',
      toDate: '2026-10-09',
      status: 'SCHEDULED',
      student: { name: 'Patricia Barca' },
    });
  });

  it('no deja recuperar en su propio grupo', async () => {
    const { service } = build({});
    await expect(
      service.schedule({ ...DTO, toGroupId: String(MIE._id), toDate: '2026-10-14' }),
    ).rejects.toThrow('otro grupo');
  });

  it('no deja recuperar en un grupo donde ya cursa', async () => {
    const vie = { ...VIE, studentIds: [STUDENT] };
    const { service } = build({ groups: { to: vie } });
    await expect(service.schedule(DTO)).rejects.toThrow('ya cursa en Viernes 10');
  });

  it('valida que ese día el grupo tenga clase', async () => {
    const { service } = build({});
    await expect(service.schedule({ ...DTO, toDate: '2026-10-08' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('si la asistencia ya estaba tomada con ella presente, queda ausente', async () => {
    const save = jest.fn();
    const record = { studentId: STUDENT, status: 'PRESENT' };
    const { service } = build({ source: { records: [record], save } });
    await service.schedule(DTO);
    expect(record.status).toBe('ABSENT');
    expect(save).toHaveBeenCalled();
  });

  it('no deja recuperar una clase ya recuperada en otro lado', async () => {
    const record = {
      studentId: STUDENT,
      status: 'ABSENT',
      recoveredInGroupId: new Types.ObjectId(),
      recoveredInDate: '2026-10-08',
    };
    const { service } = build({ source: { records: [record], save: jest.fn() } });
    await expect(service.schedule(DTO)).rejects.toThrow('ya la recuperó el 08/10');
  });

  it('marca hecha la recuperación cuando la asistencia de destino la tiene presente', async () => {
    const { service } = build({
      targets: [
        {
          groupId: VIE._id,
          dateKey: '2026-10-09',
          records: [
            {
              studentId: STUDENT,
              status: 'MAKEUP',
              makeupForGroupId: MIE._id,
              makeupForDate: '2026-10-07',
            },
          ],
        },
      ],
    });
    const view = await service.schedule(DTO);
    expect(view.status).toBe('DONE');
  });
});
