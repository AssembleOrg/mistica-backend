import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { AppSetting, AppSettingDocument, User, UserDocument } from '../common/schemas';

/** Clave bajo la que se guarda el hash del PIN en `app_settings`. */
const CASH_DELETE_PIN_KEY = 'cashDeletePinHash';

/** Anti fuerza bruta: tras N intentos fallidos de PIN, se bloquea un rato. */
const MAX_PIN_ATTEMPTS = 5;
const PIN_LOCK_MS = 5 * 60 * 1000; // 5 minutos

@Injectable()
export class SettingsService {
  /**
   * Estado de intentos de PIN en memoria. Alcanza para este caso: hay una sola
   * cuenta compartida y una sola instancia del backend, así que un contador
   * global (no por IP) es el modelo correcto y más simple. Si algún día se
   * escala a varias instancias, esto debería moverse a Mongo/Redis.
   */
  private pinLock = { failedCount: 0, lockedUntil: 0 };

  constructor(
    @InjectModel(AppSetting.name)
    private readonly settingModel: Model<AppSettingDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
  ) {}

  /** ¿Ya hay un PIN configurado? Nunca expone el hash. */
  async getCashDeletePinStatus(): Promise<{ isSet: boolean }> {
    const doc = await this.settingModel
      .findOne({ key: CASH_DELETE_PIN_KEY })
      .lean();
    return { isSet: !!doc?.value };
  }

  /**
   * Verifica la contraseña del admin contra el hash almacenado del usuario.
   * Es el secreto raíz: sólo el dueño lo tiene (el cajero usa la sesión abierta
   * sin conocer la contraseña).
   */
  async verifyAdminPassword(
    userId: string | undefined,
    password: string,
  ): Promise<boolean> {
    if (!userId || !password) return false;
    const user = await this.userModel.findById(userId).lean();
    if (!user?.password) return false;
    return bcrypt.compare(password, user.password);
  }

  /**
   * Configura / cambia / resetea el PIN. Requiere la contraseña del admin, así
   * que este mismo flujo ES la recuperación ante un PIN olvidado.
   */
  async setCashDeletePin(
    userId: string | undefined,
    adminPassword: string,
    newPin: string,
  ): Promise<void> {
    const ok = await this.verifyAdminPassword(userId, adminPassword);
    if (!ok) {
      throw new UnauthorizedException('Contraseña de admin incorrecta');
    }

    if (!/^\d{4,6}$/.test(newPin)) {
      throw new BadRequestException('El PIN debe ser numérico de 4 a 6 dígitos');
    }

    const hash = await bcrypt.hash(newPin, 10);
    await this.settingModel.updateOne(
      { key: CASH_DELETE_PIN_KEY },
      { $set: { value: hash } },
      { upsert: true },
    );

    // Un cambio de PIN exitoso limpia cualquier bloqueo previo.
    this.pinLock = { failedCount: 0, lockedUntil: 0 };
  }

  /**
   * Autoriza una acción sensible (borrar egreso). Acepta el PIN o, como
   * respaldo, la contraseña del admin. Lanza excepción si ninguno es válido.
   *
   * El camino del PIN tiene bloqueo por fuerza bruta; el de la contraseña no lo
   * necesita (es larga y ya la protege bcrypt), y además es la vía de escape si
   * el PIN quedó bloqueado.
   */
  async authorizeSensitiveAction(
    userId: string | undefined,
    pin?: string,
    adminPassword?: string,
  ): Promise<void> {
    // Respaldo por contraseña: si es válida, autoriza sin tocar el lock del PIN.
    if (adminPassword) {
      const ok = await this.verifyAdminPassword(userId, adminPassword);
      if (ok) return;
    }

    if (!pin) {
      throw new UnauthorizedException(
        'Se requiere el PIN o la contraseña del admin para autorizar esta acción',
      );
    }

    const now = Date.now();
    if (this.pinLock.lockedUntil > now) {
      const secs = Math.ceil((this.pinLock.lockedUntil - now) / 1000);
      throw new ForbiddenException(
        `Demasiados intentos fallidos. Probá de nuevo en ${secs} segundos o usá la contraseña del admin.`,
      );
    }

    const doc = await this.settingModel
      .findOne({ key: CASH_DELETE_PIN_KEY })
      .lean();
    if (!doc?.value) {
      throw new BadRequestException(
        'No hay un PIN configurado todavía. Configuralo desde ajustes.',
      );
    }

    const valid = await bcrypt.compare(pin, doc.value);
    if (!valid) {
      this.pinLock.failedCount += 1;
      if (this.pinLock.failedCount >= MAX_PIN_ATTEMPTS) {
        this.pinLock.lockedUntil = now + PIN_LOCK_MS;
        this.pinLock.failedCount = 0;
      }
      throw new UnauthorizedException('PIN incorrecto');
    }

    // Éxito: limpiar contador de fallidos.
    this.pinLock.failedCount = 0;
    this.pinLock.lockedUntil = 0;
  }
}
