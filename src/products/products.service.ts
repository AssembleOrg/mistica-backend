import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto, UpdateProductDto, PaginationDto } from '../common/dto';
import { Product } from '../common/interfaces';
import { PaginatedResponse } from '../common/interfaces';
import { 
  ProductoNoEncontradoException, 
  CodigoBarrasYaExisteException,
  PrecioInvalidoException,
  StockInsuficienteException
} from '../common/exceptions';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createProductDto: CreateProductDto): Promise<Product> {
    const existingProduct = await this.prisma.product.findUnique({
      where: { barcode: createProductDto.barcode },
    });

    if (existingProduct) {
      throw new CodigoBarrasYaExisteException(createProductDto.barcode);
    }

    if (createProductDto.price <= createProductDto.costPrice) {
      throw new PrecioInvalidoException();
    }

    const profitMargin = ((createProductDto.price - createProductDto.costPrice) / createProductDto.costPrice) * 100;

    const product = await this.prisma.product.create({
      data: {
        ...createProductDto,
        profitMargin,
      },
    });

    return product;
  }

  async findAll(paginationDto?: PaginationDto): Promise<PaginatedResponse<Product>> {
    const { page = 1, limit = 10 } = paginationDto || {};
    const skip = (page - 1) * limit;

    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where: { deletedAt: null },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.product.count({
        where: { deletedAt: null },
      }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data: products,
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
    const product = await this.prisma.product.findFirst({
      where: { id, deletedAt: null },
    });

    if (!product) {
      throw new ProductoNoEncontradoException(id);
    }

    return product;
  }

  async update(id: string, updateProductDto: UpdateProductDto): Promise<Product> {
    const existingProduct = await this.findOne(id);

    if (updateProductDto.barcode && updateProductDto.barcode !== existingProduct.barcode) {
      const barcodeExists = await this.prisma.product.findUnique({
        where: { barcode: updateProductDto.barcode },
      });

      if (barcodeExists) {
        throw new CodigoBarrasYaExisteException(updateProductDto.barcode);
      }
    }

    if (updateProductDto.price && updateProductDto.costPrice) {
      if (updateProductDto.price <= updateProductDto.costPrice) {
        throw new PrecioInvalidoException();
      }
    }

    const updateData: any = { ...updateProductDto };
    
    if (updateProductDto.price && updateProductDto.costPrice) {
      updateData.profitMargin = ((updateProductDto.price - updateProductDto.costPrice) / updateProductDto.costPrice) * 100;
    }

    const product = await this.prisma.product.update({
      where: { id },
      data: updateData,
    });

    return product;
  }

  async remove(id: string): Promise<void> {
    await this.findOne(id);

    await this.prisma.product.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async findWithoutPagination(): Promise<Product[]> {
    return this.prisma.product.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
    });
  }

  async updateStock(id: string, quantity: number, operation: 'add' | 'subtract'): Promise<Product> {
    const product = await this.findOne(id);
    
    let newStock: number;
    if (operation === 'add') {
      newStock = product.stock + quantity;
    } else {
      if (product.stock < quantity) {
        throw new StockInsuficienteException(product.name, product.stock, quantity);
      }
      newStock = product.stock - quantity;
    }

    const updatedProduct = await this.prisma.product.update({
      where: { id },
      data: { 
        stock: newStock,
        status: newStock === 0 ? 'out_of_stock' : newStock < 10 ? 'inactive' : 'active'
      },
    });

    return updatedProduct;
  }

  async findByCategory(category: string, paginationDto?: PaginationDto): Promise<PaginatedResponse<Product>> {
    const { page = 1, limit = 10 } = paginationDto || {};
    const skip = (page - 1) * limit;

    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where: { 
          category: category as any,
          deletedAt: null 
        },
        skip,
        take: limit,
        orderBy: { name: 'asc' },
      }),
      this.prisma.product.count({
        where: { 
          category: category as any,
          deletedAt: null 
        },
      }),
    ]);

    const totalPages = Math.ceil(total / limit);

    return {
      data: products,
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
} 