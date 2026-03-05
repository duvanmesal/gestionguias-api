import type { OverviewQuery } from "./dashboard.schemas";
import type { DashboardOverviewResponse } from "./dashboard.types";

import { getDashboardOverviewUsecase } from "./_usecases/overview.usecase";

type GetOverviewInput = {
  userId: string;
  rol: string;
  query: OverviewQuery;
};

/**
 * Facade del módulo Dashboard.
 * Mantiene la API pública estable para NO afectar routes/.
 */
export class DashboardService {
  static async getOverview(input: GetOverviewInput): Promise<DashboardOverviewResponse> {
    return getDashboardOverviewUsecase(input);
  }
}