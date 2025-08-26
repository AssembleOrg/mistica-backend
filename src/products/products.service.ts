import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { CreateProductDto, UpdateProductDto, PaginationDto } from '../common/dto';
import { Product } from '../common/interfaces';
import { PaginatedResponse } from '../common/interfaces';
import { 
  ProductoNoEncontradoException, 
  CodigoBarrasYaExisteException,
  PrecioInvalidoException,
  StockInsuficienteException
} from '../common/exceptions';
import { ProductDocument } from '../common/schemas';

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

  async findAll(paginationDto?: PaginationDto): Promise<PaginatedResponse<Product>> {
    const { page = 1, limit = 10 } = paginationDto || {};
    const skip = (page - 1) * limit;

    const [products, total] = await Promise.all([
      this.productModel.find({ deletedAt: { $exists: false } })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.productModel.countDocuments({ deletedAt: { $exists: false } }).exec(),
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

  async findByCategory(category: string, paginationDto?: PaginationDto): Promise<PaginatedResponse<Product>> {
    const { page = 1, limit = 10 } = paginationDto || {};
    const skip = (page - 1) * limit;

    const [products, total] = await Promise.all([
      this.productModel.find({
        category,
        deletedAt: { $exists: false }
      })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.productModel.countDocuments({
        category,
        deletedAt: { $exists: false }
      }).exec(),
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