import { NotFoundException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test } from '@nestjs/testing';
import { Types } from 'mongoose';
import { Client } from '../common/schemas/client.schema';
import { Group } from '../common/schemas/group.schema';
import { Professor } from '../common/schemas/professor.schema';
import { Student } from '../common/schemas/student.schema';
import { UserRole } from '../common/enums/user-role.enum';
import { GroupsService } from './groups.service';

const ADMIN = { id: String(new Types.ObjectId()), role: UserRole.ADMIN };
const SCHEDULE = [{ weekday: 3, start: '15:30', end: '17:30' }];

const exec = (value: unknown) => ({ exec: jest.fn().mockResolvedValue(value) });

async function build(opts: {
  clients?: Array<Record<string, unknown>>;
  studentOfClient?: Record<string, unknown> | null;
  group?: Record<string, unknown>;
}) {
  const groupModel = {
    create: jest.fn().mockImplementation((data) => Promise.resolve(data)),
    findById: jest.fn().mockReturnValue(exec(opts.group ?? null)),
  };
  const studentModel = {
    findOne: jest.fn().mockReturnValue(exec(opts.studentOfClient ?? null)),
    create: jest
      .fn()
      .mockImplementation((data) =>
        Promise.resolve({ _id: new Types.ObjectId(), isActive: true, ...data }),
      ),
  };
  const clientModel = {
    find: jest.fn().mockReturnValue(exec(opts.clients ?? [])),
  };
  const moduleRef = await Test.createTestingModule({
    providers: [
      GroupsService,
      { provide: getModelToken(Group.name), useValue: groupModel },
      { provide: getModelToken(Professor.name), useValue: {} },
      { provide: getModelToken(Student.name), useValue: studentModel },
      { provide: getModelToken(Client.name), useValue: clientModel },
    ],
  }).compile();
  return { service: moduleRef.get(GroupsService), groupModel, studentModel };
}

describe('GroupsService · clientes en el grupo', () => {
  const client = {
    _id: new Types.ObjectId(),
    fullName: 'Ana Pérez',
    phone: '1122334455',
    email: 'ana@mail.com',
  };

  it('da de alta como alumno vinculado al cliente que todavía no lo es', async () => {
    const { service, studentModel, groupModel } = await build({
      clients: [client],
    });

    await service.create(
      { name: 'Miércoles', schedule: SCHEDULE, clientIds: [String(client._id)] },
      ADMIN,
    );

    expect(studentModel.create).toHaveBeenCalledWith({
      name: 'Ana Pérez',
      clientId: client._id,
      clientName: 'Ana Pérez',
      phone: '1122334455',
      email: 'ana@mail.com',
    });
    const created = await studentModel.create.mock.results[0].value;
    expect(groupModel.create.mock.calls[0][0].studentIds).toEqual([created._id]);
  });

  it('reutiliza el alumno del cliente sin duplicarlo y lo reactiva si estaba de baja', async () => {
    const existing = {
      _id: new Types.ObjectId(),
      isActive: false,
      save: jest.fn().mockResolvedValue(undefined),
    };
    const { service, studentModel, groupModel } = await build({
      clients: [client],
      studentOfClient: existing,
    });

    await service.create(
      {
        name: 'Miércoles',
        schedule: SCHEDULE,
        studentIds: [String(existing._id)],
        clientIds: [String(client._id)],
      },
      ADMIN,
    );

    expect(studentModel.create).not.toHaveBeenCalled();
    expect(existing.isActive).toBe(true);
    expect(existing.save).toHaveBeenCalled();
    expect(groupModel.create.mock.calls[0][0].studentIds).toEqual([existing._id]);
  });

  it('al editar suma el cliente sin perder los alumnos que ya estaban', async () => {
    const already = new Types.ObjectId();
    const group = {
      studentIds: [already],
      save: jest.fn().mockResolvedValue(undefined),
    };
    const { service, studentModel } = await build({ clients: [client], group });

    await service.update(
      String(new Types.ObjectId()),
      { clientIds: [String(client._id)] },
      ADMIN,
    );

    const created = await studentModel.create.mock.results[0].value;
    expect(group.studentIds).toEqual([already, created._id]);
    expect(group.save).toHaveBeenCalled();
  });

  it('permite editar un grupo cuyo profesor fue eliminado si no se lo cambia', async () => {
    const deletedProfessor = new Types.ObjectId();
    const group = {
      professorId: deletedProfessor,
      professorName: 'Micaela Fajardo',
      studentIds: [],
      save: jest.fn().mockResolvedValue(undefined),
    };
    const { service } = await build({ clients: [client], group });

    // El form reenvía el profesor actual: no debe volver a buscarlo.
    await service.update(
      String(new Types.ObjectId()),
      { professorId: String(deletedProfessor), clientIds: [String(client._id)] },
      ADMIN,
    );

    expect(group.professorName).toBe('Micaela Fajardo');
    expect(group.studentIds).toHaveLength(1);
    expect(group.save).toHaveBeenCalled();
  });

  it('rechaza un cliente inexistente sin dar de alta a nadie', async () => {
    const { service, studentModel, groupModel } = await build({ clients: [] });

    await expect(
      service.create(
        {
          name: 'Miércoles',
          schedule: SCHEDULE,
          clientIds: [String(new Types.ObjectId())],
        },
        ADMIN,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(studentModel.create).not.toHaveBeenCalled();
    expect(groupModel.create).not.toHaveBeenCalled();
  });
});
