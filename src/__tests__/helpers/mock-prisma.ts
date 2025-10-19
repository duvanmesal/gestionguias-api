import type { PrismaClient } from '@prisma/client';

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

// mock tipado de Prisma con solo lo que usamos en usuarios
export const makePrismaMock = () => {
  const usuario = {
    findMany:    jest.fn(),
    count:       jest.fn(),
    findUnique:  jest.fn(),
    create:      jest.fn(),
    update:      jest.fn(),
  };

  const mock = {
    usuario,
  } as unknown as DeepPartial<PrismaClient>;

  return mock as unknown as PrismaClient & {
    usuario: {
      findMany: jest.Mock;
      count: jest.Mock;
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
  };
};
