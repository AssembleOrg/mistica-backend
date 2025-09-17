import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateEmployeeDto, UpdateEmployeeDto, PaginatedDateFilterDto } from '../common/dto';
import { Employee } from '../common/interfaces';
import { PaginatedResponse } from '../common/interfaces';
import { EmpleadoNoEncontradoException, EmailYaExisteException } from '../common/exceptions';
import { EmployeeDocument } from '../common/schemas';
import { buildDateFilter } from '../common/utils';

@Injectable()
export class EmployeesService {
  constructor(
    @InjectModel('Employee') private readonly employeeModel: Model<EmployeeDocument>,
  ) {}

  private mapToEmployeeResponse(employee: EmployeeDocument): Employee {
    const employeeObj = employee.toObject();
    return {
      id: employeeObj._id.toString(),
      name: employeeObj.name,
      email: employeeObj.email,
      role: employeeObj.role,
      phone: employeeObj.phone,
      address: employeeObj.address,
      startDate: employeeObj.startDate,
      createdAt: employeeObj.createdAt,
      updatedAt: employeeObj.updatedAt,
      deletedAt: employeeObj.deletedAt,
    };
  }

  async create(createEmployeeDto: CreateEmployeeDto): Promise<Employee> {
    const existingEmployee = await this.employeeModel.findOne({
      email: createEmployeeDto.email.toLowerCase(),
      deletedAt: { $exists: false }
    }).exec();

    if (existingEmployee) {
      throw new EmailYaExisteException(createEmployeeDto.email);
    }

    const employee = await this.employeeModel.create({
      ...createEmployeeDto,
      email: createEmployeeDto.email.toLowerCase(),
      startDate: new Date(createEmployeeDto.startDate),
    });

    return this.mapToEmployeeResponse(employee);
  }

  async findAll(paginationDto?: PaginatedDateFilterDto): Promise<PaginatedResponse<Employee>> {
    const { page = 1, limit = 10, search, from, to } = paginationDto || {};
    const skip = (page - 1) * limit;

    // Construir filtros
    const filters: any = { deletedAt: { $exists: false } };
    
    // Filtro de búsqueda por nombre, email o documento
    if (search) {
      filters.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { document: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Filtros de fecha
    const dateFilter = buildDateFilter(from, to);
    Object.assign(filters, dateFilter);

    const [employees, total] = await Promise.all([
      this.employeeModel.find(filters)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.employeeModel.countDocuments(filters).exec(),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data: employees.map(employee => this.mapToEmployeeResponse(employee)),
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

  async findWithoutPagination(): Promise<Employee[]> {
    const employees = await this.employeeModel.find({ 
      deletedAt: { $exists: false } 
    }).sort({ createdAt: -1 }).exec();

    return employees.map(employee => this.mapToEmployeeResponse(employee));
  }

  async findOne(id: string): Promise<Employee> {
    const employee = await this.employeeModel.findOne({
      _id: id,
      deletedAt: { $exists: false }
    }).exec();

    if (!employee) {
      throw new EmpleadoNoEncontradoException(id);
    }

    return this.mapToEmployeeResponse(employee);
  }

  async update(id: string, updateEmployeeDto: UpdateEmployeeDto): Promise<Employee> {
    const existingEmployee = await this.findOne(id);

    if (updateEmployeeDto.email && updateEmployeeDto.email !== existingEmployee.email) {
      const emailExists = await this.employeeModel.findOne({
        email: updateEmployeeDto.email.toLowerCase(),
        _id: { $ne: id },
        deletedAt: { $exists: false }
      }).exec();

      if (emailExists) {
        throw new EmailYaExisteException(updateEmployeeDto.email);
      }
    }

    let updateData = { ...updateEmployeeDto };
    
    if (updateEmployeeDto.email) {
      updateData.email = updateEmployeeDto.email.toLowerCase();
    }

    if (updateEmployeeDto.startDate) {
      updateData.startDate = new Date(updateEmployeeDto.startDate).toISOString();
    }

    const employee = await this.employeeModel.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    ).exec();

    if (!employee) {
      throw new EmpleadoNoEncontradoException(id);
    }

    return this.mapToEmployeeResponse(employee);
  }

  async remove(id: string): Promise<void> {
    const employee = await this.findOne(id);
    
    await this.employeeModel.findByIdAndUpdate(id, {
      deletedAt: new Date()
    }).exec();
  }

  async findAllDeleted(): Promise<Employee[]> {
    const employees = await this.employeeModel.find({
      deletedAt: { $exists: true }
    }).exec();

    return employees.map(employee => this.mapToEmployeeResponse(employee));
  }

  async restore(id: string): Promise<Employee> {
    const employee = await this.employeeModel.findByIdAndUpdate(
      id,
      { $unset: { deletedAt: 1 } },
      { new: true, runValidators: true }
    ).exec();

    if (!employee) {
      throw new EmpleadoNoEncontradoException(id);
    }

    return this.mapToEmployeeResponse(employee);
  }
} 