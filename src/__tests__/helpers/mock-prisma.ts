export const mockPrisma = {
  usuario: { findUnique: jest.fn(), update: jest.fn() },
  session: {
    create: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
};
