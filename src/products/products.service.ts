import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  BulkUpdateProductItemDto,
  CreateProductDto,
  PaginatedDateFilterDto,
  UpdateProductDto,
} from '../common/dto';
import { Product } from '../common/interfaces';
import { PaginatedResponse } from '../common/interfaces';
import { 
  ProductoNoEncontradoException, 
  CodigoBarrasYaExisteException,
  PrecioInvalidoException,
  StockInsuficienteException
} from '../common/exceptions';
import { ProductDocument } from '../common/schemas';
import { buildDateFilter } from '../common/utils';

@Injectable()
export class ProductsService {
  constructor(
    @InjectModel('Product') private readonly productModel: Model<ProductDocument>,
  ) {}

  private mapToProductResponse(product: ProductDocument): Product {
    const productObj = product.toObject();
    return {
      id: productObj._id.toString(),
      name: productObj.name,
      barcode: productObj.barcode,
      category: productObj.category,
      price: productObj.price,
      costPrice: productObj.costPrice,
      stock: productObj.stock,
      unitOfMeasure: productObj.unitOfMeasure,
      image: productObj.image,
      description: productObj.description,
      status: productObj.status,
      profitMargin: productObj.profitMargin,
      specialProduct: productObj.specialProduct,
      createdAt: productObj.createdAt,
      updatedAt: productObj.updatedAt,
      deletedAt: productObj.deletedAt,
    };
  }

  async create(createProductDto: CreateProductDto): Promise<Product> {
    const existingProduct = await this.productModel.findOne({
      barcode: createProductDto.barcode,
      deletedAt: { $exists: false }
    }).exec();

    if (existingProduct) {
      throw new CodigoBarrasYaExisteException(createProductDto.barcode);
    }

    if (createProductDto.price <= createProductDto.costPrice) {
      throw new PrecioInvalidoException();
    }

    const profitMargin = ((createProductDto.price - createProductDto.costPrice) / createProductDto.costPrice) * 100;

    const product = await this.productModel.create({
      ...createProductDto,
      profitMargin,
    });

    return this.mapToProductResponse(product);
  }

  async findAll(paginationDto?: PaginatedDateFilterDto): Promise<PaginatedResponse<Product>> {
    const { page = 1, limit = 10, search, from, to } = paginationDto || {};
    const skip = (page - 1) * limit;

    // Construir filtros
    const filters: any = { deletedAt: { $exists: false } };
    
    // Filtro de búsqueda por nombre o código de barras
    if (search) {
      filters.$or = [
        { name: { $regex: search, $options: 'i' } },
        { barcode: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Filtros de fecha
    const dateFilter = buildDateFilter(from, to);
    Object.assign(filters, dateFilter);

    const [products, total] = await Promise.all([
      this.productModel.find(filters)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.productModel.countDocuments(filters).exec(),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data: products.map(product => this.mapToProductResponse(product)),
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

  async findWithoutPagination(): Promise<Product[]> {
    const products = await this.productModel.find({ 
      deletedAt: { $exists: false } 
    }).sort({ createdAt: -1 }).exec();

    return products.map(product => this.mapToProductResponse(product));
  }

  async findByCategory(category: string, paginationDto?: PaginatedDateFilterDto): Promise<PaginatedResponse<Product>> {
    const { page = 1, limit = 10, search, from, to } = paginationDto || {};
    const skip = (page - 1) * limit;

    // Construir filtros
    const filters: any = {
      category,
      deletedAt: { $exists: false }
    };
    
    // Filtro de búsqueda por nombre o código de barras
    if (search) {
      filters.$or = [
        { name: { $regex: search, $options: 'i' } },
        { barcode: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Filtros de fecha
    const dateFilter = buildDateFilter(from, to);
    Object.assign(filters, dateFilter);

    const [products, total] = await Promise.all([
      this.productModel.find(filters)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.productModel.countDocuments(filters).exec(),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data: products.map(product => this.mapToProductResponse(product)),
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

  async findOne(id: string): Promise<Product> {
    const product = await this.productModel.findOne({
      _id: id,
      deletedAt: { $exists: false }
    }).exec();

    if (!product) {
      throw new ProductoNoEncontradoException(id);
    }

    return this.mapToProductResponse(product);
  }

  async update(id: string, updateProductDto: UpdateProductDto): Promise<Product> {
    const existingProduct = await this.findOne(id);

    if (updateProductDto.barcode && updateProductDto.barcode !== existingProduct.barcode) {
      const barcodeExists = await this.productModel.findOne({
        barcode: updateProductDto.barcode,
        _id: { $ne: id },
        deletedAt: { $exists: false }
      }).exec();

      if (barcodeExists) {
        throw new CodigoBarrasYaExisteException(updateProductDto.barcode);
      }
    }

    if (updateProductDto.price && updateProductDto.costPrice) {
      if (updateProductDto.price <= updateProductDto.costPrice) {
        throw new PrecioInvalidoException();
      }
    }

    let updateData = { ...updateProductDto };
    
    if (updateProductDto.price && updateProductDto.costPrice) {
      const profitMargin = ((updateProductDto.price - updateProductDto.costPrice) / updateProductDto.costPrice) * 100;
      updateData.profitMargin = profitMargin;
    }

    const product = await this.productModel.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    ).exec();

    if (!product) {
      throw new ProductoNoEncontradoException(id);
    }

    return this.mapToProductResponse(product);
  }

  /**
   * Bulk-update por barcode (clave de negocio, no _id).
   * - No crea productos: filas con barcode inexistente caen en `notFound`.
   * - Filas con datos inválidos (precio <= costo, etc.) caen en `errors`.
   * - El barcode se ignora dentro de `fields` (es la clave de match, no cambia).
   * - Recalcula `profitMargin` cuando cambian precio o costo.
   * - Single roundtrip a Mongo: una `find` y un `bulkWrite`.
   */
  async bulkUpdateByBarcode(
    items: BulkUpdateProductItemDto[],
  ): Promise<{
    updated: string[];
    notFound: string[];
    errors: Array<{ barcode: string; message: string }>;
  }> {
    const updated: string[] = [];
    const notFound: string[] = [];
    const errors: Array<{ barcode: string; message: string }> = [];

    // Detectar duplicados en el payload
    const seen = new Set<string>();
    const validItems: BulkUpdateProductItemDto[] = [];
    for (const item of items) {
      if (seen.has(item.barcode)) {
        errors.push({ barcode: item.barcode, message: 'Barcode duplicado en el archivo' });
        continue;
      }
      seen.add(item.barcode);
      validItems.push(item);
    }

    if (validItems.length === 0) {
      return { updated, notFound, errors };
    }

    // 1 sola lectura: traer todos los productos que matchean
    const barcodes = validItems.map((i) => i.barcode);
    const existing = await this.productModel
      .find({ barcode: { $in: barcodes }, deletedAt: { $exists: false } })
      .select({ barcode: 1, price: 1, costPrice: 1 })
      .lean()
      .exec();

    const byBarcode = new Map<string, { price: number; costPrice: number }>();
    for (const p of existing) {
      byBarcode.set(p.barcode, { price: p.price, costPrice: p.costPrice });
    }

    // Armar las operaciones del bulkWrite
    const ops: Array<{
      updateOne: {
        filter: Record<string, unknown>;
        update: { $set: Record<string, unknown> };
      };
    }> = [];

    for (const { barcode, fields } of validItems) {
      const current = byBarcode.get(barcode);
      if (!current) {
        notFound.push(barcode);
        continue;
      }

      // El barcode no se cambia en bulk (es el identificador del match).
      const update: Record<string, unknown> = { ...fields };
      delete update.barcode;

      const newPrice = fields.price ?? current.price;
      const newCost = fields.costPrice ?? current.costPrice;

      if (newPrice <= newCost) {
        errors.push({
          barcode,
          message: `Precio (${newPrice}) debe ser mayor al costo (${newCost})`,
        });
        continue;
      }

      // Si cambió precio o costo, recalculo margen
      if (fields.price !== undefined || fields.costPrice !== undefined) {
        update.profitMargin = ((newPrice - newCost) / newCost) * 100;
      }

      // Si no quedó nada para actualizar (todos los fields venían vacíos),
      // saltamos sin reportar error: equivale a "no cambia".
      if (Object.keys(update).length === 0) continue;

      ops.push({
        updateOne: {
          filter: { barcode, deletedAt: { $exists: false } },
          update: { $set: update },
        },
      });
      updated.push(barcode);
    }

    if (ops.length > 0) {
      await this.productModel.bulkWrite(ops, { ordered: false });
    }

    return { updated, notFound, errors };
  }

  async remove(id: string): Promise<void> {
    const product = await this.findOne(id);
    
    await this.productModel.findByIdAndUpdate(id, {
      deletedAt: new Date()
    }).exec();
  }

  async updateStock(id: string, quantity: number, operation: 'add' | 'subtract'): Promise<Product> {
    const product = await this.findOne(id);
    
    let newStock = product.stock;
    if (operation === 'add') {
      newStock += quantity;
    } else if (operation === 'subtract') {
      if (product.stock < quantity) {
        throw new StockInsuficienteException(product.name, product.stock, quantity);
      }
      newStock -= quantity;
    }

    const updatedProduct = await this.productModel.findByIdAndUpdate(
      id,
      { stock: newStock },
      { new: true, runValidators: true }
    ).exec();

    if (!updatedProduct) {
      throw new ProductoNoEncontradoException(id);
    }

    return this.mapToProductResponse(updatedProduct);
  }

  async searchProducts(query: string): Promise<Product[]> {
    const products = await this.productModel.find({
      $and: [
        { deletedAt: { $exists: false } },
        {
          $or: [
            { name: { $regex: query, $options: 'i' } },
            { description: { $regex: query, $options: 'i' } },
            { barcode: { $regex: query, $options: 'i' } }
          ]
        }
      ]
    }).exec();

    return products.map(product => this.mapToProductResponse(product));
  }

  async findProductsByCategory(category: string): Promise<Product[]> {
    const products = await this.productModel.find({
      category,
      deletedAt: { $exists: false }
    }).exec();

    return products.map(product => this.mapToProductResponse(product));
  }

  async findLowStockProducts(threshold: number = 10): Promise<Product[]> {
    const products = await this.productModel.find({
      stock: { $lte: threshold },
      deletedAt: { $exists: false }
    }).exec();

    return products.map(product => this.mapToProductResponse(product));
  }

  async findAllDeleted(): Promise<Product[]> {
    const products = await this.productModel.find({
      deletedAt: { $exists: true }
    }).exec();

    return products.map(product => this.mapToProductResponse(product));
  }

  async restore(id: string): Promise<Product> {
    const product = await this.productModel.findByIdAndUpdate(
      id,
      { $unset: { deletedAt: 1 } },
      { new: true, runValidators: true }
    ).exec();

    if (!product) {
      throw new ProductoNoEncontradoException(id);
    }

    return this.mapToProductResponse(product);
  }
} 