/**
 * Re-export — nguồn sự thật: `shared/vehiclePlateNormalize.mjs`.
 * Cho phép `;` (khớp server + clamp danh bạ).
 */
export {
  normalizeVehiclePlate as normalizeVehiclePlateInput,
  VEHICLE_PLATE_MIN,
} from "../../shared/vehiclePlateNormalize.mjs";
