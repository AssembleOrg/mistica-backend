import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  AppSetting,
  AppSettingDocument,
} from '../common/schemas/app-setting.schema';

export interface PieceColor {
  name: string;
  /** Tono del circulito (#rrggbb). */
  hex: string;
}

/** Paleta del taller, agrupada como la organizan ellos (tonos aproximados). */
export const DEFAULT_PIECE_COLORS: PieceColor[][] = [
  [
    { name: 'Rosa Clarito', hex: '#f6c9d4' },
    { name: 'Marrón Clarito', hex: '#c9a27e' },
    { name: 'Rojo Clarito', hex: '#e98b84' },
    { name: 'Agua Clarito', hex: '#a9dcd6' },
    { name: 'Oscuro', hex: '#3b3b3b' },
  ],
  [
    { name: 'Marrón', hex: '#8b5a3c' },
    { name: 'Naranja', hex: '#f08a3c' },
    { name: 'Verde Lima', hex: '#b5d33d' },
    { name: 'Violeta', hex: '#8a5cb8' },
    { name: 'Marrón Oscuro', hex: '#5a3825' },
    { name: 'Chocorojizo', hex: '#7a3b2e' },
  ],
  [
    { name: 'Agua', hex: '#5ec4c0' },
    { name: 'Turquesa/Celeste', hex: '#40b5d8' },
    { name: 'Azul', hex: '#2f5fb3' },
    { name: 'Rojo', hex: '#d0342c' },
    { name: 'Amarillo', hex: '#f5d03b' },
    { name: 'Verde Pasto', hex: '#4c9a3a' },
    { name: 'Verde Menta', hex: '#9fe0c0' },
  ],
  [
    { name: 'Mostaza', hex: '#d4a32a' },
    { name: 'Arena', hex: '#e3cfa8' },
    { name: 'Negro', hex: '#1a1a1a' },
    { name: 'Gris', hex: '#9a9a9a' },
    { name: 'Rosa', hex: '#ef7fa6' },
    { name: 'Lila', hex: '#c4a7e0' },
  ],
];

const KEY = 'pieceColors';

/** Paleta de "Colores utilizados" de las fichas, editable desde el panel. */
@Injectable()
export class PieceColorsService {
  constructor(
    @InjectModel(AppSetting.name)
    private readonly settingModel: Model<AppSettingDocument>,
  ) {}

  async get(): Promise<PieceColor[][]> {
    const doc = await this.settingModel.findOne({ key: KEY }).lean();
    if (!doc) return DEFAULT_PIECE_COLORS;
    try {
      const groups = JSON.parse(doc.value) as PieceColor[][];
      return Array.isArray(groups) ? groups : DEFAULT_PIECE_COLORS;
    } catch {
      return DEFAULT_PIECE_COLORS;
    }
  }

  /** Reemplaza la paleta (lista plana con el grupo de cada color). */
  async set(
    colors: Array<PieceColor & { group: number }>,
  ): Promise<PieceColor[][]> {
    const groups: PieceColor[][] = [];
    for (const c of colors) (groups[c.group] ??= []).push(c);
    const clean = groups
      .filter(Boolean)
      .map((g) =>
        g
          .map((c) => ({ name: c.name.trim(), hex: c.hex.toLowerCase() }))
          .filter((c) => c.name),
      )
      .filter((g) => g.length > 0);
    await this.settingModel.updateOne(
      { key: KEY },
      { $set: { value: JSON.stringify(clean) } },
      { upsert: true },
    );
    return clean;
  }
}
