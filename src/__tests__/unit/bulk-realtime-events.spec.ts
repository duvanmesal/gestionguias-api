import {
  emitGuidesBulkRealtime,
  emitRecaladasBulkRealtime,
} from "../../core/socket/domain-events"
import { socketService } from "../../core/socket/socket.service"

const payload = {
  requested: 5,
  created: 4,
  updated: 1,
  skipped: 0,
  failed: 0,
  mode: "UPSERT",
}

describe("bulk realtime events", () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  it("notifies admins and supervisors after a guide import", () => {
    const emitToAdmins = jest
      .spyOn(socketService, "emitToAdmins")
      .mockImplementation(() => undefined)
    const emitToSupervisors = jest
      .spyOn(socketService, "emitToSupervisors")
      .mockImplementation(() => undefined)

    emitGuidesBulkRealtime(payload)

    const expected = { ...payload, source: "bulk" }
    expect(emitToAdmins).toHaveBeenCalledWith("guides:lookupChanged", expected)
    expect(emitToSupervisors).toHaveBeenCalledWith("guides:lookupChanged", expected)
  })

  it("notifies supervisors once after a recalada import", () => {
    const emitToSupervisors = jest
      .spyOn(socketService, "emitToSupervisors")
      .mockImplementation(() => undefined)

    emitRecaladasBulkRealtime(payload)

    expect(emitToSupervisors).toHaveBeenCalledTimes(1)
    expect(emitToSupervisors).toHaveBeenCalledWith("recalada:bulkChanged", payload)
  })
})
