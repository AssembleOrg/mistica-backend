import {
  BadRequestException,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { envConfig } from '../config/env.config';
import {
  AppSetting,
  AppSettingDocument,
} from '../common/schemas/app-setting.schema';
import {
  ShiftTemplate,
  ShiftTemplateDocument,
} from '../common/schemas/shift-template.schema';
import { toMinutes } from './shifts';

const KEY = 'businessHours';
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export interface BusinessHours {
  /** Apertura de la ventana de reservas, hora local 'HH:mm'. */
  open: string;
  /** Cierre: ninguna reserva puede terminar después. */
  close: string;
}

/**
 * Horario del salón (la ventana de reservas del día), editable desde el
 * panel. Se guarda en app_settings y se aplica sobre `envConfig`, que es lo
 * que lee todo el backend de forma sincrónica (businessWindow,
 * businessBounds, la disponibilidad del bot…): así no hay que volver async
 * media aplicación. Sin valor en la base, vale la env BUSINESS_OPEN/CLOSE.
 */
@Injectable()
export class BusinessHoursService implements OnModuleInit {
  private readonly logger = new Logger(BusinessHoursService.name);
  private readonly fromEnv: BusinessHours = {
    open: envConfig.businessOpen,
    close: envConfig.businessClose,
  };

  constructor(
    @InjectModel(AppSetting.name)
    private readonly settings: Model<AppSettingDocument>,
    @InjectModel(ShiftTemplate.name)
    private readonly shiftModel: Model<ShiftTemplateDocument>,
  ) {}

  async onModuleInit(): Promise<void> {
    const row = await this.settings.findOne({ key: KEY }).lean();
    const saved = parse(row?.value);
    this.apply(saved ?? this.fromEnv);
  }

  get(): BusinessHours {
    return { open: envConfig.businessOpen, close: envConfig.businessClose };
  }

  /**
   * Cambia el horario. Devuelve además los turnos que quedan fuera: esos no
   * se ofrecen hasta que se ajusten (en Mesas → Plantillas de turno).
   */
  async set(input: BusinessHours) {
    const hours = { open: input.open.trim(), close: input.close.trim() };
    if (!HHMM.test(hours.open) || !HHMM.test(hours.close)) {
      throw new BadRequestException('El horario va en formato HH:mm.');
    }
    if (toMinutes(hours.close) - toMinutes(hours.open) < 60) {
      throw new BadRequestException(
        'El cierre tiene que ser por lo menos una hora después de la apertura.',
      );
    }
    await this.settings.updateOne(
      { key: KEY },
      { $set: { value: JSON.stringify(hours) } },
      { upsert: true },
    );
    this.apply(hours);
    const shifts = await this.shiftModel
      .find({ active: true, deletedAt: { $exists: false } })
      .select('name start end')
      .lean();
    return {
      ...this.get(),
      outsideShifts: shifts
        .filter((s) => s.start < hours.open || s.end > hours.close)
        .map((s) => `${s.name} (${s.start}–${s.end})`),
    };
  }

  private apply(hours: BusinessHours) {
    envConfig.businessOpen = hours.open;
    envConfig.businessClose = hours.close;
    this.logger.log(`Horario del salón: ${hours.open} a ${hours.close}.`);
  }
}

function parse(raw?: string): BusinessHours | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<BusinessHours>;
    return typeof v.open === 'string' &&
      typeof v.close === 'string' &&
      HHMM.test(v.open) &&
      HHMM.test(v.close)
      ? { open: v.open, close: v.close }
      : null;
  } catch {
    return null;
  }
}
