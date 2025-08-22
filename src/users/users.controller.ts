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
import { UsersService } from './users.service';
import { CreateUserDto, UpdateUserDto, PaginationDto } from '../common/dto';
import { UserResponse } from '../common/interfaces';
import { PaginatedResponse } from '../common/interfaces';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Auditory } from '../common/decorators';

@ApiTags('Usuarios')
@Controller('users')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @Auditory({ entity: 'User', action: 'CREATE' })
  @ApiOperation({ summary: 'Crear nuevo usuario' })
  @ApiResponse({ status: 201, description: 'Usuario creado exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  @ApiResponse({ status: 409, description: 'Email ya registrado' })
  async create(@Body() createUserDto: CreateUserDto): Promise<UserResponse> {
    return this.usersService.create(createUserDto);
  }

  @Get()
  @ApiOperation({ summary: 'Obtener todos los usuarios con paginación' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Número de página' })
  @ApiQuery({ name: 'limit', required: false, type: Number, description: 'Límite por página' })
  @ApiResponse({ status: 200, description: 'Lista de usuarios obtenida exitosamente' })
  async findAll(@Query() paginationDto: PaginationDto): Promise<PaginatedResponse<UserResponse>> {
    return this.usersService.findAll(paginationDto);
  }

  @Get('all')
  @ApiOperation({ summary: 'Obtener todos los usuarios sin paginación' })
  @ApiResponse({ status: 200, description: 'Lista completa de usuarios obtenida exitosamente' })
  async findAllWithoutPagination(): Promise<UserResponse[]> {
    return this.usersService.findWithoutPagination();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener usuario por ID' })
  @ApiResponse({ status: 200, description: 'Usuario encontrado exitosamente' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado' })
  async findOne(@Param('id') id: string): Promise<UserResponse> {
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  @Auditory({ entity: 'User', action: 'UPDATE' })
  @ApiOperation({ summary: 'Actualizar usuario' })
  @ApiResponse({ status: 200, description: 'Usuario actualizado exitosamente' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado' })
  @ApiResponse({ status: 409, description: 'Email ya registrado' })
  async update(
    @Param('id') id: string,
    @Body() updateUserDto: UpdateUserDto,
  ): Promise<UserResponse> {
    return this.usersService.update(id, updateUserDto);
  }

  @Delete(':id')
  @Auditory({ entity: 'User', action: 'DELETE' })
  @ApiOperation({ summary: 'Eliminar usuario (soft delete)' })
  @ApiResponse({ status: 200, description: 'Usuario eliminado exitosamente' })
  @ApiResponse({ status: 404, description: 'Usuario no encontrado' })
  async remove(@Param('id') id: string): Promise<void> {
    return this.usersService.remove(id);
  }
} 