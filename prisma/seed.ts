import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando seed de la base de datos...');

  // Crear usuario administrador
  const adminPassword = await bcrypt.hash('admin123', 10);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@mistica.com' },
    update: {},
    create: {
      email: 'admin@mistica.com',
      name: 'Administrador del Sistema',
      password: adminPassword,
      role: 'admin',
    },
  });
  console.log('✅ Usuario administrador creado:', admin.email);

  // Crear usuario regular
  const userPassword = await bcrypt.hash('user123', 10);
  const user = await prisma.user.upsert({
    where: { email: 'user@mistica.com' },
    update: {},
    create: {
      email: 'user@mistica.com',
      name: 'Usuario Regular',
      password: userPassword,
      role: 'user',
    },
  });
  console.log('✅ Usuario regular creado:', user.email);

  // Crear empleados de ejemplo
  const employees = await Promise.all([
    prisma.employee.upsert({
      where: { email: 'gerente@mistica.com' },
      update: {},
      create: {
        name: 'María González',
        email: 'gerente@mistica.com',
        role: 'gerente',
        phone: '+54 11 1234-5678',
        address: 'Av. Corrientes 1234, Buenos Aires',
        startDate: new Date('2023-01-15'),
      },
    }),
    prisma.employee.upsert({
      where: { email: 'cajero@mistica.com' },
      update: {},
      create: {
        name: 'Carlos Rodríguez',
        email: 'cajero@mistica.com',
        role: 'cajero',
        phone: '+54 11 2345-6789',
        address: 'Calle Florida 567, Buenos Aires',
        startDate: new Date('2023-03-20'),
      },
    }),
    prisma.employee.upsert({
      where: { email: 'mozo@mistica.com' },
      update: {},
      create: {
        name: 'Ana Martínez',
        email: 'mozo@mistica.com',
        role: 'mozo',
        phone: '+54 11 3456-7890',
        address: 'Av. Santa Fe 890, Buenos Aires',
        startDate: new Date('2023-02-10'),
      },
    }),
  ]);

  console.log('✅ Empleados creados:', employees.length);

  // Crear productos de ejemplo
  const products = await Promise.all([
    prisma.product.upsert({
      where: { barcode: '1234567890123' },
      update: {},
      create: {
        name: 'Café Orgánico Premium',
        barcode: '1234567890123',
        category: 'organicos',
        price: 15.99,
        costPrice: 8.50,
        stock: 100,
        unitOfMeasure: 'gramo',
        image: 'https://images.unsplash.com/photo-1447933601403-0c6688de566e?w=400',
        description: 'Café orgánico de alta calidad, cultivado sin pesticidas',
        status: 'active',
        profitMargin: 88.12,
      },
    }),
    prisma.product.upsert({
      where: { barcode: '1234567890124' },
      update: {},
      create: {
        name: 'Té Verde Aromático',
        barcode: '1234567890124',
        category: 'aromaticos',
        price: 12.50,
        costPrice: 6.25,
        stock: 75,
        unitOfMeasure: 'gramo',
        image: 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=400',
        description: 'Té verde con notas florales y cítricas',
        status: 'active',
        profitMargin: 100.00,
      },
    }),
    prisma.product.upsert({
      where: { barcode: '1234567890125' },
      update: {},
      create: {
        name: 'Aceite de Coco Wellness',
        barcode: '1234567890125',
        category: 'wellness',
        price: 25.99,
        costPrice: 15.00,
        stock: 50,
        unitOfMeasure: 'litro',
        image: 'https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=400',
        description: 'Aceite de coco virgen extra para uso culinario y cosmético',
        status: 'active',
        profitMargin: 73.27,
      },
    }),
    prisma.product.upsert({
      where: { barcode: '1234567890126' },
      update: {},
      create: {
        name: 'Miel Orgánica Pura',
        barcode: '1234567890126',
        category: 'organicos',
        price: 18.75,
        costPrice: 10.50,
        stock: 30,
        unitOfMeasure: 'gramo',
        image: 'https://images.unsplash.com/photo-1587049352846-4a222e784d38?w=400',
        description: 'Miel orgánica 100% natural, sin aditivos',
        status: 'active',
        profitMargin: 78.57,
      },
    }),
    prisma.product.upsert({
      where: { barcode: '1234567890127' },
      update: {},
      create: {
        name: 'Especias Gourmet Mix',
        barcode: '1234567890127',
        category: 'aromaticos',
        price: 22.99,
        costPrice: 12.00,
        stock: 45,
        unitOfMeasure: 'gramo',
        image: 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=400',
        description: 'Mezcla exclusiva de especias para cocina gourmet',
        status: 'active',
        profitMargin: 91.58,
      },
    }),
  ]);

  console.log('✅ Productos creados:', products.length);

  console.log('🎉 Seed completado exitosamente!');
  console.log('\n📋 Datos de acceso:');
  console.log('👑 Admin: admin@mistica.com / admin123');
  console.log('👤 User: user@mistica.com / user123');
  console.log('\n🔗 Swagger: http://localhost:3000/api');
}

main()
  .catch((e) => {
    console.error('❌ Error durante el seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  }); 