import type { Server } from "socket.io"

let _io: Server | null = null

export const socketService = {
  init(io: Server): void {
    _io = io
  },

  emitToAtencion(atencionId: number, event: string, payload: unknown): void {
    _io?.to(`atencion:${atencionId}`).emit(event, payload)
  },

  emitToGuia(guiaUserId: string, event: string, payload: unknown): void {
    _io?.to(`guia:${guiaUserId}`).emit(event, payload)
  },

  emitToSupervisors(event: string, payload: unknown): void {
    _io?.to("supervisors").emit(event, payload)
  },
}
