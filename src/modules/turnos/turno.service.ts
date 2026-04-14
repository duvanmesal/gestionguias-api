import type { Request } from "express";

import type { ListTurnosMeQuery, ListTurnosQuery } from "./turno.schemas";

import { listTurnosUsecase } from "./_usecases/list.usecase";
import { listTurnosMeUsecase } from "./_usecases/listMe.usecase";
import { getNextTurnoMeUsecase } from "./_usecases/getNextMe.usecase";
import { getActiveTurnoMeUsecase } from "./_usecases/getActiveMe.usecase";
import { getTurnoByIdUsecase } from "./_usecases/getById.usecase";
import { getTurnoByIdForActorUsecase } from "./_usecases/getByIdForActor.usecase";
import { claimTurnoUsecase } from "./_usecases/claim.usecase";
import { assignTurnoUsecase } from "./_usecases/assign.usecase";
import { unassignTurnoUsecase } from "./_usecases/unassign.usecase";
import { cancelTurnoUsecase } from "./_usecases/cancel.usecase";
import { checkInTurnoUsecase } from "./_usecases/checkIn.usecase";
import { checkOutTurnoUsecase } from "./_usecases/checkOut.usecase";
import { noShowTurnoUsecase } from "./_usecases/noShow.usecase";

import type { RolType } from "@prisma/client";

/**
 * Facade del módulo Turnos.
 * Mantiene la API pública estable para NO afectar routes/.
 */
export class TurnoService {
  static list(req: Request, query: ListTurnosQuery) {
    return listTurnosUsecase(req, query);
  }

  static listMe(req: Request, actorUserId: string, query: ListTurnosMeQuery) {
    return listTurnosMeUsecase(req, actorUserId, query);
  }

  static getNextMe(req: Request, actorUserId: string) {
    return getNextTurnoMeUsecase(req, actorUserId);
  }

  static getActiveMe(req: Request, actorUserId: string) {
    return getActiveTurnoMeUsecase(req, actorUserId);
  }

  static getById(req: Request, turnoId: number) {
    return getTurnoByIdUsecase(req, turnoId);
  }

  static getByIdForActor(
    req: Request,
    turnoId: number,
    actorUserId: string,
    actorRol: RolType,
  ) {
    return getTurnoByIdForActorUsecase(req, turnoId, actorUserId, actorRol);
  }

  static claim(req: Request, turnoId: number, actorUserId: string) {
    return claimTurnoUsecase(req, turnoId, actorUserId);
  }

  static assign(
    req: Request,
    turnoId: number,
    guiaId: string,
    actorUserId: string,
  ) {
    return assignTurnoUsecase(req, turnoId, guiaId, actorUserId);
  }

  static unassign(
    req: Request,
    turnoId: number,
    reason: string | undefined,
    actorUserId: string,
    actorRol: RolType,
  ) {
    return unassignTurnoUsecase(req, turnoId, reason, actorUserId, actorRol);
  }

  static cancel(
    req: Request,
    turnoId: number,
    cancelReason: string | undefined,
    actorUserId: string,
  ) {
    return cancelTurnoUsecase(req, turnoId, cancelReason, actorUserId);
  }

  static checkIn(req: Request, turnoId: number, actorUserId: string) {
    return checkInTurnoUsecase(req, turnoId, actorUserId);
  }

  static checkOut(req: Request, turnoId: number, actorUserId: string) {
    return checkOutTurnoUsecase(req, turnoId, actorUserId);
  }

  static noShow(
    req: Request,
    turnoId: number,
    reason: string | undefined,
    actorUserId: string,
  ) {
    return noShowTurnoUsecase(req, turnoId, reason, actorUserId);
  }
}
