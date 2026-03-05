import type { Prisma } from "@prisma/client";

export const invitationListSelect = {
  id: true,
  email: true,
  role: true,
  status: true,
  expiresAt: true,
  usedAt: true,
  createdAt: true,
  inviter: {
    select: {
      id: true,
      email: true,
      nombres: true,
      apellidos: true,
    },
  },
  user: {
    select: {
      id: true,
      email: true,
      profileStatus: true,
    },
  },
} satisfies Prisma.InvitationSelect;

export const invitationMinimalSelect = {
  id: true,
  email: true,
  role: true,
  status: true,
  expiresAt: true,
} satisfies Prisma.InvitationSelect;