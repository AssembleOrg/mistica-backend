import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateUserDto, UpdateUserDto, PaginationDto } from '../common/dto';
import { User, UserResponse, PaginatedResponse } from '../common/interfaces';
import { UsuarioNoEncontradoException, EmailYaExisteException } from '../common/exceptions';
import { UserDocument } from '../common/schemas';
import * as bcrypt from 'bcryptjs';

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
      createdAt: userObj.createdAt,
      updatedAt: userObj.updatedAt,
      deletedAt: userObj.deletedAt,
    };
  }

  async create(createUserDto: CreateUserDto): Promise<UserResponse> {
    const existingUser = await this.userModel.findOne({ 
      email: createUserDto.email.toLowerCase(),
      deletedAt: { $exists: false }
    }).exec();

    if (existingUser) {
      throw new EmailYaExisteException(createUserDto.email);
    }

    const hashedPassword = await bcrypt.hash(createUserDto.password, 10);

    const user = await this.userModel.create({
      ...createUserDto,
      email: createUserDto.email.toLowerCase(),
      password: hashedPassword,
    });

    return this.mapToUserResponse(user);
  }

  async findAll(paginationDto?: PaginationDto): Promise<PaginatedResponse<UserResponse>> {
    const { page = 1, limit = 10 } = paginationDto || {};
    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      this.userModel.find({ deletedAt: { $exists: false } })
        .select('-password')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.userModel.countDocuments({ deletedAt: { $exists: false } }).exec(),
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
        deletedAt: { $exists: false }
      }).exec();

      if (emailExists) {
        throw new ConflictException('El email ya está registrado');
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