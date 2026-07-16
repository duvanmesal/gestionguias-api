const path = require("path");
const XLSX = require("xlsx");

const workspaceRoot = path.resolve(__dirname, "../..");

function writeWorkbook(fileName, sheetName, rows, widths) {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  worksheet["!cols"] = widths.map((wch) => ({ wch }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, path.join(workspaceRoot, fileName), { compression: true });
}

writeWorkbook("test-import-guias.xlsx", "Guias", [
  { email: "guia.bulk01@demo.com", nombres: "Carlos Andrés", apellidos: "Martínez López", telefono: "3001234567", documentType: "CC", documentNumber: "1098765432", direccion: "Calle 45 # 12-30 Cartagena", activo: "true", disponible: "true" },
  { email: "guia.bulk02@demo.com", nombres: "María Fernanda", apellidos: "Gómez Ruiz", telefono: "3109876543", documentType: "CC", documentNumber: "52456789", direccion: "Av. El Dorado # 68-95 Bogotá", activo: "true", disponible: "false" },
  { email: "guia.bulk03@demo.com", nombres: "Jhon Alexander", apellidos: "Pérez Torres", telefono: "3207654321", documentType: "CE", documentNumber: "987654", direccion: "Carrera 10 # 23-45 Barranquilla", activo: "true", disponible: "true" },
  { email: "guia.bulk04@demo.com", nombres: "Ana Lucía", apellidos: "Rodríguez Díaz", telefono: "3154321098", documentType: "PAS", documentNumber: "AB123456", direccion: "Calle 80 # 45-12 Medellín", activo: "true", disponible: "true" },
  { email: "guia.bulk05@demo.com", nombres: "Luis Fernando", apellidos: "Castro Vargas", telefono: "3001111222", documentType: "CC", documentNumber: "80123456", direccion: "Calle 1 # 1-01 Cali", activo: "false", disponible: "false" },
], [28, 20, 20, 16, 16, 20, 38, 12, 14]);

writeWorkbook("test-import-recaladas.xlsx", "Recaladas", [
  { codigoRecalada: "", buqueCodigo: "B-002", paisOrigenCodigo: "CO", supervisorEmail: "duvanmesa2415@gmail.com", slotNumero: 1, fechaLlegada: "2026-07-17T08:00:00-05:00", fechaSalida: "2026-07-18T16:00:00-05:00", pasajerosEstimados: 2500, tripulacionEstimada: 350, observaciones: "Crucero de prueba 1" },
  { codigoRecalada: "", buqueCodigo: "B-002", paisOrigenCodigo: "CO", supervisorEmail: "duvanmesa2415@gmail.com", slotNumero: 2, fechaLlegada: "2026-07-24T09:00:00-05:00", fechaSalida: "2026-07-25T15:00:00-05:00", pasajerosEstimados: 1800, tripulacionEstimada: 280, observaciones: "Crucero de prueba 2" },
  { codigoRecalada: "", buqueCodigo: "B-002", paisOrigenCodigo: "US", supervisorEmail: "duvanmesa2415@gmail.com", slotNumero: 3, fechaLlegada: "2026-08-01T08:30:00-05:00", fechaSalida: "2026-08-02T14:00:00-05:00", pasajerosEstimados: 3200, tripulacionEstimada: 420, observaciones: "Crucero con origen USA" },
  { codigoRecalada: "", buqueCodigo: "B-002", paisOrigenCodigo: "CO", supervisorEmail: "duvanmesa2415@gmail.com", slotNumero: 4, fechaLlegada: "2026-08-08T10:00:00-05:00", fechaSalida: "", pasajerosEstimados: 900, tripulacionEstimada: 120, observaciones: "Sin fecha de zarpe" },
], [20, 16, 20, 30, 14, 30, 30, 22, 22, 34]);

console.log("Bulk XLSX examples regenerated");
