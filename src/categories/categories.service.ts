import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CategoryDocument, ProductDocument } from '../common/schemas';
import { CreateCategoryDto, UpdateCategoryDto } from '../common/dto';

@Injectable()
export class CategoriesService {
  constructor(
    @InjectModel('Category') private readonly categoryModel: Model<CategoryDocument>,
    @InjectModel('Product') private readonly productModel: Model<ProductDocument>,
  ) {}

  private map(doc: CategoryDocument) {
    const o = doc.toObject();
    return {
      id: o._id.toString(),
      name: o.name,
      description: o.description,
      color: o.color,
      createdAt: o.createdAt,
      updatedAt: o.updatedAt,
    };
  }

  async findAll() {
    const docs = await this.categoryModel
      .find({ deletedAt: { $exists: false } })
      .sort({ name: 1 })
      .exec();
    return docs.map((d) => this.map(d));
  }

  async findOne(id: string) {
    const doc = await this.categoryModel.findOne({ _id: id, deletedAt: { $exists: false } }).exec();
    if (!doc) throw new NotFoundException('Categoría no encontrada');
    return this.map(doc);
  }

  async create(dto: CreateCategoryDto) {
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('El nombre es requerido');

    const existing = await this.categoryModel
      .findOne({ name, deletedAt: { $exists: false } })
      .exec();
    if (existing) throw new ConflictException('Ya existe una categoría con ese nombre');

    const doc = await this.categoryModel.create({ ...dto, name });
    return this.map(doc);
  }

  async update(id: string, dto: UpdateCategoryDto) {
    const current = await this.categoryModel.findOne({ _id: id, deletedAt: { $exists: false } }).exec();
    if (!current) throw new NotFoundException('Categoría no encontrada');

    // Si se renombra, validamos unicidad y propagamos a productos asociados.
    const newName = dto.name?.trim();
    if (newName && newName !== current.name) {
      const dup = await this.categoryModel
        .findOne({ name: newName, _id: { $ne: id }, deletedAt: { $exists: false } })
        .exec();
      if (dup) throw new ConflictException('Ya existe una categoría con ese nombre');

      // Migrar productos: los que tenían el nombre viejo pasan al nuevo.
      await this.productModel.updateMany({ category: current.name }, { category: newName }).exec();
    }

    const doc = await this.categoryModel
      .findByIdAndUpdate(id, { ...dto, ...(newName ? { name: newName } : {}) }, { new: true })
      .exec();
    if (!doc) throw new NotFoundException('Categoría no encontrada');
    return this.map(doc);
  }

  async remove(id: string) {
    const cat = await this.categoryModel.findOne({ _id: id, deletedAt: { $exists: false } }).exec();
    if (!cat) throw new NotFoundException('Categoría no encontrada');

    // Bloqueo si hay productos referenciándola. Forzar a recategorizar antes.
    const inUse = await this.productModel
      .countDocuments({ category: cat.name, deletedAt: { $exists: false } })
      .exec();
    if (inUse > 0) {
      throw new BadRequestException(
        `No se puede eliminar: hay ${inUse} producto(s) usando esta categoría`,
      );
    }

    await this.categoryModel.findByIdAndUpdate(id, { deletedAt: new Date() }).exec();
  }
}
