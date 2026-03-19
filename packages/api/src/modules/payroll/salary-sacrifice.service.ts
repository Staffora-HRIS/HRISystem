/**
 * Salary Sacrifice Service (Payroll Sub-Module)
 *
 * Re-exports the standalone salary-sacrifice module's service.
 *
 * The canonical business logic lives in modules/salary-sacrifice/service.ts,
 * including CRUD, NMW validation, and outbox event emission.
 *
 * This file exists so the payroll barrel export (index.ts) can import
 * SalarySacrificeService from within the payroll directory.
 */

export { SalarySacrificeService } from "../salary-sacrifice/service";
