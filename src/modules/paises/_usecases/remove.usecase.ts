import { ConflictError, NotFoundError } from "../../../libs/errors"
import { paisRepository } from "../_data/pais.repository"

/**
 * Mantiene la regla existente:
 * - NO eliminar si hay buques asociados
 * - Si no hay buques, se elimina físicamente (delete)
 */
export async function removePaisUsecase(id: number) {
  const exists = await paisRepository.getById(id)
  if (!exists) throw new NotFoundError("País no encontrado")

  const buques = await paisRepository.countBuquesByPaisId(id)
  if (buques > 0) {
    throw new ConflictError("No se puede eliminar el país: existen buques asociados")
  }

  return paisRepository.delete(id)
}