import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateUserDto, UpdateUserDto, PaginatedDateFilterDto } from '../common/dto';
import { User, UserResponse, PaginatedResponse } from '../common/interfaces';
import { UsuarioNoEncontradoException, EmailYaExisteException } from '../common/exceptions';
import { UserDocument } from '../common/schemas';
import { buildDateFilter } from '../common/utils';
import * as bcrypt from 'bcryptjs';

function isDuplicateEmailError(err: unknown): boolean {
  const e = err as { code?: number; keyPattern?: Record<string, unknown> };
  return e?.code === 11000 && !!e.keyPattern?.email;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectModel('User') private readonly userModel: Model<UserDocument>,
  ) {}

  private mapToUserResponse(user: UserDocument): UserResponse {
    const userObj = user.toObject();
    return {
      id: userObj._id.toString(),
      email: userObj.email,
      name: userObj.name,
      role: userObj.role,
      avatar: userObj.avatar,
      allowedViews: userObj.allowedViews ?? [],
      createdAt: userObj.createdAt,
      updatedAt: userObj.updatedAt,
      deletedAt: userObj.deletedAt,
    };
  }

  async create(createUserDto: CreateUserDto): Promise<UserResponse> {
    const email = createUserDto.email.toLowerCase();
    // El índice único de email incluye las cuentas borradas (soft delete), así
    // que buscamos sin filtrar por deletedAt.
    const existingUser = await this.userModel.findOne({ email }).exec();

    if (existingUser && !existingUser.deletedAt) {
      throw new EmailYaExisteException(createUserDto.email);
    }

    const hashedPassword = await bcrypt.hash(createUserDto.password, 10);

    if (existingUser) {
      // Volver a crear una cuenta borrada la reactiva con los datos nuevos. Se
      // conserva el id, así que lo que ya apuntaba a ella (p. ej. la profesora
      // vinculada) vuelve a funcionar.
      const { allowedViews, ...rest } = createUserDto;
      const user = await this.userModel
        .findByIdAndUpdate(
          existingUser._id,
          {
            $set: {
              ...rest,
              email,
              password: hashedPassword,
              updatedAt: new Date(),
              ...(allowedViews !== undefined ? { allowedViews } : {}),
            },
            $unset: {
              deletedAt: 1,
              ...(allowedViews === undefined ? { allowedViews: 1 } : {}),
            },
          },
          { new: true, runValidators: true },
        )
        .exec();
      if (!user) throw new UsuarioNoEncontradoException(String(existingUser._id));
      return this.mapToUserResponse(user);
    }

    try {
      const user = await this.userModel.create({
        ...createUserDto,
        email,
        password: hashedPassword,
      });
      return this.mapToUserResponse(user);
    } catch (err) {
      if (isDuplicateEmailError(err)) {
        throw new EmailYaExisteException(createUserDto.email);
      }
      throw err;
    }
  }

  async findAll(paginationDto?: PaginatedDateFilterDto): Promise<PaginatedResponse<UserResponse>> {
    const { page = 1, limit = 10, search, from, to } = paginationDto || {};
    const skip = (page - 1) * limit;

    // Construir filtros
    const filters: any = { deletedAt: { $exists: false } };
    
    // Filtro de búsqueda por nombre, email o username
    if (search) {
      filters.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { username: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Filtros de fecha
    const dateFilter = buildDateFilter(from, to);
    Object.assign(filters, dateFilter);

    const [users, total] = await Promise.all([
      this.userModel.find(filters)
        .select('-password')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.userModel.countDocuments(filters).exec(),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data: users.map(user => this.mapToUserResponse(user)),
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

  async findWithoutPagination(): Promise<UserResponse[]> {
    const users = await this.userModel.find({ 
      deletedAt: { $exists: false } 
    }).select('-password').sort({ createdAt: -1 }).exec();

    return users.map(user => this.mapToUserResponse(user));
  }

  async findOne(id: string): Promise<UserResponse> {
    const user = await this.userModel.findOne({
      _id: id,
      deletedAt: { $exists: false }
    }).select('-password').exec();

    if (!user) {
      throw new UsuarioNoEncontradoException(id);
    }

    return this.mapToUserResponse(user);
  }

  async update(id: string, updateUserDto: UpdateUserDto): Promise<UserResponse> {
    const existingUser = await this.findOne(id);

    if (updateUserDto.email && updateUserDto.email !== existingUser.email) {
      const emailExists = await this.userModel.findOne({
        email: updateUserDto.email.toLowerCase(),
        _id: { $ne: id },
      }).exec();

      if (emailExists) {
        throw new ConflictException(
          emailExists.deletedAt
            ? 'El email pertenece a una cuenta eliminada. Restaurala o usá otro email.'
            : 'El email ya está registrado',
        );
      }
    }

    let updateData = { ...updateUserDto };
    
    if (updateUserDto.email) {
      updateData.email = updateUserDto.email.toLowerCase();
    }

    if (updateUserDto.password) {
      updateData.password = await bcrypt.hash(updateUserDto.password, 10);
    }

    const user = await this.userModel.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    ).select('-password').exec();

    if (!user) {
      throw new UsuarioNoEncontradoException(id);
    }

    return this.mapToUserResponse(user);
  }

  async remove(id: string): Promise<void> {
    const user = await this.findOne(id);
    
    await this.userModel.findByIdAndUpdate(id, {
      deletedAt: new Date()
    }).exec();
  }

  async findAllDeleted(): Promise<UserResponse[]> {
    const users = await this.userModel.find({
      deletedAt: { $exists: true }
    }).select('-password').exec();

    return users.map(user => this.mapToUserResponse(user));
  }

  async restore(id: string): Promise<UserResponse> {
    const user = await this.userModel.findByIdAndUpdate(
      id,
      { $unset: { deletedAt: 1 } },
      { new: true, runValidators: true }
    ).select('-password').exec();

    if (!user) {
      throw new UsuarioNoEncontradoException(id);
    }

    return this.mapToUserResponse(user);
  }
} 