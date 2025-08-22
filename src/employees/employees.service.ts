import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEmployeeDto, UpdateEmployeeDto, PaginationDto } from '../common/dto';
import { Employee } from '../common/interfaces';
import { PaginatedResponse } from '../common/interfaces';
import { EmpleadoNoEncontradoException, EmailYaExisteException } from '../common/exceptions';

@Injectable()
export class EmployeesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createEmployeeDto: CreateEmployeeDto): Promise<Employee> {
    const existingEmployee = await this.prisma.employee.findUnique({
      where: { email: createEmployeeDto.email },
    });

    if (existingEmployee) {
      throw new EmailYaExisteException(createEmployeeDto.email);
    }

    const employee = await this.prisma.employee.create({
      data: {
        ...createEmployeeDto,
        startDate: new Date(createEmployeeDto.startDate),
      },
    });

    return employee;
  }

  async findAll(paginationDto?: PaginationDto): Promise<PaginatedResponse<Employee>> {
    const { page = 1, limit = 10 } = paginationDto || {};
    const skip = (page - 1) * limit;

    const [employees, total] = await Promise.all([
      this.prisma.employee.findMany({
        where: { deletedAt: null },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.employee.count({
        where: { deletedAt: null },
      }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data: employees,
      meta: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      },
    };
  }

  async findOne(id: string): Promise<Employee> {
    const employee = await this.prisma.employee.findFirst({
      where: { id, deletedAt: null },
    });

    if (!employee) {
      throw new EmpleadoNoEncontradoException(id);
    }

    return employee;
  }

  async update(id: string, updateEmployeeDto: UpdateEmployeeDto): Promise<Employee> {
    const existingEmployee = await this.findOne(id);

    if (updateEmployeeDto.email && updateEmployeeDto.email !== existingEmployee.email) {
      const emailExists = await this.prisma.employee.findUnique({
        where: { email: updateEmployeeDto.email },
      });

      if (emailExists) {
        throw new EmailYaExisteException(updateEmployeeDto.email);
      }
    }

    const updateData: any = { ...updateEmployeeDto };
    if (updateEmployeeDto.startDate) {
      updateData.startDate = new Date(updateEmployeeDto.startDate);
    }

    const employee = await this.prisma.employee.update({
      where: { id },
      data: updateData,
    });

    return employee;
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);

    await this.prisma.employee.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async findWithoutPagination(): Promise<Employee[]> {
    return this.prisma.employee.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
    });
  }
} 