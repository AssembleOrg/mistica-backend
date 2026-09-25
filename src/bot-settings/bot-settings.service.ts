import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  BotFaq,
  BotFaqDocument,
  BotSettings,
  BotSettingsDocument,
} from '../common/schemas';
import {
  CreateBotFaqDto,
  UpdateBotFaqDto,
  UpdateBotSettingsDto,
} from '../common/dto/bot-settings.dto';
import {
  BUSINESS_DEFAULT,
  FAQ_SEED,
  TEXTS_DEFAULT,
  TRANSFER_DEFAULT,
} from './bot-settings.defaults';

const KEY = 'default';

export interface BotFaqView {
  id: string;
  title: string;
  examples: string[];
  answer: string;
  active: boolean;
  order: number;
}

@Injectable()
export class BotSettingsService {
  constructor(
    @InjectModel(BotSettings.name)
    private readonly settingsModel: Model<BotSettingsDocument>,
    @InjectModel(BotFaq.name)
    private readonly faqModel: Model<BotFaqDocument>,
  ) {}

  /** La única fila, sembrada con los defaults si no existe. Un campo nuevo
   *  agregado al código aparece con su default sin migración. */
  async get(): Promise<BotSettings> {
    const found = await this.settingsModel.findOne({ key: KEY }).lean();
    const row: Partial<BotSettings> =
      found ??
      (
        await this.settingsModel.create({
          key: KEY,
          botActive: true,
          business: BUSINESS_DEFAULT,
          transfer: TRANSFER_DEFAULT,
          texts: TEXTS_DEFAULT,
        })
      ).toObject();
    return {
      key: KEY,
      botActive: row.botActive ?? true,
      business: { ...BUSINESS_DEFAULT, ...(row.business ?? {}) },
      transfer: { ...TRANSFER_DEFAULT, ...(row.transfer ?? {}) },
      texts: { ...TEXTS_DEFAULT, ...(row.texts ?? {}) },
    };
  }

  async update(dto: UpdateBotSettingsDto): Promise<BotSettings> {
    const current = await this.get();
    const next: Partial<BotSettings> = {};
    if (dto.botActive !== undefined) next.botActive = dto.botActive;
    if (dto.business)
      next.business = { ...current.business, ...clean(dto.business) };
    if (dto.transfer)
      next.transfer = { ...current.transfer, ...clean(dto.transfer) };
    if (dto.texts) next.texts = { ...current.texts, ...clean(dto.texts) };
    await this.settingsModel.updateOne(
      { key: KEY },
      { $set: next },
      { upsert: true },
    );
    return this.get();
  }

  // ─── FAQ / políticas ───

  async listFaq(): Promise<BotFaqView[]> {
    await this.seedFaqIfEmpty();
    const rows = await this.faqModel
      .find()
      .sort({ order: 1, createdAt: 1 })
      .lean();
    return rows.map((r) => this.faqView(r));
  }

  async createFaq(dto: CreateBotFaqDto): Promise<BotFaqView> {
    const last = await this.faqModel.findOne().sort({ order: -1 }).lean();
    const row = await this.faqModel.create({
      title: dto.title.trim(),
      examples: cleanExamples(dto.examples),
      answer: dto.answer.trim(),
      active: dto.active ?? true,
      order: dto.order ?? (last ? (last.order ?? 0) + 1 : 0),
    });
    return this.faqView(row.toObject());
  }

  async updateFaq(id: string, dto: UpdateBotFaqDto): Promise<BotFaqView> {
    const set: Partial<BotFaq> = {};
    if (dto.title !== undefined) set.title = dto.title.trim();
    if (dto.examples !== undefined) set.examples = cleanExamples(dto.examples);
    if (dto.answer !== undefined) set.answer = dto.answer.trim();
    if (dto.active !== undefined) set.active = dto.active;
    if (dto.order !== undefined) set.order = dto.order;
    const row = await this.faqModel
      .findByIdAndUpdate(id, { $set: set }, { new: true })
      .lean();
    if (!row) throw new NotFoundException('Pregunta no encontrada');
    return this.faqView(row);
  }

  async deleteFaq(id: string): Promise<void> {
    const res = await this.faqModel.deleteOne({ _id: id });
    if (res.deletedCount === 0)
      throw new NotFoundException('Pregunta no encontrada');
  }

  /** Lo que consume el bot: settings + sólo las FAQ activas, ordenadas. */
  async forBot(): Promise<{ settings: BotSettings; faqs: BotFaqView[] }> {
    const [settings, faqs] = await Promise.all([this.get(), this.listFaq()]);
    return { settings, faqs: faqs.filter((f) => f.active) };
  }

  private async seedFaqIfEmpty(): Promise<void> {
    if ((await this.faqModel.countDocuments()) > 0) return;
    await this.faqModel.insertMany(
      FAQ_SEED.map((f, i) => ({ ...f, active: true, order: i })),
    );
  }

  private faqView(r: BotFaq & { _id: unknown }): BotFaqView {
    return {
      id: String(r._id as Types.ObjectId),
      title: r.title,
      examples: r.examples ?? [],
      answer: r.answer,
      active: r.active ?? true,
      order: r.order ?? 0,
    };
  }
}

/** Sólo strings (recortados); ignora undefined para no pisar con vacío por error. */
function clean<T extends object>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string') out[k] = v.trim();
  }
  return out as Partial<T>;
}

function cleanExamples(list?: string[]): string[] {
  return (list ?? [])
    .map((e) => String(e).trim())
    .filter((e) => e.length > 0)
    .slice(0, 12);
}
