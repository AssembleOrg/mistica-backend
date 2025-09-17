import { Injectable, UnauthorizedException, ConflictException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { CreateUserDto, LoginUserDto } from '../common/dto';
import { UserRole } from '../common/enums';
import { User, UserDocument } from '../common/schemas';
import { Logger } from '@nestjs/common';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly jwtService: JwtService,
    private readonly logger: Logger,
  ) {}

  async validateUser(email: string, password: string): Promise<any> {
    this.logger.log('Validating user', email);
    this.logger.log('Password', password, 'length', password.length, 'type', typeof password);
    if (!email || !password) {
      this.logger.log('Invalid email or password', email, password);
      return null;
    }

    try {
      const user = await this.userModel.findOne({ 
        email: { $regex: new RegExp(`^${email}$`, 'i') },
        deletedAt: { $exists: false }
      }).exec();

      if (user && (await bcrypt.compare(password, user.password))) {
        const { password: _, ...result } = user.toObject();
        return result;
      }
      return null;
    } catch (error) {
      console.error('Error validating user:', error);
      return null;
    }
  }

  async login(loginUserDto: LoginUserDto) {
    this.logger.log('Login request received', loginUserDto);
    if (!loginUserDto.email || !loginUserDto.password) {
      throw new BadRequestException('Email y contraseña son requeridos');
    }

    try {
      const user = await this.validateUser(loginUserDto.email, loginUserDto.password);
      if (!user) {
        throw new UnauthorizedException('Credenciales inválidas');
      }

      const payload = { email: user.email, sub: user._id.toString(), role: user.role };
      return {
        access_token: this.jwtService.sign(payload),
        user: {
          id: user._id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
      };
    } catch (error) {
      if (error instanceof UnauthorizedException || error instanceof BadRequestException) {
        throw error;
      }
      console.error('Error during login:', error);
      throw new UnauthorizedException('Error durante el inicio de sesión');
    }
  }

  async register(createUserDto: CreateUserDto) {
    if (!createUserDto.email || !createUserDto.password || !createUserDto.name) {
      throw new BadRequestException('Email, contraseña y nombre son requeridos');
    }

    try {
      const existingUser = await this.userModel.findOne({ 
        email: { $regex: new RegExp(`^${createUserDto.email}$`, 'i') },
        deletedAt: { $exists: false }
      }).exec();

      if (existingUser) {
        throw new ConflictException('El email ya está registrado');
      }

      const hashedPassword = await bcrypt.hash(createUserDto.password, 10);

      const userData = {
        ...createUserDto,
        email: createUserDto.email.toLowerCase(),
        password: hashedPassword,
      };

      const user = await this.userModel.create(userData);

      if (!user || !user._id) {
        throw new BadRequestException('Error al crear el usuario');
      }

      const { password: _, ...result } = user.toObject();
      return result;
    } catch (error) {
      if (error instanceof ConflictException || error instanceof BadRequestException) {
        throw error;
      }
      console.error('Error during registration:', error);
      throw new BadRequestException('Error durante el registro');
    }
  }

  async createAdminUser(createUserDto: CreateUserDto) {
    if (!createUserDto.email || !createUserDto.password || !createUserDto.name) {
      throw new BadRequestException('Email, contraseña y nombre son requeridos');
    }

    try {
      const existingUser = await this.userModel.findOne({ 
        email: { $regex: new RegExp(`^${createUserDto.email}$`, 'i') },
        deletedAt: { $exists: false }
      }).exec();

      if (existingUser) {
        throw new ConflictException('El email ya está registrado');
      }

      const hashedPassword = await bcrypt.hash(createUserDto.password, 10);

      const userData = {
        ...createUserDto,
        email: createUserDto.email.toLowerCase(),
        password: hashedPassword,
        role: UserRole.ADMIN,
      };

      const user = await this.userModel.create(userData);

      if (!user || !user._id) {
        throw new BadRequestException('Error al crear el usuario administrador');
      }

      const { password: _, ...result } = user.toObject();
      return result;
    } catch (error) {
      if (error instanceof ConflictException || error instanceof BadRequestException) {
        throw error;
      }
      console.error('Error creating admin user:', error);
      throw new BadRequestException('Error al crear el usuario administrador');
    }
  }
} 