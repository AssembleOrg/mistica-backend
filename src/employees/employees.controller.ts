import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { EmployeesService } from './employees.service';
import { CreateEmployeeDto, UpdateEmployeeDto, PaginationDto } from '../common/dto';
import { Employee } from '../common/interfaces';
import { PaginatedResponse } from '../common/interfaces';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Auditory } from '../common/decorators';

@ApiTags('Empleados')
@Controller('employees')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Post()
  @Auditory({ entity: 'Employee', action: 'CREATE' })
  @ApiOperation({ summary: 'Crear nuevo empleado' })
  @ApiResponse({ status: 201, description: 'Empleado creado exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  @ApiResponse({ status: 409, description: 'Email ya registrado' })
  async create(@Body() createEmployeeDto: CreateEmployeeDto): Promise<Employee> {
    return this.employeesService.create(createEmployeeDto);
  }

  @Get()
  @ApiOperation({ summary: 'Obtener todos los empleados con paginación' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Número de página' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Límite por página' })
  @ApiResponse({ status: 200, description: 'Lista de empleados obtenida exitosamente' })
  async findAll(@Query() paginationDto: PaginationDto): Promise<PaginatedResponse<Employee>> {
    return this.employeesService.findAll(paginationDto);
  }

  @Get('all')
  @ApiOperation({ summary: 'Obtener todos los empleados sin paginación' })
  @ApiResponse({ status: 200, description: 'Lista completa de empleados obtenida exitosamente' })
  async findAllWithoutPagination(): Promise<Employee[]> {
    return this.employeesService.findWithoutPagination();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener empleado por ID' })
  @ApiResponse({ status: 200, description: 'Empleado encontrado exitosamente' })
  @ApiResponse({ status: 404, description: 'Empleado no encontrado' })
  async findOne(@Param('id') id: string): Promise<Employee> {
    return this.employeesService.findOne(id);
  }

  @Patch(':id')
  @Auditory({ entity: 'Employee', action: 'UPDATE' })
  @ApiOperation({ summary: 'Actualizar empleado' })
  @ApiResponse({ status: 200, description: 'Empleado actualizado exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  @ApiResponse({ status: 404, description: 'Empleado no encontrado' })
  @ApiResponse({ status: 409, description: 'Email ya registrado' })
  async update(
    @Param('id') id: string,
    @Body() updateEmployeeDto: UpdateEmployeeDto,
  ): Promise<Employee> {
    return this.employeesService.update(id, updateEmployeeDto);
  }

  @Delete(':id')
  @Auditory({ entity: 'Employee', action: 'DELETE' })
  @ApiOperation({ summary: 'Eliminar empleado (soft delete)' })
  @ApiResponse({ status: 200, description: 'Empleado eliminado exitosamente' })
  @ApiResponse({ status: 404, description: 'Empleado no encontrado' })
  async remove(@Param('id') id: string): Promise<void> {
    return this.employeesService.remove(id);
  }
} 