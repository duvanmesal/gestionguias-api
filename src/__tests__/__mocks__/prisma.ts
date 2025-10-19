export const prismaMock = {
  usuario: {
    findUnique: jest.fn(),
    findFirst: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  },
  refreshToken: {
    updateMany: jest.fn(),
  },
  $transaction: jest.fn((fns: any[]) => Promise.all(fns)),
}
