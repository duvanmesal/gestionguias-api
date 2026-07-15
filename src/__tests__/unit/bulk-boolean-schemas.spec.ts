import {
  bulkBuqueRequestSchema,
  bulkBuqueUploadQuerySchema,
} from "../../modules/buques/buque.schemas";
import {
  bulkPaisRequestSchema,
  bulkPaisUploadQuerySchema,
} from "../../modules/paises/pais.schemas";
import {
  bulkRecaladaRequestSchema,
  bulkRecaladaUploadQuerySchema,
} from "../../modules/recaladas/recalada.schemas";
import {
  bulkGuiaRequestSchema,
  bulkGuiaUploadQuerySchema,
} from "../../modules/users/user.schemas";
import { parseBooleanCell } from "../../libs/bulk/bulk-file";

describe("bulk boolean schemas", () => {
  it("parses false query values without enabling dry run", () => {
    expect(
      bulkGuiaUploadQuerySchema.parse({
        mode: "CREATE_ONLY",
        dryRun: "false",
        sendInvites: "false",
      }),
    ).toMatchObject({ dryRun: false, sendInvites: false });

    expect(
      bulkRecaladaUploadQuerySchema.parse({
        mode: "CREATE_ONLY",
        dryRun: "false",
      }),
    ).toMatchObject({ dryRun: false });

    expect(
      bulkPaisUploadQuerySchema.parse({
        mode: "CREATE_ONLY",
        dryRun: "false",
      }),
    ).toMatchObject({ dryRun: false });

    expect(
      bulkBuqueUploadQuerySchema.parse({
        mode: "CREATE_ONLY",
        dryRun: "false",
        force: "false",
      }),
    ).toMatchObject({ dryRun: false, force: false });
  });

  it("parses true query values explicitly", () => {
    expect(
      bulkGuiaUploadQuerySchema.parse({
        dryRun: "true",
        sendInvites: "true",
      }),
    ).toMatchObject({ dryRun: true, sendInvites: true });

    expect(
      bulkBuqueUploadQuerySchema.parse({
        dryRun: "1",
        force: "1",
      }),
    ).toMatchObject({ dryRun: true, force: true });
  });

  it("parses uppercase boolean cells emitted by XLSX", () => {
    expect(parseBooleanCell("TRUE")).toBe(true);
    expect(parseBooleanCell("FALSE")).toBe(false);
    expect(parseBooleanCell(1)).toBe(true);
    expect(parseBooleanCell(0)).toBe(false);
  });

  it("parses false values from JSON or tabular payloads", () => {
    expect(
      bulkGuiaRequestSchema.parse({
        mode: "CREATE_ONLY",
        dryRun: "false",
        sendInvites: "false",
        items: [
          {
            email: "guia@example.com",
            nombres: "Ana",
            apellidos: "Perez",
            activo: "false",
            disponibleParaTurnos: "false",
          },
        ],
      }),
    ).toMatchObject({
      dryRun: false,
      sendInvites: false,
      items: [{ activo: false, disponibleParaTurnos: false }],
    });

    expect(
      bulkRecaladaRequestSchema.parse({
        dryRun: "false",
        items: [
          {
            buqueId: 1,
            paisOrigenId: 1,
            fechaLlegada: "2026-06-12T08:00:00.000Z",
          },
        ],
      }),
    ).toMatchObject({ dryRun: false });

    expect(
      bulkPaisRequestSchema.parse({
        dryRun: "false",
        items: [{ codigo: "CO", nombre: "Colombia" }],
      }),
    ).toMatchObject({ dryRun: false });

    expect(
      bulkBuqueRequestSchema.parse({
        dryRun: "false",
        force: "false",
        items: [{ codigo: "MSC001", nombre: "MSC Test" }],
      }),
    ).toMatchObject({ dryRun: false, force: false });
  });
});
