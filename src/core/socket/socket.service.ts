import type { Server } from "socket.io"

let _io: Server | null = null

export const socketService = {
  init(io: Server): void {
    _io = io
  },

  emitToUser(userId: string, event: string, payload: unknown): void {
    _io?.to(`user:${userId}`).emit(event, payload)
  },

  emitToSession(sessionId: string, event: string, payload: unknown): void {
    _io?.to(`session:${sessionId}`).emit(event, payload)
  },

  emitToAtencion(atencionId: number, event: string, payload: unknown): void {
    _io?.to(`atencion:${atencionId}`).emit(event, payload)
  },

  emitToRecalada(recaladaId: number, event: string, payload: unknown): void {
    _io?.to(`recalada:${recaladaId}`).emit(event, payload)
  },

  emitToGuia(guiaUserId: string, event: string, payload: unknown): void {
    _io?.to(`guia:${guiaUserId}`).emit(event, payload)
  },

  emitToSupervisors(event: string, payload: unknown): void {
    _io?.to("supervisors").emit(event, payload)
  },

  emitToAdmins(event: string, payload: unknown): void {
    _io?.to("admins").emit(event, payload)
  },
}
